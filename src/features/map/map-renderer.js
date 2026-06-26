import { config } from '../../core/config.js';
import { eventBus } from '../../core/event-bus.js';
import { state, dataStore } from '../../core/state.js';
import { buildColorExpr, buildHeightExpr } from './map-styles.js';
import { buildWallBand, carveDoorways, doorOpeningsByUnit, pathCrossOpeningsByUnit, openingsKey, insetFeature } from './wall-geometry.js';
import { animateRoute, cancelRouteAnimation, showRouteStepHighlight } from './route-animator.js';
import { buildGraph, findRoute, findNearestNode, findRouteFromNode, getAvailableUnits, getUnitFloors } from './pathfinder.js';
import { isNonInteractiveFloorUnit, normalizeRoomFeatureId } from './unit-utils.js';

let geojsonData = null;
let geojsonLoaded = false;
/** Building-shell feature ids (flat envelope polygons). */
let _shellIds = new Set();
let mainMap = null;
let storeMap = null;
let highlightedFeatureId = null;
const _resizeObservers = [];

/* Multi-floor support: every feature is normalised to carry a string
 * `floor` property (defaulting to '0' for legacy single-floor data),
 * and visible layers are filtered by `state.currentFloor`. The set of
 * layers that participate is recorded here so the floor:changed
 * handler can update them in one pass. */
/* Ghost layer only draws walking + building shells on *other* floors —
 * not every shop polygon, which would clutter stacked malls. */
const GHOST_OUTLINE_EXTRA = ['in', ['get', 'sublayer'], ['literal', ['walking', 'building']]];

/* Writing labels are split into S/M/L tiers purely so each tier can have its
 * own minZoom (small labels surface only when zoomed in). Tiers are bucketed by
 * *range* — not an exact 8/12/18 match — so any custom px size the editor sets
 * still lands in a tier and renders; the actual text-size then scales
 * continuously from the feature's real `font_size` (see addLayers). */
const FS_EXPR = ['coalesce', ['to-number', ['get', 'font_size']], 12];
const WRITING_TIER_FILTERS = {
    sm: ['<', FS_EXPR, 10],
    md: ['all', ['>=', FS_EXPR, 10], ['<', FS_EXPR, 15]],
    lg: ['>=', FS_EXPR, 15],
};

const FLOOR_FILTERED_LAYERS = [
    { id: 'rooms-floor',          extra: null },
    { id: 'rooms-ghost-outline',  invert: true, extra: GHOST_OUTLINE_EXTRA },
    /* No `extra` filter: `rooms-extruded` source is already pre-filtered
     * (see `detectShellIds` + walking skip in `addLayers`). The previous
     * `sublayer != 'building'` clause double-blocked building-sublayer
     * features whose SVG id started with "ID" — silently dropping the
     * very items the source filter was designed to let through. */
    { id: 'rooms-3d',             extra: null },
    { id: 'rooms-fill-hit',       extra: null },
    { id: 'writing-sm',           extra: WRITING_TIER_FILTERS.sm },
    { id: 'writing-md',           extra: WRITING_TIER_FILTERS.md },
    { id: 'writing-lg',           extra: WRITING_TIER_FILTERS.lg },
    { id: 'placed-icons-layer',   extra: null },
];

/* Routing mesh — used only for pathfinding, never drawn on the public
 * map. Kept in GeoJSON but hidden; the animated `route-*` layers are
 * the only lines users see. Floor-filtered so a future debug toggle
 * would respect the active floor. */
const NAV_MESH_LAYERS = ['paths-line', 'doors-line', 'portals-line'];

function ensureFloorProp(feature) {
    if (!feature?.properties) return feature;
    if (feature.properties.floor != null) return feature;
    return { ...feature, properties: { ...feature.properties, floor: '0' } };
}

function normaliseFloors(geojson) {
    if (!geojson?.features) return geojson;
    return {
        ...geojson,
        features: geojson.features.map(ensureFloorProp),
    };
}

function floorFilter(currentFloor, extra = null, invert = false) {
    if (currentFloor == null || currentFloor === 'all') {
        // "All floors" → either show every feature (normal layers) or
        // hide the ghost-outline layer entirely (its job is to surface
        // *other* floors when the user is focussed on one).
        if (invert) return ['boolean', false];
        return extra || ['boolean', true];
    }
    const cmp = invert ? '!=' : '==';
    const floorFilterExpr = [cmp,
        ['coalesce', ['to-string', ['get', 'floor']], '0'],
        String(currentFloor)];
    return extra ? ['all', floorFilterExpr, extra] : floorFilterExpr;
}

function showOtherFloorOutlinesEnabled() {
    return config.features.map?.showOtherFloorOutlines === true;
}

function applyFloorFilters(map, currentFloor) {
    if (!map) return;
    for (const cfg of FLOOR_FILTERED_LAYERS) {
        if (!map.getLayer(cfg.id)) continue;
        try {
            if (cfg.id === 'rooms-ghost-outline' && !showOtherFloorOutlinesEnabled()) {
                map.setFilter(cfg.id, ['boolean', false]);
                map.setLayoutProperty(cfg.id, 'visibility', 'none');
                continue;
            }
            map.setLayoutProperty(cfg.id, 'visibility', 'visible');
            map.setFilter(cfg.id, floorFilter(currentFloor, cfg.extra, !!cfg.invert));
        } catch (e) {
            console.warn(`[map-renderer] setFilter failed on ${cfg.id}`, e);
        }
    }
    for (const layerId of NAV_MESH_LAYERS) {
        if (!map.getLayer(layerId)) continue;
        try {
            map.setFilter(layerId, floorFilter(currentFloor));
            map.setLayoutProperty(layerId, 'visibility', 'none');
        } catch (e) {
            console.warn(`[map-renderer] setFilter failed on ${layerId}`, e);
        }
    }
}

// Re-filter every floor-aware layer on both the main and store maps
// whenever the user picks a new floor.
eventBus.on('floor:changed', ({ floorId }) => {
    if (mainMap && !mainMap._removed) applyFloorFilters(mainMap, floorId);
    if (storeMap && !storeMap._removed) applyFloorFilters(storeMap, floorId);
});

eventBus.on('map-floors:reapply', () => {
    if (mainMap && !mainMap._removed) applyFloorFilters(mainMap, state.currentFloor);
    if (storeMap && !storeMap._removed) applyFloorFilters(storeMap, state.currentFloor);
});

async function loadGeoJSON() {
    if (geojsonData) return geojsonData;
    // Preview override: if running inside the editor and the user has
    // converted/placed an SVG, use that geojson instead of the file.
    const overrideGj = window.__previewAssets?.geojson;
    if (overrideGj && overrideGj.features) {
        geojsonData = normaliseFloors(overrideGj);
        geojsonLoaded = true;
        rebuildShellIdCache();
        console.log('✅ GeoJSON loaded from editor preview:', geojsonData.features.length, 'features');
        buildGraph(geojsonData);
        eventBus.emit('geojson:loaded', { source: 'preview', featureCount: geojsonData.features.length });
        return geojsonData;
    }
    try {
        const response = await fetch(config.venue.geojsonPath);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        geojsonData = normaliseFloors(await response.json());
        geojsonLoaded = true;
        rebuildShellIdCache();
        console.log('✅ GeoJSON loaded:', geojsonData.features.length, 'features');
        buildGraph(geojsonData);
        eventBus.emit('geojson:loaded', { source: 'file', featureCount: geojsonData.features.length });
        return geojsonData;
    } catch (error) {
        console.error('❌ GeoJSON load error:', error);
        return null;
    }
}

function drawDefaultArrow(ctx, size, color) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = color || '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(size * 0.5, size * 0.15);
    ctx.lineTo(size * 0.82, size * 0.65);
    ctx.lineTo(size * 0.5, size * 0.48);
    ctx.lineTo(size * 0.18, size * 0.65);
    ctx.closePath();
    ctx.fill();
}

function putRouteFlowImage(map, canvas) {
    const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    if (map.hasImage('route-arrow')) {
        try { map.updateImage('route-arrow', imageData); return; } catch (_) {}
        try { map.removeImage('route-arrow'); } catch (_) {}
    }
    map.addImage('route-arrow', imageData, { sdf: false });
}

/** Decode the SVG markup out of a `data:image/svg+xml[;base64],…` URL. */
function decodeSvgDataUrl(url) {
    const comma = url.indexOf(',');
    if (comma < 0) return '';
    const meta = url.slice(0, comma);
    const data = url.slice(comma + 1);
    if (/;base64/i.test(meta)) {
        try { return decodeURIComponent(escape(atob(data))); } catch (_) { try { return atob(data); } catch (_) { return ''; } }
    }
    try { return decodeURIComponent(data); } catch (_) { return data; }
}

