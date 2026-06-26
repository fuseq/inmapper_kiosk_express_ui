/**
 * SVG -> routing primitives.
 *
 * Port of the backend `helpers/extract_xml.py` (build_graph + get_room_areas):
 * reads the `Paths`, `Doors`, `Portals` and `Rooms` groups out of a floor SVG
 * and returns flat connection segments plus room polygons (with area-weighted
 * centroids). Everything stays in SVG pixel coordinates, exactly like the
 * backend, so adjacency tolerances and metrics match.
 *
 * Connection: { id, type: 'path'|'door'|'portal', x1, y1, x2, y2, layerId, status }
 * Room:       { id, area, center: [x, y], coordinates: [[x, y], ...] }
 */

import { parseXml, findGroup, findAllByTag, childrenByTag, localName } from './mini-xml.js';

const NUM = '[-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?';

/* ---- low level path-data helpers (mirror extract_xml.py) --------------- */

/**
 * Convert a simple 2-point SVG path `d` into a line segment.
 * Supports the forms emitted for paths/doors/portals:
 *   "M x,y H X", "m x,y h dx", "M x,y V Y", "M x,y L X,Y",
 *   "m x,y dx,dy" (implicit lineto), "M x,y X,Y".
 * Returns { x1, y1, x2, y2 } or null.
 */
export function pathToLine(d) {
    if (!d) return null;
    const tokens = d.trim().split(/[\s,]+/).filter(Boolean);
    if (tokens.length < 3) return null;

    const first = tokens[0];
    if (first !== 'm' && first !== 'M') return null;

    const x1 = parseFloat(tokens[1]);
    const y1 = parseFloat(tokens[2]);
    if (Number.isNaN(x1) || Number.isNaN(y1)) return null;
    let x2 = x1, y2 = y1;

    const rest = tokens.slice(3);
    if (!rest.length) return { x1, y1, x2, y2 };

    const isNumber = !Number.isNaN(parseFloat(rest[0])) && /^[-+]?[0-9.]/.test(rest[0]);
    if (isNumber) {
        if (rest.length < 2) return { x1, y1, x2, y2 };
        const dx = parseFloat(rest[0]);
        const dy = parseFloat(rest[1]);
        if (first === 'm') { x2 = x1 + dx; y2 = y1 + dy; }
        else { x2 = dx; y2 = dy; }
        return { x1, y1, x2, y2 };
    }

    const cmd = rest[0];
    const cmdL = cmd.toLowerCase();
    const absolute = cmd === cmd.toUpperCase();

    if (cmdL === 'h') {
        const v = parseFloat(rest[1]);
        x2 = absolute ? v : x1 + v;
        y2 = y1;
    } else if (cmdL === 'v') {
        const v = parseFloat(rest[1]);
        x2 = x1;
        y2 = absolute ? v : y1 + v;
    } else if (cmdL === 'l') {
        const dx = parseFloat(rest[1]);
        const dy = parseFloat(rest[2]);
        if (absolute) { x2 = dx; y2 = dy; }
        else { x2 = x1 + dx; y2 = y1 + dy; }
    }
    return { x1, y1, x2, y2 };
}

/** Tokenize an SVG path `d` into [{ cmd, coords:[..] }] (preserves case). */
function parsePathD(d) {
    const tokens = d.match(new RegExp(`[a-df-zA-DF-Z]|${NUM}`, 'g')) || [];
    const out = [];
    let i = 0;
    while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) {
            const cmd = tokens[i];
            i += 1;
            const coords = [];
            while (i < tokens.length && !/[a-zA-Z]/.test(tokens[i])) {
                coords.push(parseFloat(tokens[i]));
                i += 1;
            }
            out.push({ cmd, coords });
        } else {
            i += 1;
        }
    }
    return out;
}

/** Convert a full SVG path `d` into an absolute polygon point list. */
export function pathToAbsolutePoints(d) {
    const commands = parsePathD(d);
    const points = [];
    let cx = 0, cy = 0, sx = 0, sy = 0;

    for (const { cmd, coords } of commands) {
        if (cmd === 'm') {
            if (!points.length) { cx = coords[0]; cy = coords[1]; }
            else { cx += coords[0]; cy += coords[1]; }
            sx = cx; sy = cy;
            points.push([cx, cy]);
            for (let i = 2; i + 1 < coords.length; i += 2) {
                cx += coords[i]; cy += coords[i + 1];
                points.push([cx, cy]);
            }
        } else if (cmd === 'M') {
            cx = coords[0]; cy = coords[1];
            sx = cx; sy = cy;
            points.push([cx, cy]);
            for (let i = 2; i + 1 < coords.length; i += 2) {
                cx = coords[i]; cy = coords[i + 1];
                points.push([cx, cy]);
            }
        } else if (cmd === 'l') {
            for (let i = 0; i + 1 < coords.length; i += 2) {
                cx += coords[i]; cy += coords[i + 1];
                points.push([cx, cy]);
            }
        } else if (cmd === 'L') {
            for (let i = 0; i + 1 < coords.length; i += 2) {
                cx = coords[i]; cy = coords[i + 1];
                points.push([cx, cy]);
            }
        } else if (cmd === 'h') {
            for (const v of coords) { cx += v; points.push([cx, cy]); }
        } else if (cmd === 'H') {
            for (const v of coords) { cx = v; points.push([cx, cy]); }
        } else if (cmd === 'v') {
            for (const v of coords) { cy += v; points.push([cx, cy]); }
        } else if (cmd === 'V') {
            for (const v of coords) { cy = v; points.push([cx, cy]); }
        } else if (cmd === 'z' || cmd === 'Z') {
            if (points.length) points.push([sx, sy]);
        }
    }
    return points;
}

