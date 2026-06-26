/**
 * SVG → GeoJSON converter (port of tools/svg_to_geojson/converter.py).
 *
 * Public API:
 *   parseSvgInfo(svgText)        → { viewBox, layers, sublayers }
 *   convertSvg(svgText, opts)    → { geojson, stats, center }
 *
 * Algorithm parity: the goal is feature-equivalence with the reference
 * Python converter for the inMapper SVG schema (groups: Rooms/Walking/
 * Building/Stand/…, Paths, Doors, Portals, Writing, Icons, Constants).
 *
 * NOT a general-purpose SVG parser. Only the constructs the reference
 * converter handled are supported (M/m, L/l, H/h, V/v, Z/z paths, lines,
 * circles inside Rooms, simple `translate()` and `rotate()` transforms).
 */

import { GeoTransform } from '../../core/geo-transform.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape';

const ROOM_GROUPS = [
    'Walking','Building','Stand','Service','Food',
    'Water','Other','Shop','Green','Medical','Commercial','Social',
];

/* ── Path parsing ─────────────────────────────────────────────────────── */

const TOKEN_RE = /[a-df-zA-DF-Z]|[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g;

function parsePathD(d) {
    const tokens = d.match(TOKEN_RE) || [];
    const commands = [];
    let i = 0;
    while (i < tokens.length) {
        const t = tokens[i];
        if (/^[a-zA-Z]$/.test(t)) {
            const cmd = t;
            i += 1;
            const coords = [];
            while (i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])) {
                coords.push(parseFloat(tokens[i]));
                i += 1;
            }
            commands.push([cmd, coords]);
        } else {
            i += 1;
        }
    }
    return commands;
}

/**
 * Walk an SVG path's `d` attribute and return one *ring* per subpath
 * (each `M`/`m` opens a new ring). This is the primitive every room /
 * polygon parser builds on — keeping subpaths separate is what stops
 * compound paths (`M ... Z M ... Z`) from being flattened into a
 * single polygon with long bogus connector edges between disjoint
 * pieces.
 *
 * Returns: `[ [[x,y], …], … ]` — outer arrays = rings, inner = points.
 * Empty rings (length < 2) are filtered out.
 */
function pathToRings(d) {
    const commands = parsePathD(d);
    const rings = [];
    let current = null;
    let cx = 0, cy = 0, sx = 0, sy = 0;

    const startRing = () => {
        current = [];
        rings.push(current);
    };

    for (const [cmd, coords] of commands) {
        if (cmd === 'm') {
            // Per SVG spec: relative `m` after the *first* moveto
            // is relative to the current pen position.
            if (rings.length === 0) {
                cx = coords[0]; cy = coords[1];
            } else {
                cx += coords[0]; cy += coords[1];
            }
            startRing();
            sx = cx; sy = cy;
            current.push([cx, cy]);
            // Subsequent coordinate pairs after `m` are implicit `l`
            // (lineto) with the same relative semantics.
            for (let i = 2; i < coords.length; i += 2) {
                cx += coords[i]; cy += coords[i + 1];
                current.push([cx, cy]);
            }
        } else if (cmd === 'M') {
            cx = coords[0]; cy = coords[1];
            startRing();
            sx = cx; sy = cy;
            current.push([cx, cy]);
            // Subsequent pairs after `M` are implicit `L`.
            for (let i = 2; i < coords.length; i += 2) {
                cx = coords[i]; cy = coords[i + 1];
                current.push([cx, cy]);
            }
        } else if (cmd === 'l') {
            if (!current) startRing();
            for (let i = 0; i < coords.length; i += 2) {
                cx += coords[i]; cy += coords[i + 1];
                current.push([cx, cy]);
            }
        } else if (cmd === 'L') {
            if (!current) startRing();
            for (let i = 0; i < coords.length; i += 2) {
                cx = coords[i]; cy = coords[i + 1];
                current.push([cx, cy]);
            }
        } else if (cmd === 'h') {
            if (!current) startRing();
            for (const v of coords) { cx += v; current.push([cx, cy]); }
        } else if (cmd === 'H') {
            if (!current) startRing();
            for (const v of coords) { cx = v;  current.push([cx, cy]); }
        } else if (cmd === 'v') {
            if (!current) startRing();
            for (const v of coords) { cy += v; current.push([cx, cy]); }
        } else if (cmd === 'V') {
            if (!current) startRing();
            for (const v of coords) { cy = v;  current.push([cx, cy]); }
        } else if (cmd === 'z' || cmd === 'Z') {
            if (current && current.length && (cx !== sx || cy !== sy)) {
                current.push([sx, sy]);
            }
            cx = sx; cy = sy;
        }
    }
    return rings.filter(r => r.length >= 2);
}