/**
 * Normalise an Iconify-style SVG for raster use:
 *   - swap `currentColor` for the configured icon color (so it isn't black);
 *   - force a fixed pixel root size (Iconify uses width/height="1em", which
 *     gives an ambiguous/zero intrinsic size when loaded via <img>).
 * Returns a utf-8 data URL ready to assign to an Image.
 */
function svgToColoredDataUrl(svgText, color) {
    let s = (svgText || '').replace(/currentColor/g, color || '#ffffff');
    s = s.replace(/<svg([^>]*)>/i, (m, attrs) => {
        const cleaned = attrs.replace(/\s(width|height)\s*=\s*"[^"]*"/gi, '');
        return `<svg${cleaned} width="128" height="128">`;
    });
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

/** Resolve the final <img> src for a flow icon, recolouring SVG sources. */
function prepareFlowIconSource(url, color) {
    if (/^data:image\/svg\+xml/i.test(url)) {
        const svg = decodeSvgDataUrl(url);
        return Promise.resolve(svg ? svgToColoredDataUrl(svg, color) : url);
    }
    if (/\.svg(\?|#|$)/i.test(url)) {
        return fetch(url)
            .then(r => r.text())
            .then(t => svgToColoredDataUrl(t, color))
            .catch(() => url);
    }
    return Promise.resolve(url);
}

/**
 * Build the marching marker icon used along the route. When
 * `arrowCfg.iconUrl` is provided (PNG/SVG path, URL or data-URL) it is drawn
 * into the image; otherwise the built-in directional arrow glyph is used.
 * SVG sources (incl. Iconify data-URLs) are recoloured to `arrowCfg.color`
 * and pixel-sized first. The custom image loads asynchronously and swaps in.
 */
function createRouteFlowIcon(map, arrowCfg = {}) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const color = arrowCfg.color || '#ffffff';

    // Default arrow first so there's always a valid image registered.
    drawDefaultArrow(ctx, size, color);
    putRouteFlowImage(map, canvas);

    const url = arrowCfg.iconUrl;
    if (!url) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        if (!map || map._removed) return;
        ctx.clearRect(0, 0, size, size);
        // Contain the icon within the tile, preserving aspect ratio. Guard
        // against zero/NaN intrinsic sizes (some SVGs report none).
        const iw = img.naturalWidth || img.width || size;
        const ih = img.naturalHeight || img.height || size;
        const scale = Math.min(size / iw, size / ih) || 1;
        const w = iw * scale;
        const h = ih * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        try { putRouteFlowImage(map, canvas); } catch (_) {}
    };
    img.onerror = () => { /* keep the default arrow already registered */ };

    prepareFlowIconSource(url, color)
        .then(src => { if (map && !map._removed) img.src = src; })
        .catch(() => {});
}

function drawDiamondPersonIcon(ctx, cx, cy, scale, bgColor, personColor) {
    const s = scale;
    ctx.save();

    const d = 22 * s;
    ctx.fillStyle = bgColor;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4 * s;
    ctx.beginPath();
    ctx.moveTo(cx, cy - d);
    ctx.lineTo(cx + d, cy);
    ctx.lineTo(cx, cy + d);
    ctx.lineTo(cx - d, cy);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = personColor;

    ctx.beginPath();
    ctx.arc(cx, cy - 8 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx - 5.5 * s, cy + 12 * s);
    ctx.quadraticCurveTo(cx - 5.5 * s, cy - 2 * s, cx, cy - 2 * s);
    ctx.quadraticCurveTo(cx + 5.5 * s, cy - 2 * s, cx + 5.5 * s, cy + 12 * s);
    ctx.quadraticCurveTo(cx + 3 * s, cy + 8 * s, cx, cy + 9 * s);
    ctx.quadraticCurveTo(cx - 3 * s, cy + 8 * s, cx - 5.5 * s, cy + 12 * s);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function createPinImage(map, color) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    drawDiamondPersonIcon(ctx, size / 2, size / 2, 2.0, color, '#ffffff');

    const imageData = ctx.getImageData(0, 0, size, size);
    if (!map.hasImage('dropped-pin')) {
        map.addImage('dropped-pin', imageData, { pixelRatio: 2 });
    }
}

let _pinCursorUrl = null;
function createPinCursorUrl(color) {
    if (_pinCursorUrl) return _pinCursorUrl;
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    drawDiamondPersonIcon(ctx, size / 2, size / 2, 0.8, color, '#ffffff');
    _pinCursorUrl = canvas.toDataURL('image/png');
    return _pinCursorUrl;
}

function calculateBounds(geojson) {
    const bounds = new maplibregl.LngLatBounds();
    let hasPoints = false;
    geojson.features.forEach(f => {
        const g = f.geometry;
        if (!g || !g.coordinates) return;
        if (g.type === 'Point') { bounds.extend(g.coordinates); hasPoints = true; }
        else if (g.type === 'LineString') { g.coordinates.forEach(c => { bounds.extend(c); hasPoints = true; }); }
        else if (g.type === 'Polygon' && g.coordinates[0]) { g.coordinates[0].forEach(c => { bounds.extend(c); hasPoints = true; }); }
        else if (g.type === 'MultiPolygon') {
            g.coordinates.forEach(p => p[0]?.forEach(c => { bounds.extend(c); hasPoints = true; }));
        }
    });
    return hasPoints ? bounds : null;
}

/** Extend a LngLatBounds with every vertex of a Polygon / MultiPolygon
 *  feature's first ring. Returns false if the feature has no geometry
 *  the caller can fit to (used to bail before fitBounds).             */
function extendBoundsWithFeature(bounds, feature) {
    const g = feature?.geometry;
    if (!g) return false;
    if (g.type === 'Polygon' && g.coordinates[0]) {
        g.coordinates[0].forEach(c => bounds.extend(c));
        return true;
    }
    if (g.type === 'MultiPolygon') {
        let any = false;
        g.coordinates.forEach(p => {
            if (p[0]) { p[0].forEach(c => bounds.extend(c)); any = true; }
        });
        return any;
    }
    return false;
}

/* Approximate polygon area in *coordinate-space* units. We only use this
 * relatively (largest-vs-median) to detect building-shell outlines, so
 * the lat/lng-vs-meter discrepancy doesn't matter — every feature is
 * measured with the same yardstick. */