/** Shoelace polygon area (absolute). */
export function polygonArea(coords) {
    if (coords.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const [x1, y1] = coords[i];
        const [x2, y2] = coords[i + 1];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
}

/** Area-weighted polygon centroid (falls back to vertex mean if degenerate). */
export function polygonCentroid(coords) {
    if (!coords.length) return null;
    const n = coords.length;
    if (n < 3) {
        return [
            coords.reduce((s, p) => s + p[0], 0) / n,
            coords.reduce((s, p) => s + p[1], 0) / n,
        ];
    }
    let cx = 0, cy = 0, aSum = 0;
    for (let i = 0; i < n; i++) {
        const [x1, y1] = coords[i];
        const [x2, y2] = coords[(i + 1) % n];
        const cross = x1 * y2 - x2 * y1;
        aSum += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
    }
    if (Math.abs(aSum) < 1e-9) {
        return [
            coords.reduce((s, p) => s + p[0], 0) / n,
            coords.reduce((s, p) => s + p[1], 0) / n,
        ];
    }
    const a = aSum / 2;
    return [cx / (6 * a), cy / (6 * a)];
}

/* ---- group readers ----------------------------------------------------- */

function readLineGroup(root, groupName, layerId, defaultStatus = 'On') {
    const group = findGroup(root, groupName);
    const out = [];
    if (!group) return out;

    for (const line of findAllByTag(group, 'line')) {
        const a = line.attrs;
        if (a.x1 == null) continue;
        out.push({
            id: a.id || '',
            x1: parseFloat(a.x1), y1: parseFloat(a.y1),
            x2: parseFloat(a.x2), y2: parseFloat(a.y2),
            layerId, status: defaultStatus,
        });
    }
    for (const path of findAllByTag(group, 'path')) {
        const a = path.attrs;
        const seg = pathToLine(a.d);
        if (!seg) continue;
        out.push({ id: a.id || '', ...seg, layerId, status: defaultStatus });
    }
    return out;
}

/** Collect Stop.<no>.<hall> segments anywhere in the SVG (any group). */
function readStopPortalsAnywhere(root, layerId) {
    const out = [];
    const seen = new Set();
    for (const el of [...findAllByTag(root, 'line'), ...findAllByTag(root, 'path')]) {
        const id = el.attrs.id || '';
        if (!id.startsWith('Stop.') || seen.has(id)) continue;
        let seg;
        if (localName(el.tag) === 'line') {
            if (el.attrs.x1 == null) continue;
            seg = {
                x1: parseFloat(el.attrs.x1), y1: parseFloat(el.attrs.y1),
                x2: parseFloat(el.attrs.x2), y2: parseFloat(el.attrs.y2),
            };
        } else {
            seg = pathToLine(el.attrs.d);
            if (!seg) continue;
        }
        seen.add(id);
        out.push({ id, ...seg, layerId, status: 'On' });
    }
    return out;
}

function readRooms(root) {
    const roomsGroup = findGroup(root, 'Rooms');
    const roomsByType = {};
    if (!roomsGroup) return roomsByType;

    for (const childG of childrenByTag(roomsGroup, 'g')) {
        const roomType = childG.attrs.id || childG.attrs['inkscape:label'];
        if (!roomType) continue;
        const rooms = [];
        for (const path of childrenByTag(childG, 'path')) {
            const d = path.attrs.d;
            if (!d) continue;
            const coords = pathToAbsolutePoints(d);
            if (!coords.length) continue;
            rooms.push({
                id: path.attrs.id || 'unknown',
                area: polygonArea(coords),
                center: polygonCentroid(coords),
                coordinates: coords,
            });
        }
        if (rooms.length) roomsByType[roomType] = rooms;
    }
    return roomsByType;
}

/* ---- public ------------------------------------------------------------ */

/**
 * Parse a single floor SVG into routing primitives.
 *
 * @param {string} svgText
 * @param {object} [opts]
 * @param {string} [opts.layerId]  Logical floor id (defaults to '0').
 * @param {Array}  [opts.portalStatuses] [{ id, layerId, Status }]
 * @returns {{ connections: object[], roomsByType: object }}
 */
export function parseFloorSvg(svgText, { layerId = '0', portalStatuses = [] } = {}) {
    const root = parseXml(svgText);
    if (!root) return { connections: [], roomsByType: {} };

    const statusOf = (id, lid) => {
        const hit = portalStatuses.find(
            p => p.id === id && String(p.layerId) === String(lid),
        );
        return hit ? (hit.Status || 'Unknown') : 'Unknown';
    };

    const connections = [];

    // Paths (a Stop.* under Paths is treated as a portal connection).
    for (const seg of readLineGroup(root, 'Paths', layerId)) {
        if (String(seg.id).startsWith('Stop.')) {
            connections.push({ ...seg, type: 'portal', status: statusOf(seg.id, layerId) });
        } else {
            connections.push({ ...seg, type: 'path' });
        }
    }
    // Doors.
    for (const seg of readLineGroup(root, 'Doors', layerId)) {
        connections.push({ ...seg, type: 'door' });
    }
    // Portals (status from portalStatuses, default 'On' when not provided).
    for (const seg of readLineGroup(root, 'Portals', layerId)) {
        const st = portalStatuses.length ? statusOf(seg.id, layerId) : 'On';
        connections.push({ ...seg, type: 'portal', status: st });
    }
    // Stop portals that live outside the Portals group.
    const existing = new Set(connections.map(c => c.id));
    for (const seg of readStopPortalsAnywhere(root, layerId)) {
        if (existing.has(seg.id)) continue;
        const st = portalStatuses.length ? statusOf(seg.id, layerId) : 'On';
        connections.push({ ...seg, type: 'portal', status: st });
    }

    const roomsByType = readRooms(root);
    return { connections, roomsByType };
}