/**
 * Legacy flat-coordinates accessor. Kept for callers that don't care
 * about subpaths (e.g. the very first vertex of a one-line path).
 * For polygon-building, prefer `pathToRings()` so disjoint subpaths
 * stay separate instead of being joined by phantom edges.
 */
function pathToAbsoluteCoords(d) {
    const rings = pathToRings(d);
    return rings.length === 0 ? [] : rings[0];
}

function pathToLineCoords(d) {
    const commands = parsePathD(d);
    if (commands.length < 2) {
        if (commands.length === 1) {
            const [cmd, c] = commands[0];
            if (cmd === 'm' && c.length >= 4) return [c[0], c[1], c[0] + c[2], c[1] + c[3]];
            if (cmd === 'M' && c.length >= 4) return [c[0], c[1], c[2], c[3]];
        }
        return null;
    }
    const [cmd0, c0] = commands[0];
    const x1 = c0[0] ?? 0;
    const y1 = c0[1] ?? 0;
    const [cmd1, c1] = commands[1];
    if (cmd1 === 'h') return [x1, y1, x1 + c1[0], y1];
    if (cmd1 === 'H') return [x1, y1, c1[0], y1];
    if (cmd1 === 'v') return [x1, y1, x1, y1 + c1[0]];
    if (cmd1 === 'V') return [x1, y1, x1, c1[0]];
    if (cmd1 === 'l') return [x1, y1, x1 + c1[0], y1 + c1[1]];
    if (cmd1 === 'L') return [x1, y1, c1[0], c1[1]];
    if (cmd1 === 'm') return [x1, y1, x1 + c1[0], y1 + c1[1]];
    const dx = c1[0] ?? 0;
    const dy = c1[1] ?? 0;
    if (cmd0 === 'm') return [x1, y1, x1 + dx, y1 + dy];
    return [x1, y1, dx, dy];
}

export { GeoTransform };

const round8 = (n) => Math.round(n * 1e8) / 1e8;

/* ── DOM helpers ──────────────────────────────────────────────────────── */

function parseSvgDoc(text) {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const errNode = doc.querySelector('parsererror');
    if (errNode) {
        throw new Error('SVG parse error: ' + (errNode.textContent || 'invalid SVG'));
    }
    return doc;
}

function parseTransformTranslate(elem) {
    const t = elem?.getAttribute?.('transform') || '';
    const m = /translate\(\s*([-\d.eE+]+)[,\s]+([-\d.eE+]+)\s*\)/.exec(t);
    if (m) return [parseFloat(m[1]), parseFloat(m[2])];
    return [0, 0];
}

function applyTx(coords, tx, ty) {
    if (tx === 0 && ty === 0) return coords;
    return coords.map(([x, y]) => [x + tx, y + ty]);
}

/** Append the first vertex to the end if it isn't already (GeoJSON
 *  rings must close on themselves). Returns the same ring instance
 *  when already closed, a new array otherwise. */
function closeRing(ring) {
    if (ring.length < 2) return ring;
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) return ring;
    return [...ring, [a[0], a[1]]];
}

/* SVG namespace queries — DOM uses URI for ns, label attrs use a custom one. */
function findGroup(root, gid) {
    let g = root.querySelector(`g[id="${cssEscape(gid)}"]`);
    if (g) return g;
    const groups = root.getElementsByTagNameNS(SVG_NS, 'g');
    for (const el of groups) {
        if (el.getAttributeNS(INKSCAPE_NS, 'label') === gid) return el;
    }
    return null;
}

function cssEscape(s) {
    if (window.CSS?.escape) return window.CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch);
}

function childGroups(parent) {
    return [...parent.children].filter(el => el.tagName.toLowerCase() === 'g');
}
function childPaths(parent) {
    return [...parent.children].filter(el => el.tagName.toLowerCase() === 'path');
}

/* ── SVG parser (mirrors converter.py SvgParser) ──────────────────────── */

class SvgParser {
    constructor(svgText) {
        this.doc = parseSvgDoc(svgText);
        this.root = this.doc.documentElement;

        const vbAttr = this.root.getAttribute('viewBox') || '0 0 100 100';
        const vb = vbAttr.split(/\s+/).map(parseFloat);
        this.vbX = vb[0]; this.vbY = vb[1];
        this.width = vb[2]; this.height = vb[3];
    }