function ringArea(ring) {
    let sum = 0;
    for (let i = 0, n = ring.length - 1; i < n; i++) {
        sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return Math.abs(sum) / 2;
}

function featureArea(feature) {
    const g = feature.geometry;
    if (!g) return 0;
    if (g.type === 'Polygon') {
        return g.coordinates[0] ? ringArea(g.coordinates[0]) : 0;
    }
    if (g.type === 'MultiPolygon') {
        let total = 0;
        for (const poly of g.coordinates) {
            if (poly[0]) total += ringArea(poly[0]);
        }
        return total;
    }
    return 0;
}

/* Identify the building-shell candidates among `rooms`-layer features.
 *
 * The hard rule (existing for years): a `building`-sublayer feature
 * whose SVG id does NOT start with "ID" is the shell. That works when
 * the SVG follows the Inkscape convention used by the in-house map tool.
 *
 * The heuristic (new): when the SVG comes from a different toolchain
 * (IFM is the first example), the shell can end up in `structure`
 * (paths placed directly under <Rooms>) or even in another sublayer.
 * What it always has, regardless of toolchain, is a polygon that dwarfs
 * every other feature on the floor — it's the envelope that contains
 * the rooms. We flag any non-walking feature whose area is BOTH
 *   • larger than the sum of every other non-walking feature, AND
 *   • at least 3× larger than the runner-up,
 * which is conservative enough that an unusually big real room (a
 * concourse, an atrium) won't be mis-classified.
 *
 * Returns a `Set<id>` of feature ids that should be drawn flat instead
 * of extruded. Walking is excluded from the area pool because walking
 * already takes the dedicated walking-flat code path. */
function detectShellIds(roomFeatures) {
    const shells = new Set();
    const byFloor = new Map();
    for (const f of roomFeatures) {
        const fl = f.properties?.floor || '0';
        if (!byFloor.has(fl)) byFloor.set(fl, []);
        byFloor.get(fl).push(f);
    }
    for (const [, features] of byFloor) {
        const sized = [];
        for (const f of features) {
            const sl = f.properties?.sublayer;
            if (sl === 'walking') continue;
            const a = featureArea(f);
            if (a <= 0) continue;
            sized.push({ f, sl, a });
        }
        if (sized.length === 0) continue;

        for (const { f, sl } of sized) {
            const fid = f.properties?.id || '';
            if (sl === 'building' && !fid.startsWith('ID')) {
                shells.add(fid);
            }
        }

        if (sized.length >= 2) {
            sized.sort((a, b) => b.a - a.a);
            const largest = sized[0];
            const restArea = sized.slice(1).reduce((s, x) => s + x.a, 0);
            const second = sized[1].a;
            if (largest.a > restArea && largest.a > second * 3) {
                shells.add(largest.f.properties.id);
            }
        }
    }
    return shells;
}

function rebuildShellIdCache() {
    if (!geojsonData?.features) {
        _shellIds = new Set();
        return;
    }
    const rooms = geojsonData.features.filter(f => f.properties?.layer === 'rooms');
    _shellIds = detectShellIds(rooms);
}

function tagNonInteractiveFloor(feature) {
    return {
        ...feature,
        properties: { ...feature.properties, __floor_noninteractive: 1 },
    };
}

function shrinkPolygon(feature, factor) {
    const geom = feature.geometry;
    const shrinkRing = (ring) => {
        const cx = ring.reduce((s, c) => s + c[0], 0) / ring.length;
        const cy = ring.reduce((s, c) => s + c[1], 0) / ring.length;
        return ring.map(c => [cx + (c[0] - cx) * factor, cy + (c[1] - cy) * factor]);
    };
    if (geom.type === 'Polygon') {
        return { ...feature, geometry: { ...geom, coordinates: geom.coordinates.map(shrinkRing) } };
    }
    if (geom.type === 'MultiPolygon') {
        return { ...feature, geometry: { ...geom, coordinates: geom.coordinates.map(p => p.map(shrinkRing)) } };
    }
    return feature;
}

/* Single source of truth for deriving the flat-fill (`rooms-flat`) and
 * extruded (`rooms-extruded`) feature collections from the full rooms list.
 * Honours `config.features.map.roomRenderMode`:
 *   - 'solid' (default): extrude shrunk room polygons as filled blocks.
 *   - 'walls': extrude only perimeter wall bands and add the full room
 *     polygons to the flat layer so their interiors render as colored floors.
 * Walking areas and detected building shells are always flat. */
/* Cheap geometry digest so repeated source rebuilds (style refresh, editor
 * drags) reuse an already-carved wall band for unchanged units instead of
 * re-running turf buffer/difference for every room each time. Samples the
 * vertex count + a few coordinates so it changes on move/scale/rotate/edit. */
function geomDigest(geom) {
    const ring = geom?.type === 'Polygon' ? geom.coordinates[0]
        : geom?.type === 'MultiPolygon' ? geom.coordinates[0]?.[0] : null;
    if (!ring || !ring.length) return 'x';
    const n = ring.length;
    const at = i => { const p = ring[i] || [0, 0]; return `${p[0].toFixed(7)},${p[1].toFixed(7)}`; };
    return `${n}:${at(0)}:${at(n >> 1)}:${at(n - 1)}`;
}

const _wallBandCache = new Map();

/* Wall band for one unit, with door openings carved out (when `mids` given).
 * Memoised by unit + geometry + wall params so only changed units recompute. */
function buildUnitWall(f, thickness, gapWidth, mids, shrinkFactor, wallGap = 0) {
    const midSig = mids && mids.length
        ? mids.map(m => `${m[0].toFixed(6)},${m[1].toFixed(6)}`).join(';')
        : '';
    const sig = `${f.properties?.id}|${thickness}|${gapWidth}|${wallGap}|${geomDigest(f.geometry)}|${midSig}`;
    const hit = _wallBandCache.get(sig);
    if (hit) return hit;

    // Pull the unit in by `wallGap` first so neighbouring walls don't fuse.
    const fForWall = wallGap > 0 ? insetFeature(f, wallGap) : f;
    let band = buildWallBand(fForWall, thickness) || shrinkPolygon(fForWall, shrinkFactor);
    if (band && mids && mids.length) band = carveDoorways(band, mids, gapWidth, thickness);

    if (_wallBandCache.size > 4000) _wallBandCache.clear();
    _wallBandCache.set(sig, band);
    return band;
}

function buildRoomSourceData(allRooms, allDoors = [], allPaths = []) {
    const shellIds = detectShellIds(allRooms);
    const mapCfg = config.features.map;
    const shrinkFactor = mapCfg.shrinkFactor || 0.99;
    const globalMode = mapCfg.roomRenderMode || 'solid';
    const bySub = mapCfg.renderModeBySublayer || {};
    /* Effective render mode per unit: a sublayer override wins over the
     * global mode, so groups can be walls while others stay solid blocks. */
    const effMode = (f) => bySub[f.properties.sublayer] || globalMode;

    /* Disabled units never extrude, never wall, never carry a door gap and are
     * never clickable. Their visibility is configurable:
     *   colored=false → fully invisible (excluded entirely)
     *   colored=true  → shown as a flat coloured block (e.g. closed stores),
     *                   tagged `__disabled` so the floor layer tints them. */
    const disCfg = mapCfg.disabledUnits || {};
    const disColored = disCfg.colored === true;
    const isDisabled = (f) => f.properties?.disabled === true;

    const flatBase = allRooms
        .filter(f => {
            const sl = f.properties.sublayer;
            return sl === 'walking' || shellIds.has(f.properties.id);
        })
        .map(tagNonInteractiveFloor);
    const disabledColored = disColored
        ? allRooms.filter(isDisabled).map(f => ({ ...f, properties: { ...f.properties, __disabled: 1 } }))
        : [];
    const rooms = allRooms.filter(f => {
        const sl = f.properties.sublayer;
        if (sl === 'walking') return false;
        if (shellIds.has(f.properties.id)) return false;
        if (isDisabled(f)) return false;
        return true;
    });

    const wallRooms  = rooms.filter(f => effMode(f) === 'walls');
    const solidRooms = rooms.filter(f => effMode(f) !== 'walls');

    const flatFeatures = [...flatBase, ...disabledColored];
    const extrudedFeatures = [];

    if (wallRooms.length) {
        const thickness = mapCfg.wallThickness ?? 0.6;
        const wallGap = mapCfg.wallGap ?? 0;
        const gapsOn = mapCfg.doorGaps !== false;          // default ON in walls mode
        const gapWidth = mapCfg.doorGapWidth ?? 1.2;
        /* Two opening strategies (config.features.map.doorGapMode):
         *  - 'doors' (default): open where a door's connected path crosses the
         *    wall (doors sit inside the unit; the path runs out the doorway).
         *  - 'paths': open EVERY wall any path crosses, ignoring doors — for
         *    venues without modelled doors. */
        const doorGapMode = mapCfg.doorGapMode || 'doors';
        const openings = !gapsOn ? null
            : (doorGapMode === 'paths'
                ? pathCrossOpeningsByUnit(wallRooms, allPaths)
                : doorOpeningsByUnit(wallRooms, allDoors, allPaths));
        for (const f of wallRooms) {
            const mids = openings ? openings.get(openingsKey(f)) : null;
            const band = buildUnitWall(f, thickness, gapWidth, mids, shrinkFactor, wallGap);
            // Tag walls so a fixed wall colour can be applied to bands only,
            // leaving solid-block groups on their per-unit category colour.
            extrudedFeatures.push({ ...band, properties: { ...(band.properties || {}), __wall: 1 } });
            /* Full room polygon becomes a colored floor. Tagged `__unit` so a
             * transparent hit layer makes the open interior clickable (the
             * extruded walls alone would leave the centre of each room dead). */
            flatFeatures.push({ ...f, properties: { ...f.properties, __unit: 1 } });
        }
    }

    for (const f of solidRooms) {
        extrudedFeatures.push(shrinkPolygon(f, shrinkFactor));
    }

    return { flatFeatures, extrudedFeatures };
}

function splitByLayer(geojson) {
    const layers = {};
    ['rooms', 'paths', 'doors', 'portals', 'writing'].forEach(l => {
        layers[l] = { type: 'FeatureCollection', features: geojson.features.filter(f => f.properties.layer === l) };
    });
    return layers;
}

/* Wrap a base color expression with hover/selected feature-state cases.
 *
 * `skipWalls`: wall bands (`__wall`) are NOT recolored on hover/selection.
 * Recoloring a wall makes its shared, coplanar face with the neighbouring
 * unit's wall z-fight (the highlighted band and the neighbour band fight for
 * the same pixels, producing the striped artifact). Instead we leave wall
 * bands a constant color and let the interior floor fill carry the highlight
 * (see buildFloorColorExpr), which never shares a plane with anything. */
function highlightCases(baseColor, { skipWalls = false } = {}) {
    const interaction = config.features.map.interaction || {};
    const hoverEnabled = interaction.hover !== false;
    const clickEnabled = interaction.click !== false;
    const hoverColor = interaction.hoverColor || '#93c5fd';
    const selectedColor = interaction.selectedColor || '#3b82f6';
    if (!hoverEnabled && !clickEnabled) return baseColor;
    const guard = (cond) => skipWalls ? ['all', ['!=', ['get', '__wall'], 1], cond] : cond;
    const cases = ['case'];
    if (clickEnabled) cases.push(guard(['boolean', ['feature-state', 'selected'], false]), selectedColor);
    if (hoverEnabled) cases.push(guard(['boolean', ['feature-state', 'hover'], false]), hoverColor);
    cases.push(baseColor);
    return cases;
}

function buildExtrusionColorExpr() {
    const mapCfg = config.features.map;
    /* Walled units extrude their perimeter as a band (tagged `__wall`). When a
     * fixed wall color is requested it applies to those bands only, so groups
     * left as solid blocks keep their per-unit category color. The floor fill
     * (rooms-floor) always keeps the unit color. */
    const baseColor = (mapCfg.wallColorMode === 'fixed' && mapCfg.wallColor)
        ? ['case', ['==', ['get', '__wall'], 1], mapCfg.wallColor, buildColorExpr()]
        : buildColorExpr();
    // Solid blocks still highlight on hover; wall bands stay constant.
    return highlightCases(baseColor, { skipWalls: true });
}

/* Floor fill color. Interior floors of walled units (`__unit`) carry the
 * hover/selected highlight so hovering a unit lights up its open interior
 * without recoloring (and z-fighting) the perimeter wall bands. Disabled units
 * shown in "colored" mode (tagged `__disabled`) get a fixed muted colour. */
function buildFloorColorExpr() {
    const disCfg = config.features.map.disabledUnits || {};
    const disColor = disCfg.color || '#9ca3af';
    const base = ['case', ['==', ['get', '__disabled'], 1], disColor, buildColorExpr()];
    return highlightCases(base);
}

function disabledUnitIdSet(rooms) {
    const s = new Set();
    for (const f of (rooms || [])) {
        if (f.properties?.disabled === true && f.properties?.id != null) s.add(String(f.properties.id));
    }
    return s;
}
function writingOwnerUnitId(w) {
    const first = String(w.properties?.lines?.[0] ?? (w.properties?.text || '').split('\n')[0] ?? '').trim();
    return first.replace(/_\d+_?$/, '').trim();
}
/* Strip labels of disabled units unless they are shown ("colored") AND
 * `disabledUnits.showLabel` is on. A fully invisible unit never shows a label. */
function filterWritingForDisabled(writingFC, rooms) {
    if (!writingFC) return writingFC;
    const disCfg = config.features.map.disabledUnits || {};
    const labelsAllowed = disCfg.colored === true && disCfg.showLabel === true;
    if (labelsAllowed) return writingFC;
    const dis = disabledUnitIdSet(rooms);
    if (!dis.size) return writingFC;
    return {
        type: 'FeatureCollection',
        features: (writingFC.features || []).filter(w => !dis.has(writingOwnerUnitId(w))),
    };
}

function addLayers(map, layerData) {
    const heightExpr = buildHeightExpr();
    const allRooms = layerData.rooms?.features || [];

    ['rooms', 'paths', 'doors', 'portals'].forEach(l => {
        if (layerData[l]) map.addSource(l, { type: 'geojson', data: layerData[l] });
    });
    if (layerData.writing) {
        map.addSource('writing', { type: 'geojson', data: filterWritingForDisabled(layerData.writing, allRooms) });
    }

    const { flatFeatures, extrudedFeatures } = buildRoomSourceData(allRooms, layerData.doors?.features || [], layerData.paths?.features || []);

    map.addSource('rooms-flat', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: flatFeatures },
        promoteId: 'id',
    });

    map.addSource('rooms-extruded', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: extrudedFeatures },
        promoteId: 'id',
    });

    map.addLayer({ id: 'rooms-floor', type: 'fill', source: 'rooms-flat', paint: { 'fill-color': buildFloorColorExpr(), 'fill-opacity': 0.9 } });

    /* Transparent hit target over room interiors (walls mode only; in solid
     * mode no feature carries `__unit`, so this layer is empty). Lets clicks /
     * hover on the open floor select the unit just like the extruded walls. */
    map.addLayer({
        id: 'rooms-fill-hit', type: 'fill', source: 'rooms-flat',
        filter: ['==', ['get', '__unit'], 1],
        paint: { 'fill-color': '#000000', 'fill-opacity': 0 },
    });

    const interaction = config.features.map.interaction || {};
    const routeStartColor = interaction.routeStartColor || '#22c55e';
    const routeEndColor = interaction.routeEndColor || '#3b82f6';

    const extrusionColorExpr = buildExtrusionColorExpr();

    map.addLayer({
        id: 'rooms-3d', type: 'fill-extrusion', source: 'rooms-extruded',
        paint: {
            'fill-extrusion-color': extrusionColorExpr,
            'fill-extrusion-height': heightExpr,
            'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1, 'fill-extrusion-vertical-gradient': true,
        }
    });

    // Optional ghost outline of other floors' walking/building shells.
    // Off by default (`showOtherFloorOutlines`); see applyFloorFilters.
    map.addLayer({
        id: 'rooms-ghost-outline', type: 'line', source: 'rooms',
        paint: {
            'line-color': '#94a3b8',
            'line-width': 1,
            'line-opacity': 0.5,
            'line-dasharray': [3, 3],
        },
    });

    if (layerData.paths?.features.length > 0)
        map.addLayer({ id: 'paths-line', type: 'line', source: 'paths', paint: { 'line-color': '#3fab35', 'line-width': 1.5 }, layout: { visibility: 'none' } });
    if (layerData.doors?.features.length > 0)
        map.addLayer({ id: 'doors-line', type: 'line', source: 'doors', paint: { 'line-color': '#ff0000', 'line-width': 1.5 }, layout: { visibility: 'none' } });
    if (layerData.portals?.features.length > 0)
        map.addLayer({ id: 'portals-line', type: 'line', source: 'portals', paint: { 'line-color': '#0000ff', 'line-width': 2 }, layout: { visibility: 'none' } });

    if (layerData.writing?.features.length > 0) {
        const labelsCfg = config.features.map.labels || {};
        const normEnabled = labelsCfg.normalization !== false;
        const collisionOn = normEnabled && labelsCfg.collisionEnabled !== false;
        const minZooms = labelsCfg.minZoom || {};
        const lblTextColor = labelsCfg.textColor || '#1a1a1a';
        const lblHaloColor = labelsCfg.haloColor || 'rgba(255,255,255,0.9)';

        const pitchAlign = labelsCfg.pitchAlignment || 'viewport';
        const transAnchor = labelsCfg.translateAnchor || 'viewport';
        const tStops = labelsCfg.translateStops || [15, 0, 17, -12, 18, -20, 19, -30, 20, -45, 21, -65];

        /* `text-translate` lifts labels up (screen space) so they sit above the
         * 3D extrusions when the camera is tilted. But a constant screen offset
         * is wrong top-down: at pitch 0 the buildings project to ~0 height, yet
         * the label is still shoved "forward", looking misplaced. So we scale
         * the lift by sin(pitch): full at oblique angles, zero top-down. Only
         * meaningful for viewport-anchored translate. */
        const pitchAware = transAnchor === 'viewport';
        const labelTranslate = (pitchDeg) => {
            const k = pitchAware ? Math.max(0, Math.sin((pitchDeg || 0) * Math.PI / 180)) : 1;
            const e = ['interpolate', ['linear'], ['zoom']];
            for (let i = 0; i < tStops.length; i += 2) e.push(tStops[i], ['literal', [0, tStops[i + 1] * k]]);
            return e;
        };

        const writingLayout = {
            'text-field': ['get', 'text'], 'text-anchor': 'center',
            'text-allow-overlap': !collisionOn,
            'text-ignore-placement': !collisionOn,
            'text-optional': collisionOn,
            'text-rotation-alignment': 'viewport', 'text-pitch-alignment': pitchAlign,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-max-width': 8, 'text-line-height': 1.2,
            'symbol-sort-key': normEnabled ? ['*', ['get', 'room_area'], -1] : undefined,
        };
        if (!normEnabled) delete writingLayout['symbol-sort-key'];

        const writingPaint = {
            'text-color': lblTextColor, 'text-halo-color': lblHaloColor,
            'text-halo-width': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 17, 1, 19, 1.5, 21, 2],
            'text-halo-blur': 0.5,
            'text-translate': labelTranslate(map.getPitch ? map.getPitch() : 0),
            'text-translate-anchor': transAnchor,
            // No transition: the pitch hook below rewrites text-translate as the
            // camera tilts; the default ~300ms paint transition would make the
            // label visibly slide into place instead of tracking the pitch live.
            'text-translate-transition': { duration: 0, delay: 0 },
        };
        [
            { ref: 8,  id: 'sm', minz: minZooms.sm ?? 19, stops: [15, 4, 17, 8, 19, 12, 21, 16, 23, 22] },
            { ref: 12, id: 'md', minz: minZooms.md ?? 17, stops: [15, 5, 17, 10, 19, 14, 21, 20, 23, 28] },
            { ref: 18, id: 'lg', minz: minZooms.lg ?? 15, stops: [15, 6, 17, 12, 19, 18, 21, 26, 23, 36] },
        ].forEach(c => {
            // Scale each tier's base stops by the feature's real font_size vs
            // the tier reference, so custom px sizes render continuously
            // (matching the editor's processed-map preview) instead of
            // snapping to one fixed size per tier.
            const ratio = ['/', FS_EXPR, c.ref];
            const sizeExpr = ['interpolate', ['exponential', 1.5], ['zoom'],
                c.stops[0], ['*', c.stops[1], ratio],
                c.stops[2], ['*', c.stops[3], ratio],
                c.stops[4], ['*', c.stops[5], ratio],
                c.stops[6], ['*', c.stops[7], ratio],
                c.stops[8], ['*', c.stops[9], ratio]];
            const layerDef = {
                id: 'writing-' + c.id, type: 'symbol', source: 'writing',
                filter: WRITING_TIER_FILTERS[c.id],
                layout: { ...writingLayout, 'text-size': sizeExpr },
                paint: writingPaint,
            };
            if (normEnabled) layerDef.minzoom = c.minz;
            map.addLayer(layerDef);
        });

        // Keep the pitch-scaled label lift in sync as the camera tilts.
        if (pitchAware) {
            if (map.__labelPitchHook) { try { map.off('pitch', map.__labelPitchHook); } catch (_) {} }
            const upd = () => {
                const expr = labelTranslate(map.getPitch());
                for (const id of ['writing-sm', 'writing-md', 'writing-lg']) {
                    if (map.getLayer(id)) { try { map.setPaintProperty(id, 'text-translate', expr); } catch (_) {} }
                }
            };
            map.__labelPitchHook = upd;
            map.on('pitch', upd);
            upd();
        }
    }

    map.addSource('highlight-start', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'highlight-start-3d', type: 'fill-extrusion', source: 'highlight-start', paint: { 'fill-extrusion-color': routeStartColor, 'fill-extrusion-height': ['+', heightExpr, 0.2], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1 } });

    map.addSource('highlight-end', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'highlight-end-3d', type: 'fill-extrusion', source: 'highlight-end', paint: { 'fill-extrusion-color': routeEndColor, 'fill-extrusion-height': ['+', heightExpr, 0.2], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 1 } });

    const routeCfg = config.features.map.route || {};
    const rColor = routeCfg.color || '#2563EB';
    const rGlowColor = routeCfg.glowColor || rColor;
    const rGlowOpacity = routeCfg.glowOpacity ?? 0.25;
    const rOutlineColor = routeCfg.outlineColor || '#1e40af';

    // Route line thickness is config-driven: a single `width` multiplier
    // scales the inner line, casing (outline) and glow together so the stack
    // stays visually proportional. Width values are multiplied in JS at build
    // time (not wrapped in a MapLibre expression) because wrapping a zoom
    // interpolate in another expression drops the layer.
    const rWidthScale = Number(routeCfg.width) > 0 ? Number(routeCfg.width) : 1;
    const buildWidthExpr = (pairs) => {
        const e = ['interpolate', ['exponential', 1.5], ['zoom']];
        for (const [z, w] of pairs) e.push(z, w * rWidthScale);
        return e;
    };
    const zoomWidth   = buildWidthExpr([[14, 3], [16, 8], [18, 18], [20, 36], [22, 60]]);
    const zoomOutline = buildWidthExpr([[14, 5], [16, 12], [18, 24], [20, 46], [22, 74]]);
    const zoomGlow    = buildWidthExpr([[14, 8], [16, 18], [18, 36], [20, 64], [22, 100]]);

    const emptyGeoJSON = { type: 'FeatureCollection', features: [] };
    map.addSource('route', { type: 'geojson', data: emptyGeoJSON });
    map.addSource('route-arrows-src', { type: 'geojson', data: emptyGeoJSON });

    map.addLayer({ id: 'route-glow', type: 'line', source: 'route',
        paint: { 'line-color': rGlowColor, 'line-width': zoomGlow, 'line-opacity': rGlowOpacity, 'line-blur': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 16, 22, 40] },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    map.addLayer({ id: 'route-outline', type: 'line', source: 'route',
        paint: { 'line-color': rOutlineColor, 'line-width': zoomOutline, 'line-opacity': 0.6 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route',
        paint: { 'line-color': rColor, 'line-width': zoomWidth, 'line-opacity': 0.22 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
    });

    map.addSource('route-active', { type: 'geojson', data: emptyGeoJSON });
    map.addLayer({ id: 'route-active-glow', type: 'line', source: 'route-active',
        paint: { 'line-color': rGlowColor, 'line-width': zoomGlow, 'line-opacity': 0.45, 'line-blur': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 16, 22, 40] },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    map.addLayer({ id: 'route-active-outline', type: 'line', source: 'route-active',
        paint: { 'line-color': rOutlineColor, 'line-width': zoomOutline, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
    map.addLayer({ id: 'route-active-line', type: 'line', source: 'route-active',
        paint: { 'line-color': rColor, 'line-width': zoomWidth, 'line-opacity': 1 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
    });

    const arrowCfg = routeCfg.arrows || {};
    const arrowOpacity = arrowCfg.opacity ?? 0.9;
    const arrowSize = arrowCfg.size ?? 1;

    map.addLayer({ id: 'route-arrows', type: 'symbol', source: 'route-arrows-src',
        layout: {
            'icon-image': 'route-arrow',
            // Size multiplier is baked into each interpolate stop. MapLibre
            // forbids wrapping a zoom expression in another expression (e.g.
            // ['*', ['interpolate',['zoom']…], n]) — doing so drops the layer.
            'icon-size': ['interpolate', ['linear'], ['zoom'],
                14, 0.35 * arrowSize, 16, 0.5 * arrowSize, 18, 0.75 * arrowSize, 20, 1.0 * arrowSize, 22, 1.3 * arrowSize],
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
        },
        paint: { 'icon-opacity': arrowOpacity },
    });

    createRouteFlowIcon(map, arrowCfg);

    const pinCfg = config.features.navigation?.droppedPin || {};
    const pinColor = pinCfg.pinColor || '#3b82f6';
    const emptyPinGJ = { type: 'FeatureCollection', features: [] };

    map.addSource('dropped-pin', { type: 'geojson', data: emptyPinGJ });
    map.addSource('pin-snap-line', { type: 'geojson', data: emptyPinGJ });

    createPinImage(map, pinColor);

    map.addLayer({
        id: 'pin-snap-line-layer', type: 'line', source: 'pin-snap-line',
        paint: {
            'line-color': pinColor,
            'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 4, 22, 6],
            'line-opacity': 0.6,
            'line-dasharray': [3, 3],
        },
        layout: { 'line-cap': 'round' },
    });
    map.addLayer({
        id: 'dropped-pin-layer', type: 'symbol', source: 'dropped-pin',
        layout: {
            'icon-image': 'dropped-pin',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 18, 0.9, 20, 1.2, 22, 1.5],
            'icon-anchor': 'center',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
        },
        paint: { 'icon-opacity': 1 },
    });

    addPlacedIcons(map);

    // Unit/writing labels must always paint above the route line stack.
    // They are added before the route layers above, so lift them now.
    raiseWritingLayers(map);

    applyFloorFilters(map, state.currentFloor);
}

/**
 * Move the writing (label) layers above the route stack so unit titles are
 * never hidden under the drawn route. They are placed just below the pin /
 * dropped-pin / placed-icon layers (kept on top) when those exist, otherwise
 * moved to the very top. Safe to call repeatedly.
 */
function raiseWritingLayers(map) {
    if (!map || !map.getLayer) return;
    const keepOnTop = ['pin-snap-line-layer', 'dropped-pin-layer', 'placed-icons-layer']
        .find(id => map.getLayer(id));
    for (const id of ['writing-sm', 'writing-md', 'writing-lg']) {
        if (!map.getLayer(id)) continue;
        try {
            if (keepOnTop) map.moveLayer(id, keepOnTop);
            else map.moveLayer(id);
        } catch (_) { /* layer ordering is best-effort */ }
    }
}

/* ------------------------------------------------------------
 * Editor-placed POIs (preview mode)
 * ------------------------------------------------------------
 * The Map Builder lets the user drop POI icons on top of rooms
 * and persists them to IndexedDB as `kv:placedIcons`. In preview
 * mode app.js exposes them on `window.__previewAssets`, so we
 * just need to render them as a symbol layer here.
 */
const BUILTIN_POIS = [
    { id: 'restaurant', color: '#ef4444', symbol: 'R' },
    { id: 'cafe',       color: '#a16207', symbol: 'C' },
    { id: 'wc',         color: '#0ea5e9', symbol: 'W' },
    { id: 'info',       color: '#6366f1', symbol: 'i' },
    { id: 'atm',        color: '#16a34a', symbol: '$' },
    { id: 'parking',    color: '#1f2937', symbol: 'P' },
    { id: 'elevator',   color: '#64748b', symbol: '↕' },
    { id: 'exit',       color: '#16a34a', symbol: '→' },
];

function addBuiltinPoiImage(map, poi) {
    const imgId = 'poi-' + poi.id;
    if (map.hasImage(imgId)) return;
    const size = 40;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fillStyle = poi.color;
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.round(size * 0.38)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(poi.symbol, size / 2, size / 2);
    const data = ctx.getImageData(0, 0, size, size);
    if (!map.hasImage(imgId)) map.addImage(imgId, { width: size, height: size, data: data.data });
}

async function addCustomPoiImage(map, rec) {
    const imgId = 'poi-' + rec.id;
    if (map.hasImage(imgId)) return;
    if (!rec.blob) return;
    const url = URL.createObjectURL(rec.blob);
    const size = 40;
    await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);
            const data = ctx.getImageData(0, 0, size, size);
            if (!map.hasImage(imgId)) map.addImage(imgId, { width: size, height: size, data: data.data });
            URL.revokeObjectURL(url);
            resolve();
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        img.src = url;
    });
}

async function addPlacedIcons(map) {
    const placed = window.__previewAssets?.placedIcons;
    if (!Array.isArray(placed) || placed.length === 0) return;

    for (const poi of BUILTIN_POIS) addBuiltinPoiImage(map, poi);

    const customs = window.__previewAssets?.icons || [];
    await Promise.all(customs.map(rec => addCustomPoiImage(map, rec)));

    const features = placed
        .filter(p => Number.isFinite(p.lng) && Number.isFinite(p.lat))
        .map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
            properties: {
                id: p.id,
                icon_type: p.type,
                floor: p.floor != null ? String(p.floor) : '0',
            },
        }));
    if (!features.length) return;

    if (!map.getSource('placed-icons')) {
        map.addSource('placed-icons', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features },
        });
        map.addLayer({
            id: 'placed-icons-layer',
            type: 'symbol',
            source: 'placed-icons',
            layout: {
                'icon-image': ['concat', 'poi-', ['get', 'icon_type']],
                'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 18, 0.7, 20, 1.0, 22, 1.4],
                'icon-allow-overlap': true,
                'icon-ignore-placement': true,
                'icon-anchor': 'center',
            },
        });
    } else {
        map.getSource('placed-icons').setData({ type: 'FeatureCollection', features });
    }
}

function createMap(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const mapCfg = config.features.map;
    const mapInstance = new maplibregl.Map({
        container,
        style: {
            version: 8,
            sources: {
                'osm-tiles': {
                    type: 'raster',
                    tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png', 'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256, maxzoom: 19,
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                }
            },
            layers: [
                { id: 'osm-tiles-layer', type: 'raster', source: 'osm-tiles', minzoom: 0, maxzoom: 22, paint: { 'raster-opacity': mapCfg.tileOpacity || 0.6 } },
                { id: 'white-overlay', type: 'background', paint: { 'background-color': '#ffffff', 'background-opacity': mapCfg.overlayOpacity || 0.35 } },
            ],
            light: { anchor: 'viewport', color: '#ffffff', intensity: 0.6, position: [1.5, 210, 30] },
            glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
        },
        center: options.center || mapCfg.center,
        zoom: options.zoom || mapCfg.zoom,
        pitch: options.pitch ?? mapCfg.pitch,
        bearing: options.bearing ?? mapCfg.bearing,
        maxZoom: 24, minZoom: 10,
        antialias: true, canvasContextAttributes: { antialias: true },
        attributionControl: false,
        dragRotate: options.dragRotate !== false,
        touchZoomRotate: true,
    });

    if (options.showNavigation !== false) {
        mapInstance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    }

    return mapInstance;
}