    parseRooms() {
        const roomsG = findGroup(this.root, 'Rooms');
        if (!roomsG) return {};
        const [tx, ty] = parseTransformTranslate(roomsG);
        const result = {};

        // Subgroups (Walking/Building/…)
        for (const childG of childGroups(roomsG)) {
            const layerName = childG.getAttribute('id') || childG.getAttributeNS(INKSCAPE_NS, 'label');
            if (!layerName) continue;

            const fill = childG.getAttribute('fill');
            const stroke = childG.getAttribute('stroke');
            const items = [];

            for (const pathEl of childPaths(childG)) {
                const d = pathEl.getAttribute('d');
                const pid = pathEl.getAttribute('id') || 'unknown';
                if (!d) continue;
                const [etx, ety] = parseTransformTranslate(pathEl);
                const rings = pathToRings(d)
                    .filter(r => r.length >= 3)
                    .map(r => closeRing(applyTx(r, etx + tx, ety + ty)));
                if (rings.length === 0) continue;

                items.push({
                    id: pid,
                    rings,                     // every subpath kept separate
                    coords: rings[0],         // legacy: first ring (label-area, walking-overlap)
                    fill: pathEl.getAttribute('fill') || fill,
                    stroke,
                    stroke_width: pathEl.getAttribute('stroke-width'),
                });
            }
            if (items.length) result[layerName] = items;
        }

        // Direct children of Rooms (path / circle) → "Structure" pseudo-layer
        const structure = [];
        for (const child of [...roomsG.children]) {
            const tag = child.tagName.toLowerCase();
            if (tag === 'g') continue;
            const cid = child.getAttribute('id') || 'unknown';

            if (tag === 'path') {
                const d = child.getAttribute('d');
                if (!d) continue;
                const [etx, ety] = parseTransformTranslate(child);
                const rings = pathToRings(d)
                    .filter(r => r.length >= 3)
                    .map(r => closeRing(applyTx(r, etx + tx, ety + ty)));
                if (rings.length) {
                    structure.push({
                        id: cid,
                        rings,
                        coords: rings[0],
                        fill: child.getAttribute('fill'),
                        stroke: child.getAttribute('stroke') || '#969696',
                        stroke_width: child.getAttribute('stroke-width'),
                    });
                }
            } else if (tag === 'circle') {
                const cxV = parseFloat(child.getAttribute('cx') || '0');
                const cyV = parseFloat(child.getAttribute('cy') || '0');
                const r   = parseFloat(child.getAttribute('r')  || '0');
                const n = 24;
                let coords = [];
                for (let i = 0; i < n; i++) {
                    const a = 2 * Math.PI * i / n;
                    coords.push([cxV + r * Math.cos(a), cyV + r * Math.sin(a)]);
                }
                coords.push([coords[0][0], coords[0][1]]);
                const [etx, ety] = parseTransformTranslate(child);
                coords = applyTx(coords, etx + tx, ety + ty);
                structure.push({
                    id: cid,
                    rings: [coords],
                    coords,
                    fill: child.getAttribute('fill') || '#f5f5f5',
                    stroke: child.getAttribute('stroke') || '#969696',
                    stroke_width: child.getAttribute('stroke-width'),
                });
            }
        }
        if (structure.length) {
            result.Structure = (result.Structure || []).concat(structure);
        }
        return result;
    }

    _parseLineGroup(groupId) {
        const g = findGroup(this.root, groupId);
        if (!g) return [];
        const [tx, ty] = parseTransformTranslate(g);
        const segments = [];
        for (const el of [...g.children]) {
            const tag = el.tagName.toLowerCase();
            const eid = el.getAttribute('id') || '';
            const stroke = el.getAttribute('stroke');
            const [etx, ety] = parseTransformTranslate(el);
            const totalTx = etx + tx;
            const totalTy = ety + ty;

            if (tag === 'line') {
                const x1 = parseFloat(el.getAttribute('x1') || '0') + totalTx;
                const y1 = parseFloat(el.getAttribute('y1') || '0') + totalTy;
                const x2 = parseFloat(el.getAttribute('x2') || '0') + totalTx;
                const y2 = parseFloat(el.getAttribute('y2') || '0') + totalTy;
                segments.push({ id: eid, x1, y1, x2, y2, stroke });
            } else if (tag === 'path') {
                const d = el.getAttribute('d');
                if (!d) continue;
                const lc = pathToLineCoords(d);
                if (lc) {
                    segments.push({
                        id: eid,
                        x1: lc[0] + totalTx, y1: lc[1] + totalTy,
                        x2: lc[2] + totalTx, y2: lc[3] + totalTy,
                        stroke,
                    });
                }
            }
        }
        return segments;
    }
    parsePaths()   { return this._parseLineGroup('Paths'); }
    parseDoors()   { return this._parseLineGroup('Doors'); }
    parsePortals() { return this._parseLineGroup('Portals'); }

    parseWriting() {
        const g = findGroup(this.root, 'Writing');
        if (!g) return [];
        const [tx, ty] = parseTransformTranslate(g);
        const transform = g.getAttribute('transform') || '';
        let rotation = 0, rotCx = 0, rotCy = 0;
        const m = /rotate\(\s*([-\d.eE+]+)(?:[,\s]+([-\d.eE+]+)[,\s]+([-\d.eE+]+))?\s*\)/.exec(transform);
        if (m) {
            rotation = parseFloat(m[1]);
            if (m[2] !== undefined) {
                rotCx = parseFloat(m[2]);
                rotCy = parseFloat(m[3]);
            }
        }

        const labels = [];
        const texts = g.getElementsByTagNameNS(SVG_NS, 'text');
        for (const txt of texts) {
            // Only direct children of <Writing>
            if (txt.parentNode !== g) continue;
            let x = parseFloat(txt.getAttribute('x') || '0');
            let y = parseFloat(txt.getAttribute('y') || '0');
            const fs = txt.getAttribute('font-size') || '12';
            const tspans = [...txt.getElementsByTagNameNS(SVG_NS, 'tspan')];
            const lines = tspans.map(ts => ts.textContent || '');
            const tid = txt.getAttribute('id') || '';

            if (rotation !== 0) {
                const rad = rotation * Math.PI / 180;
                const dx = x - rotCx;
                const dy = y - rotCy;
                const rx = dx * Math.cos(rad) - dy * Math.sin(rad) + rotCx;
                const ry = dx * Math.sin(rad) + dy * Math.cos(rad) + rotCy;
                x = rx; y = ry;
            }
            const [etx, ety] = parseTransformTranslate(txt);
            x += etx + tx;
            y += ety + ty;
            labels.push({
                id: tid, x, y,
                text: lines.join('\n'),
                lines,
                font_size: fs,
                rotation,
            });
        }
        return labels;
    }

    _parseIconGroup(groupId) {
        const g = findGroup(this.root, groupId);
        if (!g) return [];
        const [tx, ty] = parseTransformTranslate(g);
        const icons = [];

        for (const child of [...g.children]) {
            const tag = child.tagName.toLowerCase();
            const cid = child.getAttribute('id') || '';

            if (tag === 'g') {
                const paths = child.getElementsByTagNameNS(SVG_NS, 'path');
                let allCoords = [];
                for (const p of paths) {
                    const d = p.getAttribute('d');
                    if (!d) continue;
                    try { allCoords = allCoords.concat(pathToAbsoluteCoords(d)); }
                    catch { /* ignore */ }
                }
                if (allCoords.length) {
                    const cx = allCoords.reduce((s, c) => s + c[0], 0) / allCoords.length + tx;
                    const cy = allCoords.reduce((s, c) => s + c[1], 0) / allCoords.length + ty;
                    icons.push({ id: cid, x: cx, y: cy, type: groupId.toLowerCase() });
                }
            } else if (tag === 'path') {
                const d = child.getAttribute('d') || '';
                if (!d) continue;
                try {
                    const coords = pathToAbsoluteCoords(d);
                    if (coords.length) {
                        const cx = coords.reduce((s, c) => s + c[0], 0) / coords.length + tx;
                        const cy = coords.reduce((s, c) => s + c[1], 0) / coords.length + ty;
                        icons.push({ id: cid, x: cx, y: cy, type: groupId.toLowerCase() });
                    }
                } catch { /* ignore */ }
            }
        }
        return icons;
    }
    parseIcons()     { return this._parseIconGroup('Icons'); }
    parseConstants() { return this._parseIconGroup('Constants'); }
}

/* ── Geometry helpers ─────────────────────────────────────────────────── */