function observeResize(containerId, mapInstance) {
    const container = document.getElementById(containerId);
    if (!container || !mapInstance) return;
    const observer = new ResizeObserver(() => { if (mapInstance && !mapInstance._removed) mapInstance.resize(); });
    observer.observe(container);
    _resizeObservers.push(observer);
}

export const mapRenderer = {
    get mainMap() { return mainMap; },
    get storeMap() { return storeMap; },
    get geojsonData() { return geojsonData; },
    get geojsonLoaded() { return geojsonLoaded; },

    isNonInteractiveFloorUnit(props) {
        return isNonInteractiveFloorUnit(props, _shellIds);
    },

    isPointerOverNonInteractiveFloor(map, e) {
        if (!map?.queryRenderedFeatures || !e?.point) return false;
        const unitLayers = ['rooms-3d', 'rooms-fill-hit'];
        try {
            /* A shop wall sits above the building shell on `rooms-floor`.
             * Block only when there is no interactable unit at this pixel —
             * otherwise the shell under everything would kill all hovers. */
            const unitHits = map.queryRenderedFeatures(e.point, { layers: unitLayers });
            if (unitHits.some(f => !isNonInteractiveFloorUnit(f.properties, _shellIds))) {
                return false;
            }
            const floorHits = map.queryRenderedFeatures(e.point, { layers: ['rooms-floor'] });
            return floorHits.some(f => isNonInteractiveFloorUnit(f.properties, _shellIds));
        } catch (_) {
            return false;
        }
    },

    isInteractableUnitFeature(feature) {
        if (!feature?.properties) return false;
        return !isNonInteractiveFloorUnit(feature.properties, _shellIds);
    },

    async initMainMap(containerId = 'floorMapContainer') {
        const geojson = await loadGeoJSON();
        if (!geojson) return null;
        if (mainMap) { mainMap.remove(); mainMap = null; }

        const bounds = calculateBounds(geojson);
        const center = bounds ? bounds.getCenter().toArray() : config.features.map.center;

        mainMap = createMap(containerId, { center, zoom: 17, pitch: 60, bearing: -20, showNavigation: true, dragRotate: true });
        if (!mainMap) return null;

        return new Promise(resolve => {
            mainMap.on('load', () => {
                addLayers(mainMap, splitByLayer(geojson));
                if (bounds) mainMap.fitBounds(bounds, { padding: 40, pitch: 60, bearing: -20, duration: 0 });


                const el = document.getElementById(containerId);
                if (el) el.classList.add('map-ready');

                console.log('✅ Main floor map initialized');
                resolve(mainMap);
            });
            observeResize(containerId, mainMap);
        });
    },

    async initStoreMap(containerId = 'storeFloorMapContainer') {
        const geojson = await loadGeoJSON();
        if (!geojson) return null;
        if (storeMap) { storeMap.remove(); storeMap = null; }

        const bounds = calculateBounds(geojson);
        const center = bounds ? bounds.getCenter().toArray() : config.features.map.center;

        storeMap = createMap(containerId, { center, zoom: 19, pitch: 30, bearing: 0, showNavigation: false, dragRotate: false });
        if (!storeMap) return null;

        return new Promise(resolve => {
            storeMap.on('load', () => {
                addLayers(storeMap, splitByLayer(geojson));
                if (bounds) storeMap.fitBounds(bounds, { padding: 20, pitch: 30, bearing: 0, duration: 0 });

                const el = document.getElementById(containerId);
                if (el) el.classList.add('map-ready');

                console.log('✅ Store detail map initialized');
                resolve(storeMap);
            });
            observeResize(containerId, storeMap);
        });
    },

    /**
     * Live-replace the whole map geojson without a full reload. Used by
     * the editor's geometry-edit tool (via the preview bridge) so dragging
     * / scaling / rotating a unit in the editor updates the running
     * preview instantly. Re-derives the flat / extruded room sources the
     * same way addLayers() does, rebuilds the routing graph and re-applies
     * the active floor filter.
     */
    updateGeojson(newGeojson) {
        if (!newGeojson?.features) return;
        geojsonData = normaliseFloors(newGeojson);
        geojsonLoaded = true;
        rebuildShellIdCache();

        const layers = splitByLayer(geojsonData);
        const allRooms = layers.rooms.features;
        const { flatFeatures, extrudedFeatures } = buildRoomSourceData(allRooms, layers.doors?.features || [], layers.paths?.features || []);

        const flatData = { type: 'FeatureCollection', features: flatFeatures };
        const extrudedData = { type: 'FeatureCollection', features: extrudedFeatures };

        const maps = [mainMap, storeMap].filter(m => m && !m._removed);
        for (const m of maps) {
            ['rooms', 'paths', 'doors', 'portals', 'writing'].forEach(l => {
                const src = m.getSource(l);
                if (!src || !layers[l]) return;
                src.setData(l === 'writing' ? filterWritingForDisabled(layers.writing, allRooms) : layers[l]);
            });
            const sFlat = m.getSource('rooms-flat');     if (sFlat) sFlat.setData(flatData);
            const sExt  = m.getSource('rooms-extruded');  if (sExt)  sExt.setData(extrudedData);
            // Re-assert label-over-route ordering (defensive; setData alone
            // doesn't reorder, but keeps behaviour correct if layers changed).
            raiseWritingLayers(m);
        }

        try { buildGraph(geojsonData); } catch (e) { console.warn('[map-renderer] buildGraph after update failed', e); }
        if (state.currentFloor != null) {
            maps.forEach(m => applyFloorFilters(m, state.currentFloor));
        }

        /* The fresh geojson from the editor has no `primaryCategory` and the
         * writing labels carry raw `ID003_1_` text, so without re-binding the
         * loaded locations the whole map renders as a plain, uncoloured,
         * raw-id map after any geometry edit (split/merge/delete/add-label).
         * Re-apply category colours + human titles from the current dataset. */
        const locs = dataStore?.locations;
        if (Array.isArray(locs) && locs.length) {
            try { this.applyLocationsToRooms(locs); } catch (e) { console.warn('[map-renderer] re-apply locations after update failed', e); }
            try { this.updateLabelsFromLocations(locs); } catch (e) { console.warn('[map-renderer] re-apply labels after update failed', e); }
        }

        eventBus.emit('geojson:updated', { featureCount: geojsonData.features.length });
    },

    highlightFeature(mapInstance, featureId, sourceId = 'highlight-end') {
        if (!mapInstance || !geojsonData) return;
        const source = mapInstance.getSource(sourceId);
        if (!source) return;
        if (!featureId) { source.setData({ type: 'FeatureCollection', features: [] }); highlightedFeatureId = null; return; }
        const feature = geojsonData.features.find(f => f.properties.id === featureId && f.properties.layer === 'rooms');
        if (feature) {
            source.setData({ type: 'FeatureCollection', features: [feature] });
            highlightedFeatureId = featureId;
            const fb = new maplibregl.LngLatBounds();
            if (extendBoundsWithFeature(fb, feature)) {
                const isSM = mapInstance === storeMap;
                mapInstance.fitBounds(fb, { padding: isSM ? 40 : 80, duration: 500, maxZoom: isSM ? 21 : 20, pitch: isSM ? 30 : 60, bearing: isSM ? 0 : -20 });
            }
        }
    },

    zoomToFeature(mapInstance, featureId) {
        if (!mapInstance || !geojsonData || !featureId) return;
        const feature = geojsonData.features.find(f => f.properties.id === featureId && f.properties.layer === 'rooms');
        if (!feature) return;
        const fb = new maplibregl.LngLatBounds();
        if (extendBoundsWithFeature(fb, feature)) {
            mapInstance.fitBounds(fb, { padding: 100, duration: 500, maxZoom: 19, pitch: 30, bearing: 0 });
        }
    },

    clearHighlight(mapInstance, sourceId = 'highlight-end') { this.highlightFeature(mapInstance, null, sourceId); },

    _hoveredId: null,
    _selectedId: null,

    /* Mirror feature-state onto both room sources: `rooms-extruded` (the
     * solid blocks / wall bands) and `rooms-flat` (the interior floor fill).
     * In walls mode only the floor visibly reacts (walls stay constant to
     * avoid z-fighting); in solid mode the block reacts. */
    _setUnitState(mapInstance, id, state) {
        if (id == null) return;
        for (const source of ['rooms-extruded', 'rooms-flat']) {
            try { mapInstance.setFeatureState({ source, id }, state); } catch (_) {}
        }
    },

    setHoverHighlight(mapInstance, featureId) {
        if (!mapInstance) return;
        if (this._hoveredId != null) this._setUnitState(mapInstance, this._hoveredId, { hover: false });
        this._hoveredId = featureId ?? null;
        if (featureId != null) this._setUnitState(mapInstance, featureId, { hover: true });
    },

    clearHoverHighlight(mapInstance) {
        this.setHoverHighlight(mapInstance, null);
    },

    selectFeature(mapInstance, featureId) {
        if (!mapInstance) return;
        if (this._selectedId != null) this._setUnitState(mapInstance, this._selectedId, { selected: false });
        this._selectedId = featureId ?? null;
        highlightedFeatureId = featureId ?? null;
        if (featureId != null) this._setUnitState(mapInstance, featureId, { selected: true });
    },

    flyToFeature(mapInstance, featureId) {
        if (!mapInstance || !geojsonData || !featureId) return;
        const feature = geojsonData.features.find(f => f.properties.id === featureId && f.properties.layer === 'rooms');
        if (!feature) return;
        const interaction = config.features.map.interaction || {};
        const fb = new maplibregl.LngLatBounds();
        if (!extendBoundsWithFeature(fb, feature)) return;
        mapInstance.fitBounds(fb, {
            padding: interaction.flyToPadding || 120,
            duration: interaction.flyToDuration || 800,
            maxZoom: interaction.flyToMaxZoom || 20,
            pitch: 60,
            bearing: mapInstance.getBearing(),
        });
    },

    setRouteOnMap(mapInstance, coordinates, onComplete, options = {}) {
        if (!mapInstance) return;
        const lines = options.lineStrings?.filter(l => l.length >= 2) || [];
        const primary = coordinates?.length >= 2 ? coordinates : lines[0];
        if (!primary || primary.length < 2) {
            cancelRouteAnimation(mapInstance);
            return;
        }
        animateRoute(mapInstance, primary, onComplete, options);
    },

    clearRoute(mapInstance) {
        if (!mapInstance) return;
        cancelRouteAnimation(mapInstance);
    },

    fitRouteOverview(mapInstance, coordinates, lineStrings = null) {
        if (!mapInstance) return;
        const lines = (lineStrings || []).filter(l => l?.length >= 2);
        const pointLists = lines.length ? lines : (coordinates?.length >= 2 ? [coordinates] : []);
        if (!pointLists.length) return;

        const bounds = new maplibregl.LngLatBounds();
        let n = 0;
        for (const coords of pointLists) {
            for (const c of coords) {
                if (!Array.isArray(c) || c.length < 2) continue;
                if (Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) continue;
                bounds.extend(c);
                n++;
            }
        }
        if (n < 2) {
            console.warn('[map-renderer] fitRouteOverview: no valid lng/lat coordinates');
            return;
        }

        // On mobile the bottom sheet covers the lower half of the screen, so a
        // plain center would tuck the route behind it. Pad the bottom by the
        // sheet's height (capped) to frame the route in the visible area above.
        const padding = { top: 80, bottom: 80, left: 60, right: 60 };
        const isMobile = typeof document !== 'undefined'
            && document.documentElement.classList.contains('mobile-layout');
        if (isMobile) {
            const sheet = document.getElementById('mobileBottomSheet');
            const vh = window.innerHeight || 800;
            if (sheet) {
                padding.bottom = Math.min(sheet.offsetHeight + 30, Math.round(vh * 0.6));
            }
        }

        mapInstance.fitBounds(bounds, {
            padding,
            duration: 1000,
            pitch: 0,
            bearing: mapInstance.getBearing(),
            maxZoom: 20,
        });
    },

    startRouteNavCamera(mapInstance, coordinates) {
        if (!mapInstance || !coordinates || coordinates.length < 2) return;
        const start = coordinates[0];
        const next = coordinates[Math.min(2, coordinates.length - 1)];

        const dx = next[0] - start[0];
        const dy = next[1] - start[1];
        const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;

        mapInstance.easeTo({
            center: start,
            zoom: 20,
            pitch: 65,
            bearing: bearing,
            duration: 1500,
        });
    },

    fitToAll(mapInstance) {
        if (!mapInstance || !geojsonData) return;
        const bounds = calculateBounds(geojsonData);
        if (bounds) mapInstance.fitBounds(bounds, { padding: 40, duration: 500, pitch: 60, bearing: -20 });
    },

    /**
     * Tag rooms features with `primaryCategory` + `categories` from
     * the loaded locations. Updates both `rooms-flat` (fill layer) and
     * `rooms-extruded` (3D layer) sources so paint expressions that
     * read those properties pick them up.
     *
     * Call this on `locations:loaded` *and* whenever the user edits an
     * item in the editor's "Birimler" tab.
     */
    applyLocationsToRooms(locations, targetMap) {
        if (!geojsonData) return;
        const byId = new Map();
        for (const loc of (locations || [])) {
            if (loc?.id) byId.set(loc.id, loc);
        }

        // Mutate the canonical geojson so future `setData` calls don't
        // wipe the enrichment back out.
        for (const f of geojsonData.features) {
            if (f.properties?.layer !== 'rooms') continue;
            const fid = f.properties.id;
            if (!fid) continue;
            const loc = byId.get(fid) || byId.get(normalizeRoomFeatureId(fid));
            if (!loc) continue;
            f.properties.primaryCategory = loc.primaryCategory || (loc.apiCategories?.[0] || '');
            f.properties.categories      = (loc.apiCategories || []).join(',');
        }

        const allRooms = geojsonData.features.filter(f => f.properties?.layer === 'rooms');
        const allDoors = geojsonData.features.filter(f => f.properties?.layer === 'doors');
        const allPaths = geojsonData.features.filter(f => f.properties?.layer === 'paths');
        const { flatFeatures, extrudedFeatures } = buildRoomSourceData(allRooms, allDoors, allPaths);

        const flatData     = { type: 'FeatureCollection', features: flatFeatures };
        const extrudedData = { type: 'FeatureCollection', features: extrudedFeatures };
        const maps = targetMap ? [targetMap] : [mainMap, storeMap];
        for (const m of maps) {
            if (!m || m._removed) continue;
            const sFlat = m.getSource('rooms-flat');     if (sFlat) sFlat.setData(flatData);
            const sExt  = m.getSource('rooms-extruded'); if (sExt)  sExt.setData(extrudedData);
        }
        this.refreshRoomColors(targetMap);
    },

    /** Re-evaluate the rooms color expression on every map. Call after
     *  the category mapping changes (preview override, sheet refresh). */
    refreshRoomColors(targetMap) {
        const floorExpr     = buildFloorColorExpr();
        const extrusionExpr = buildExtrusionColorExpr();
        const maps = targetMap ? [targetMap] : [mainMap, storeMap];
        for (const m of maps) {
            if (!m || m._removed) continue;
            try {
                if (m.getLayer('rooms-floor')) m.setPaintProperty('rooms-floor', 'fill-color', floorExpr);
                if (m.getLayer('rooms-3d'))    m.setPaintProperty('rooms-3d', 'fill-extrusion-color', extrusionExpr);
            } catch (e) {
                console.warn('refreshRoomColors failed', e);
            }
        }
    },

    updateLabelsFromLocations(locations, targetMap) {
        if (!geojsonData) return;
        const locMap = new Map();
        locations.forEach(loc => locMap.set(loc.id, loc));
        const writingFeatures = geojsonData.features.filter(f => f.properties.layer === 'writing');
        const features = [];
        for (const wf of writingFeatures) {
            // A label's first door line ("ID003_1_", "ID-220_1_") yields the
            // room id. The leading digits may be negative on lower floors
            // (Kat -1 → "ID-220"), so the old /^(ID\d+)_/ regex silently
            // dropped every negative-floor label. Strip the "_<door>_" suffix
            // from the first line instead.
            const firstLine = String(
                wf.properties.lines?.[0] ?? (wf.properties.text || '').split('\n')[0] ?? '',
            ).trim();
            const roomId = firstLine.replace(/_\d+_?$/, '').trim();
            if (!roomId) continue;
            const loc = locMap.get(roomId);
            if (!loc) continue;
            const label = loc.name || '';
            features.push({ type: 'Feature', geometry: { ...wf.geometry }, properties: { ...wf.properties, text: label } });
        }
        const rooms = geojsonData.features.filter(f => f.properties?.layer === 'rooms');
        const newData = filterWritingForDisabled({ type: 'FeatureCollection', features }, rooms);
        const maps = targetMap ? [targetMap] : [mainMap, storeMap];
        maps.forEach(m => { if (m && !m._removed) { const src = m.getSource('writing'); if (src) src.setData(newData); } });
        console.log(`✅ Updated ${newData.features.length} map labels from locations`);
    },

    resizeAll() {
        if (mainMap && !mainMap._removed) mainMap.resize();
        if (storeMap && !storeMap._removed) storeMap.resize();
    },

    findRoute(fromUnitId, toUnitId) {
        return findRoute(fromUnitId, toUnitId);
    },

    getAvailableUnits() {
        return getAvailableUnits();
    },

    dropPin(mapInstance, lngLat) {
        if (!mapInstance) return;
        const pinSrc = mapInstance.getSource('dropped-pin');
        if (pinSrc) {
            pinSrc.setData({
                type: 'FeatureCollection',
                features: [{
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] },
                    properties: {},
                }],
            });
        }
    },

    showSnapLine(mapInstance, fromLngLat, toCoord) {
        if (!mapInstance) return;
        const src = mapInstance.getSource('pin-snap-line');
        if (!src) return;
        src.setData({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [fromLngLat.lng, fromLngLat.lat],
                        toCoord,
                    ],
                },
                properties: {},
            }],
        });
    },

    clearPin(mapInstance) {
        if (!mapInstance) return;
        const empty = { type: 'FeatureCollection', features: [] };
        const pinSrc = mapInstance.getSource('dropped-pin');
        if (pinSrc) pinSrc.setData(empty);
        const lineSrc = mapInstance.getSource('pin-snap-line');
        if (lineSrc) lineSrc.setData(empty);
    },

    setPinMode(mapInstance, active) {
        if (!mapInstance) return;
        if (active) {
            const pinCfg = config.features.navigation?.droppedPin || {};
            const cursorColor = pinCfg.cursorColor || '#f97316';
            const url = createPinCursorUrl(cursorColor);
            mapInstance.getCanvas().style.cursor = `url(${url}) 24 24, crosshair`;
        } else {
            mapInstance.getCanvas().style.cursor = '';
        }
    },

    findNearestNode(lng, lat) {
        return findNearestNode(lng, lat);
    },

    findRouteFromNode(nodeKey, toUnitId) {
        return findRouteFromNode(nodeKey, toUnitId);
    },

    drawRouteStepHighlight(mutedLineStrings, activeLineStrings) {
        if (!mainMap) return;
        showRouteStepHighlight(mainMap, {
            mutedLineStrings: mutedLineStrings || [],
            activeLineStrings: activeLineStrings || [],
        });
    },

    drawRouteFromCoords(coordinates, onComplete, options = {}) {
        const lineStrings = options.lineStrings?.filter(l => l.length >= 2) || [];
        const primary = coordinates?.length >= 2
            ? coordinates
            : lineStrings.reduce((a, b) => (b.length > a.length ? b : a), lineStrings[0]);

        if (!mainMap || !primary || primary.length < 2) {
            console.warn('Cannot draw route: no map or insufficient coordinates');
            return;
        }
        this.fitRouteOverview(mainMap, primary, lineStrings);
        setTimeout(() => {
            this.setRouteOnMap(mainMap, primary, () => {
                setTimeout(() => {
                    this.startRouteNavCamera(mainMap, primary);
                }, 400);
                if (onComplete) onComplete();
            }, { lineStrings });
        }, 1200);
    },

    /** @deprecated Use `route:draw` — routing is server-side via `venue.routing` API. */
    drawRoute(fromUnitId, toUnitId, onComplete) {
        console.warn('[map-renderer] drawRoute is deprecated; emit route:draw instead');
        if (onComplete) onComplete();
        return null;
    },

    destroy() {
        _resizeObservers.forEach(obs => obs.disconnect());
        _resizeObservers.length = 0;
        if (mainMap) { mainMap.remove(); mainMap = null; }
        if (storeMap) { storeMap.remove(); storeMap = null; }
        geojsonData = null;
        geojsonLoaded = false;
    },
};