function bboxOverlapRatio(coords, x0, y0, x1, y1) {
    const xs = coords.map(c => c[0]);
    const ys = coords.map(c => c[1]);
    const bx0 = Math.min(...xs), by0 = Math.min(...ys);
    const bx1 = Math.max(...xs), by1 = Math.max(...ys);
    const bw = bx1 - bx0, bh = by1 - by0;
    if (bw <= 0 || bh <= 0) return 0;
    const ox0 = Math.max(bx0, x0);
    const oy0 = Math.max(by0, y0);
    const ox1 = Math.min(bx1, x1);
    const oy1 = Math.min(by1, y1);
    if (ox1 <= ox0 || oy1 <= oy0) return 0;
    return ((ox1 - ox0) * (oy1 - oy0)) / (bw * bh);
}

function polygonArea(coords) {
    const n = coords.length;
    if (n < 3) return 0;
    let area = 0;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += coords[i][0] * coords[j][1];
        area -= coords[j][0] * coords[i][1];
    }
    return Math.abs(area) / 2;
}

function pointInPolygon(px, py, coords) {
    const n = coords.length;
    let inside = false;
    let j = n - 1;
    for (let i = 0; i < n; i++) {
        const [xi, yi] = coords[i];
        const [xj, yj] = coords[j];
        if (((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
        j = i;
    }
    return inside;
}

/* ── GeoJSON builder ──────────────────────────────────────────────────── */

const SKIP_SUBLAYERS = new Set(['walking', 'building']);

function buildGeoJson(parser, transform) {
    const features = [];

    const contentMaxX = transform.originX + transform.svgW;
    const contentMaxY = transform.originY + transform.svgH;
    const marginX = transform.svgW * 0.1;
    const marginY = transform.svgH * 0.1;

    const roomPolys = [];  // [{id, sublayer, coords, area}]
    const rooms = parser.parseRooms();
    for (const [layerName, items] of Object.entries(rooms)) {
        const isWalking = layerName.toLowerCase() === 'walking';
        for (const item of items) {
            // Backwards-compat: items from an older parseRooms shape
            // may only carry `coords`. Promote it to a single-ring list.
            const rings = item.rings && item.rings.length
                ? item.rings
                : (item.coords ? [item.coords] : []);
            if (rings.length === 0) continue;

            if (isWalking) {
                // Walking layer can sprawl outside the SVG content area —
                // gate on overlap with the union bbox instead of any one
                // ring so multi-piece walking polygons aren't dropped
                // because their first ring happens to be off-canvas.
                const allPts = rings.flat();
                const ratio = bboxOverlapRatio(
                    allPts,
                    transform.originX - marginX,
                    transform.originY - marginY,
                    contentMaxX + marginX,
                    contentMaxY + marginY,
                );
                if (ratio < 0.05) continue;
            }

            // Convert every ring to lng/lat. Each ring becomes its own
            // OUTER ring of a MultiPolygon (no hole detection — that
            // would require nested-ring containment tests which floor
            // plan SVGs almost never need). Single-ring case stays a
            // plain Polygon for backwards compatibility.
            const geoRings = rings.map(r => r.map(([x, y]) => transform.toLngLat(x, y)));
            const geometry = geoRings.length === 1
                ? { type: 'Polygon', coordinates: [geoRings[0]] }
                : { type: 'MultiPolygon', coordinates: geoRings.map(r => [r]) };

            features.push({
                type: 'Feature',
                properties: {
                    id: item.id,
                    layer: 'rooms',
                    sublayer: layerName.toLowerCase(),
                    fill: item.fill,
                    stroke: item.stroke,
                    stroke_width: item.stroke_width,
                },
                geometry,
            });
            if (!SKIP_SUBLAYERS.has(layerName.toLowerCase())) {
                // For label hit-testing pick the ring with the largest
                // area (the user's labels almost always land in the
                // dominant piece of a compound room). Total area sums
                // every ring so 3D extrusions don't underestimate.
                let largest = rings[0];
                let largestA = Math.abs(polygonArea(largest));
                let totalArea = largestA;
                for (let i = 1; i < rings.length; i++) {
                    const a = Math.abs(polygonArea(rings[i]));
                    totalArea += a;
                    if (a > largestA) { largest = rings[i]; largestA = a; }
                }
                roomPolys.push({
                    id: item.id, sublayer: layerName.toLowerCase(),
                    coords: largest, area: totalArea,
                });
            }
        }
    }

    function pushLineSegments(segs, layer) {
        for (const seg of segs) {
            const p1 = transform.toLngLat(seg.x1, seg.y1);
            const p2 = transform.toLngLat(seg.x2, seg.y2);
            features.push({
                type: 'Feature',
                properties: { id: seg.id, layer, stroke: seg.stroke },
                geometry: { type: 'LineString', coordinates: [p1, p2] },
            });
        }
    }
    pushLineSegments(parser.parsePaths(),   'paths');
    pushLineSegments(parser.parseDoors(),   'doors');
    pushLineSegments(parser.parsePortals(), 'portals');

    // Writing labels: zoom-tiered font size based on parent room area.
    const areas = roomPolys.map(r => r.area).filter(a => a > 0).sort((a, b) => a - b);
    let t1, t2;
    if (areas.length >= 3) {
        t1 = areas[Math.floor(areas.length / 3)];
        t2 = areas[Math.floor(2 * areas.length / 3)];
    } else if (areas.length >= 1) {
        t1 = areas[0]; t2 = areas[areas.length - 1];
    } else {
        t1 = 100; t2 = 500;
    }

    for (const lbl of parser.parseWriting()) {
        const lx = lbl.x, ly = lbl.y;
        const pt = transform.toLngLat(lx, ly);

        let matchedArea = 0;
        for (const rp of roomPolys) {
            if (pointInPolygon(lx, ly, rp.coords)) { matchedArea = rp.area; break; }
        }
        if (matchedArea <= 0 && roomPolys.length) {
            let bestDist = Infinity;
            for (const rp of roomPolys) {
                const cx = rp.coords.reduce((s, c) => s + c[0], 0) / rp.coords.length;
                const cy = rp.coords.reduce((s, c) => s + c[1], 0) / rp.coords.length;
                const dd = (lx - cx) ** 2 + (ly - cy) ** 2;
                if (dd < bestDist) { bestDist = dd; matchedArea = rp.area; }
            }
        }
        let fs;
        if (matchedArea <= t1) fs = 8;
        else if (matchedArea <= t2) fs = 12;
        else fs = 18;

        features.push({
            type: 'Feature',
            properties: {
                id: lbl.id, layer: 'writing',
                text: lbl.text, lines: lbl.lines,
                font_size: fs, room_area: Math.round(matchedArea * 10) / 10,
            },
            geometry: { type: 'Point', coordinates: pt },
        });
    }

    return { type: 'FeatureCollection', features };
}

function computeContentExtent(parser) {
    const xs = [], ys = [];
    const rooms = parser.parseRooms();
    for (const [layerName, items] of Object.entries(rooms)) {
        if (layerName.toLowerCase() === 'walking') continue;
        for (const it of items) {
            for (const [x, y] of it.coords) { xs.push(x); ys.push(y); }
        }
    }
    for (const seg of parser.parsePaths()) {
        xs.push(seg.x1, seg.x2);
        ys.push(seg.y1, seg.y2);
    }
    if (xs.length && ys.length) {
        const ox = Math.min(...xs), oy = Math.min(...ys);
        return [ox, oy, Math.max(...xs) - ox, Math.max(...ys) - oy];
    }
    return [0, 0, parser.width, parser.height];
}

/* ── Public API ───────────────────────────────────────────────────────── */

export function parseSvgInfo(svgText) {
    const parser = new SvgParser(svgText);
    const rooms = parser.parseRooms();
    const sublayerCounts = {};
    let roomCount = 0;
    for (const [k, v] of Object.entries(rooms)) {
        sublayerCounts[k] = v.length;
        roomCount += v.length;
    }
    return {
        viewBox: { width: parser.width, height: parser.height },
        layers: {
            rooms: roomCount,
            paths: parser.parsePaths().length,
            doors: parser.parseDoors().length,
            portals: parser.parsePortals().length,
            writing: parser.parseWriting().length,
        },
        sublayers: sublayerCounts,
    };
}

export function convertSvg(svgText, {
    centerLat = 0, centerLng = 0, scale = 0.03, rotation = 0,
} = {}) {
    const parser = new SvgParser(svgText);
    const [ox, oy, cw, ch] = computeContentExtent(parser);
    const transform = new GeoTransform(cw, ch, {
        centerLat, centerLng, scale, rotation,
        originX: ox, originY: oy,
    });
    const geojson = buildGeoJson(parser, transform);

    const stats = {};
    for (const f of geojson.features) {
        const l = f.properties.layer;
        stats[l] = (stats[l] || 0) + 1;
    }
    return {
        geojson,
        stats,
        center: [centerLng, centerLat],
        viewBox: { width: parser.width, height: parser.height },
        contentExtent: { originX: ox, originY: oy, width: cw, height: ch },
    };
}
