/**
 * Geometry editing on the processed map — an in-browser indoor map editor.
 *
 * Select units (room polygons) on the 3D preview and:
 *   • Transform: Move / Scale / Rotate handles (single selection) — Turf rhumb.
 *   • Delete:   selected unit(s) + their writing label + room doors (paths kept).
 *   • Merge:    ≥2 selected units → one polygon (turf.union).
 *   • Split:    one unit → two, by drawing a cut line (half-plane intersect).
 *   • Add label: place a new `writing` feature anywhere.
 * Doors/portals/path-ends and the unit's writing label travel with a moved unit.
 * Live metric readout (area + bbox dimensions) for the selected unit.
 *
 * Edits are the source of truth: written to `mbState` (per-floor IndexedDB)
 * and pushed live into the preview iframe via the bridge.
 *
 * Identity is `properties.id`. Shift-click toggles multi-selection.
 */

import { mbState } from './state.js';
import { getProcessedMap, refreshProcessedRooms } from './process.js';
import { isUnitDisabled } from '../../features/map/unit-utils.js';

const SELECTED_SRC = 'mb-edit-selected-src';
const SELECTED_FILL = 'mb-edit-selected-fill';
const SELECTED_LINE = 'mb-edit-selected-line';
const DISABLED_SRC = 'mb-edit-disabled-src';
const DISABLED_FILL = 'mb-edit-disabled-fill';
const DISABLED_LINE = 'mb-edit-disabled-line';
const SPLIT_SRC = 'mb-edit-split-src';
const SPLIT_LINE = 'mb-edit-split-line';
const SPLIT_DOT = 'mb-edit-split-dot';

const ROOM_LAYERS = ['rooms-3d', 'rooms-floor'];

/* Sublayers that are not editable "units": the venue frame / corridors. They
 * can't be selected (so the big bottom-floor outline can't be picked) and are
 * never disabled. */
const NON_UNIT_SUBLAYERS = new Set(['walking', 'building']);
function isUnitProps(props) {
    return !NON_UNIT_SUBLAYERS.has(props?.sublayer);
}

/* Snap tolerance (metres). A moved unit whose boundary lands within this
 * distance of another unit's boundary is nudged to touch it; merge uses it
 * to close residual gaps between adjacent units. */
const SNAP_M = 0.75;

const HANDLE_ICON = {
    move: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
    scale: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
};

let app = null;
let selectedIds = new Set();   // all selected room ids
let primaryId = null;          // the single selection (transform + metric), else null
let mode = 'select';           // 'select' | 'split' | 'addLabel' | 'moveLabel' | 'reshape'
let splitPts = [];             // cut-line points while in split mode
let handles = { move: null, scale: null, rotate: null };
let dragState = null;
let patchTimer = null;
let savedCamera = null;        // processed-map camera saved while editing flat
let labelMarkers = [];         // draggable writing-label markers (moveLabel mode)
let reshapeMarkers = [];       // vertex + add-point markers (reshape mode)
let reshapeState = null;       // { roomId, geom, ring } while reshaping

/* ── helpers ─────────────────────────────────────────────────────────── */

function turf() { return window.turf; }
function emptyFC() { return { type: 'FeatureCollection', features: [] }; }
function activeFeatures() { return mbState.geojson?.features || []; }
function featuresByLayer(layer) { return activeFeatures().filter(f => f.properties?.layer === layer); }
function activeRooms() { return featuresByLayer('rooms'); }
function findRoom(id) { return activeRooms().find(f => String(f.properties?.id) === String(id)) || null; }
function cloneGeom(geom) { return JSON.parse(JSON.stringify(geom)); }

function centroidCoord(feature) {
    try { return turf().centroid(feature).geometry.coordinates; }
    catch { return null; }
}

function mapAnyCoords(geom, fn) {
    if (!geom) return geom;
    switch (geom.type) {
        case 'Point': return { ...geom, coordinates: fn(geom.coordinates) };
        case 'MultiPoint':
        case 'LineString': return { ...geom, coordinates: geom.coordinates.map(fn) };
        case 'MultiLineString':
        case 'Polygon': return { ...geom, coordinates: geom.coordinates.map(r => r.map(fn)) };
        case 'MultiPolygon': return { ...geom, coordinates: geom.coordinates.map(p => p.map(r => r.map(fn))) };
        default: return geom;
    }
}

/* ── snapping (move-to-neighbour + merge gap-closing) ────────────────── */
function bboxExpand(b, m) {
    const lat = (b[1] + b[3]) / 2;
    const dLat = m / 111320;
    const dLng = m / ((111320 * Math.cos((lat * Math.PI) / 180)) || 1e-9);
    return [b[0] - dLng, b[1] - dLat, b[2] + dLng, b[3] + dLat];
}
function bboxOverlap(a, b) {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function polyRings(geom) {
    if (geom?.type === 'Polygon') return geom.coordinates;
    if (geom?.type === 'MultiPolygon') return geom.coordinates.flat();
    return [];
}
function polyVertices(geom) {
    const out = [];
    for (const ring of polyRings(geom)) for (const c of ring) out.push(c);
    return out;
}
function polyOutlines(t, geom) {
    return polyRings(geom).filter(r => r.length >= 2).map(r => t.lineString(r));
}

/* Smallest translation (in lng/lat) that brings `movedGeom`'s boundary onto
 * the nearest neighbour boundary, if that gap is within `tolMeters`. Checks
 * both directions (moved vertices → neighbour edges and vice-versa) so a
 * corner or an edge can act as the snap anchor. Returns null if nothing is
 * close enough. */
function computeSnapDelta(movedGeom, neighborGeoms, tolMeters) {
    const t = turf();
    let best = null;
    const consider = (dist, delta) => {
        if (dist == null || !isFinite(dist) || dist <= 1e-9 || dist > tolMeters) return;
        if (best === null || dist < best.dist) best = { dist, delta };
    };

    const movedVerts = polyVertices(movedGeom);
    const movedLines = polyOutlines(t, movedGeom);

    for (const ng of neighborGeoms) {
        const ngLines = polyOutlines(t, ng);
        for (const ln of ngLines) {
            for (const v of movedVerts) {
                let snapped;
                try { snapped = t.nearestPointOnLine(ln, t.point(v), { units: 'meters' }); }
                catch { continue; }
                const sc = snapped.geometry.coordinates;
                consider(snapped.properties?.dist, [sc[0] - v[0], sc[1] - v[1]]);
            }
        }
        for (const v of polyVertices(ng)) {
            for (const ln of movedLines) {
                let snapped;
                try { snapped = t.nearestPointOnLine(ln, t.point(v), { units: 'meters' }); }
                catch { continue; }
                const sc = snapped.geometry.coordinates;
                consider(snapped.properties?.dist, [v[0] - sc[0], v[1] - sc[1]]);
            }
        }
    }
    return best ? best.delta : null;
}

/* Morphological closing: grow by `tolMeters` then shrink back, fusing pieces
 * separated by gaps up to ~2·tol into a single polygon. Used by merge so the
 * union of not-quite-touching units comes out solid. */
function closeGaps(geom, tolMeters) {
    const t = turf();
    try {
        const grown = t.buffer(t.feature(geom), tolMeters, { units: 'meters' });
        if (!grown) return geom;
        const back = t.buffer(grown, -tolMeters, { units: 'meters' });
        return back?.geometry || geom;
    } catch { return geom; }
}

/* ── transform op (move / scale / rotate) ────────────────────────────── */
function buildOp(ds, current) {
    const t = turf();
    const { kind, centroid, startHandle } = ds;
    if (kind === 'move') {
        return { kind: 'move', dLng: current[0] - startHandle[0], dLat: current[1] - startHandle[1] };
    }
    if (kind === 'scale') {
        const d0 = t.distance(centroid, startHandle) || 1e-9;
        const d1 = t.distance(centroid, current);
        return { kind: 'scale', origin: centroid, factor: Math.max(0.05, d1 / d0) };
    }
    const b0 = t.bearing(centroid, startHandle);
    const b1 = t.bearing(centroid, current);
    return { kind: 'rotate', pivot: centroid, angle: b1 - b0 };
}

function applyOpCoord(coord, op) {
    const t = turf();
    if (op.kind === 'move') return [coord[0] + op.dLng, coord[1] + op.dLat];
    const ref = op.kind === 'scale' ? op.origin : op.pivot;
    const dist = t.rhumbDistance(ref, coord);
    if (!isFinite(dist) || dist === 0) return [coord[0], coord[1]];
    const brng = t.rhumbBearing(ref, coord);
    if (op.kind === 'scale') {
        return t.rhumbDestination(ref, dist * op.factor, brng).geometry.coordinates;
    }
    return t.rhumbDestination(ref, dist, brng + op.angle).geometry.coordinates;
}

/* ── unit ↔ door/path/writing association ─────────────────────────────── */
function coordInRoom(coord, roomPoly) {
    try { return turf().booleanPointInPolygon(coord, roomPoly); }
    catch { return false; }
}

function lineTouchesRoom(feat, roomPoly) {
    const coords = feat.geometry?.coordinates;
    if (!Array.isArray(coords) || !coords.length) return false;
    for (const c of coords) if (coordInRoom(c, roomPoly)) return true;
    if (coords.length >= 2) {
        const a = coords[0], b = coords[1];
        if (coordInRoom([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], roomPoly)) return true;
    }
    return false;
}

/** Writing labels belonging to a room: point inside the polygon, or the
 *  label's first line resolves to this room id (e.g. "ID003_1_" → "ID003"). */
function collectWritingForRoom(roomGeom, roomId) {
    const poly = turf().feature(roomGeom);
    const rid = roomId != null ? String(roomId) : '';
    const out = [];
    for (const w of featuresByLayer('writing')) {
        const c = w.geometry?.coordinates;
        const inside = Array.isArray(c) && coordInRoom(c, poly);
        const firstLine = String(w.properties?.lines?.[0] ?? (w.properties?.text || '').split('\n')[0] ?? '').trim();
        const wRoomId = firstLine.replace(/_\d+_?$/, '').trim();
        if (inside || (rid && wRoomId === rid)) out.push(w);
    }
    return out;
}

function collectAttached(roomGeom, roomId) {
    const roomPoly = turf().feature(roomGeom);
    const attached = [];
    for (const f of [...featuresByLayer('doors'), ...featuresByLayer('portals')]) {
        if (lineTouchesRoom(f, roomPoly)) {
            attached.push({ feat: f, layer: f.properties.layer, origGeom: cloneGeom(f.geometry) });
        }
    }
    for (const w of collectWritingForRoom(roomGeom, roomId)) {
        attached.push({ feat: w, layer: 'writing', origGeom: cloneGeom(w.geometry) });
    }
    const pathParts = [];
    for (const f of featuresByLayer('paths')) {
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords)) continue;
        const insideIdx = new Set();
        coords.forEach((c, i) => { if (coordInRoom(c, roomPoly)) insideIdx.add(i); });
        if (insideIdx.size) pathParts.push({ feat: f, origGeom: cloneGeom(f.geometry), insideIdx });
    }
    return { attached, pathParts };
}

/* ── live propagation ────────────────────────────────────────────────── */
function refreshProcessedSources() {
    const map = getProcessedMap();
    if (!map) return;
    const rooms = activeRooms();
    map.getSource('rooms')?.setData({ type: 'FeatureCollection', features: rooms });
    // Rebuild floors + extruded blocks/walls the render-mode-aware way so the
    // 3D view (and wall mode) tracks geometry edits live.
    refreshProcessedRooms();
    for (const layer of ['doors', 'paths', 'portals', 'writing']) {
        map.getSource(layer)?.setData({ type: 'FeatureCollection', features: featuresByLayer(layer) });
    }
    drawSelection();
}

function scheduleBridgePatch() {
    clearTimeout(patchTimer);
    patchTimer = setTimeout(() => {
        try { app?.bridge?.patchGeojson?.(mbState.buildMergedGeojson()); }
        catch (e) { console.warn('[geometry-edit] bridge patch failed', e); }
    }, 100);
}

/* ── selection rendering ─────────────────────────────────────────────── */
function ensureSelectionLayers(map) {
    // Disabled overlay sits below the selection highlight so a selected
    // disabled unit still shows its blue outline on top.
    if (!map.getSource(DISABLED_SRC)) map.addSource(DISABLED_SRC, { type: 'geojson', data: emptyFC() });
    if (!map.getLayer(DISABLED_FILL)) {
        map.addLayer({ id: DISABLED_FILL, type: 'fill', source: DISABLED_SRC, paint: { 'fill-color': '#64748b', 'fill-opacity': 0.5 } });
    }
    if (!map.getLayer(DISABLED_LINE)) {
        map.addLayer({ id: DISABLED_LINE, type: 'line', source: DISABLED_SRC, paint: { 'line-color': '#475569', 'line-width': 1.5, 'line-dasharray': [2, 2] } });
    }
    if (!map.getSource(SELECTED_SRC)) map.addSource(SELECTED_SRC, { type: 'geojson', data: emptyFC() });
    if (!map.getLayer(SELECTED_FILL)) {
        map.addLayer({ id: SELECTED_FILL, type: 'fill', source: SELECTED_SRC, paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.18 } });
    }
    if (!map.getLayer(SELECTED_LINE)) {
        map.addLayer({ id: SELECTED_LINE, type: 'line', source: SELECTED_SRC, paint: { 'line-color': '#2563eb', 'line-width': 2.5 } });
    }
}

function drawSelection() {
    const map = getProcessedMap();
    if (!map) return;
    ensureSelectionLayers(map);
    const dis = map.getSource(DISABLED_SRC);
    if (dis) dis.setData({ type: 'FeatureCollection', features: activeRooms().filter(r => isUnitDisabled(r.properties)) });
    const src = map.getSource(SELECTED_SRC);
    if (!src) return;
    const feats = [...selectedIds].map(findRoom).filter(Boolean);
    src.setData({ type: 'FeatureCollection', features: feats });
}

/* ── split overlay ───────────────────────────────────────────────────── */
function ensureSplitLayer(map) {
    if (!map.getSource(SPLIT_SRC)) map.addSource(SPLIT_SRC, { type: 'geojson', data: emptyFC() });
    if (!map.getLayer(SPLIT_LINE)) {
        map.addLayer({ id: SPLIT_LINE, type: 'line', source: SPLIT_SRC, filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#dc2626', 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
    }
    if (!map.getLayer(SPLIT_DOT)) {
        map.addLayer({ id: SPLIT_DOT, type: 'circle', source: SPLIT_SRC, filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#dc2626', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    }
}

function drawSplitOverlay() {
    const map = getProcessedMap();
    if (!map) return;
    ensureSplitLayer(map);
    const src = map.getSource(SPLIT_SRC);
    if (!src) return;
    const feats = splitPts.map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
    if (splitPts.length >= 2) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: splitPts } });
    src.setData({ type: 'FeatureCollection', features: feats });
}

function clearSplitOverlay() {
    splitPts = [];
    const map = getProcessedMap();
    map?.getSource(SPLIT_SRC)?.setData(emptyFC());
}

/* ── handles (markers) ───────────────────────────────────────────────── */
function makeHandleEl(kind) {
    const el = document.createElement('div');
    el.className = `ed-mb-edit-handle ed-mb-edit-handle-${kind}`;
    el.title = kind === 'move' ? 'Taşı' : kind === 'scale' ? 'Boyutlandır' : 'Döndür';
    el.innerHTML = HANDLE_ICON[kind];
    return el;
}

function clearHandles() {
    for (const k of Object.keys(handles)) {
        if (handles[k]) { try { handles[k].remove(); } catch {} handles[k] = null; }
    }
}

function handlePositions(feature) {
    const t = turf();
    const bbox = t.bbox(feature);
    const c = centroidCoord(feature);
    return {
        move: c,
        scale: [bbox[2], bbox[3]],
        rotate: [c[0], bbox[3] + (bbox[3] - bbox[1]) * 0.18],
    };
}

/* The processed map is tilted 3D (pitch 60). Editing handles live on the
 * ground footprint, which under tilt is offset from the visible extruded top —
 * the root cause of "handles in the wrong place". Flatten to a top-down view
 * while a unit is being edited so the footprint == what the user sees; the
 * previous camera is restored when the selection is cleared. */
function flattenForEdit() {
    const map = getProcessedMap();
    if (!map) return;
    const pitch = map.getPitch ? map.getPitch() : 0;
    const bearing = map.getBearing ? map.getBearing() : 0;
    if (pitch === 0 && bearing === 0) return;
    if (!savedCamera) savedCamera = { pitch, bearing };
    try { map.easeTo({ pitch: 0, bearing: 0, duration: 250 }); } catch (_) { /* best-effort */ }
}
function restoreCamera() {
    const map = getProcessedMap();
    if (!map || !savedCamera) return;
    const cam = savedCamera; savedCamera = null;
    try { map.easeTo({ pitch: cam.pitch, bearing: cam.bearing, duration: 250 }); } catch (_) { /* best-effort */ }
}

function positionHandles() {
    const map = getProcessedMap();
    const feat = primaryId ? findRoom(primaryId) : null;
    if (!map || !feat || !turf() || mode !== 'select') { clearHandles(); return; }
    flattenForEdit();
    clearHandles();
    const pos = handlePositions(feat);
    const Marker = window.maplibregl.Marker;
    for (const kind of ['move', 'scale', 'rotate']) {
        handles[kind] = new Marker({ element: makeHandleEl(kind), draggable: true }).setLngLat(pos[kind]).addTo(map);
        wireHandle(kind, handles[kind]);
    }
}

function repositionHandles(exceptKind) {
    const feat = primaryId ? findRoom(primaryId) : null;
    if (!feat || !turf()) return;
    const pos = handlePositions(feat);
    for (const kind of ['move', 'scale', 'rotate']) {
        if (kind === exceptKind) continue;
        if (handles[kind]) handles[kind].setLngLat(pos[kind]);
    }
}

function wireHandle(kind, marker) {
    marker.on('dragstart', () => {
        const feat = findRoom(primaryId);
        if (!feat) return;
        const { attached, pathParts } = collectAttached(feat.geometry, feat.properties.id);
        dragState = {
            kind,
            origGeom: cloneGeom(feat.geometry),
            centroid: centroidCoord(feat),
            startHandle: marker.getLngLat().toArray(),
            attached,
            pathParts,
        };
    });
    marker.on('drag', () => {
        if (!dragState) return;
        applyDrag(marker.getLngLat().toArray());
        repositionHandles(kind);
    });
    marker.on('dragend', () => {
        if (!dragState) return;
        applyDrag(marker.getLngLat().toArray());
        if (dragState.kind === 'move') snapToNeighbors();
        commitEdit();
        dragState = null;
        positionHandles();
    });
}

/* Translate the moved unit + its attached doors/labels (and the inside
 * vertices of split path segments) by `delta` lng/lat. */
function translateSelection(delta) {
    const feat = findRoom(primaryId);
    if (!feat || !dragState) return;
    const tr = c => [c[0] + delta[0], c[1] + delta[1]];
    feat.geometry = mapAnyCoords(feat.geometry, tr);
    for (const a of (dragState.attached || [])) a.feat.geometry = mapAnyCoords(a.feat.geometry, tr);
    for (const p of (dragState.pathParts || [])) {
        p.feat.geometry = {
            ...p.feat.geometry,
            coordinates: (p.feat.geometry.coordinates || []).map((c, i) => (p.insideIdx.has(i) ? tr(c) : c)),
        };
    }
}

/* After a move, pull the unit onto the nearest neighbouring unit if the gap
 * is within SNAP_M so adjacent units sit flush instead of floating. */
function snapToNeighbors() {
    const feat = findRoom(primaryId);
    if (!feat || !dragState || dragState.kind !== 'move' || !turf()) return;
    const t = turf();
    const exclude = new Set([
        String(primaryId),
        ...(dragState.attached || []).map(a => String(a.feat.properties?.id)),
    ]);
    let movedBox;
    try { movedBox = bboxExpand(t.bbox(t.feature(feat.geometry)), SNAP_M); }
    catch { return; }
    const neighbors = activeRooms()
        .filter(r => !exclude.has(String(r.properties?.id)))
        .filter(r => {
            const sl = r.properties?.sublayer;
            if (sl === 'walking' || sl === 'building') return false; // skip floor/shell
            try { return bboxOverlap(t.bbox(t.feature(r.geometry)), movedBox); }
            catch { return false; }
        })
        .map(r => r.geometry);
    if (!neighbors.length) return;
    const delta = computeSnapDelta(feat.geometry, neighbors, SNAP_M);
    if (!delta) return;
    translateSelection(delta);
    refreshProcessedSources();
    scheduleBridgePatch();
    updateMetric();
}

function applyDrag(current) {
    const feat = findRoom(primaryId);
    if (!feat || !dragState) return;
    const op = buildOp(dragState, current);

    feat.geometry = mapAnyCoords(dragState.origGeom, c => applyOpCoord(c, op));
    for (const a of (dragState.attached || [])) {
        a.feat.geometry = mapAnyCoords(a.origGeom, c => applyOpCoord(c, op));
    }
    for (const p of (dragState.pathParts || [])) {
        const coords = p.origGeom.coordinates;
        p.feat.geometry = {
            ...p.origGeom,
            coordinates: coords.map((c, i) => (p.insideIdx.has(i) ? applyOpCoord(c, op) : c)),
        };
    }

    refreshProcessedSources();
    scheduleBridgePatch();
    updateMetric();
}

async function commitEdit() {
    const ds = dragState;
    const feat = findRoom(primaryId);
    if (!feat) return;
    const updates = [{ id: feat.properties.id, layer: 'rooms', geometry: feat.geometry }];
    for (const a of (ds?.attached || [])) {
        updates.push({ id: a.feat.properties.id, layer: a.layer, geometry: a.feat.geometry });
    }
    for (const p of (ds?.pathParts || [])) {
        updates.push({ id: p.feat.properties.id, layer: 'paths', geometry: p.feat.geometry });
    }
    await mbState.applyEditedFeatures(updates);
    scheduleBridgePatch();
    const extra = updates.length - 1;
    app?.setStatus?.(
        extra > 0
            ? `Birim güncellendi: ${feat.properties.id} (+${extra} kapı/etiket)`
            : `Birim güncellendi: ${feat.properties.id}`,
        'saved',
    );
    app?.onStorageChange?.();
}

/* ── writing label drag (moveLabel mode) ─────────────────────────────── */
function clearLabelMarkers() {
    for (const m of labelMarkers) { try { m.remove(); } catch (_) {} }
    labelMarkers = [];
}

function ownerRoomOfWriting(w) {
    const firstLine = String(w.properties?.lines?.[0] ?? (w.properties?.text || '').split('\n')[0] ?? '').trim();
    const rid = firstLine.replace(/_\d+_?$/, '').trim();
    return rid ? findRoom(rid) : null;
}

const LABEL_HANDLE_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/></svg>';

function showLabelMarkers() {
    const map = getProcessedMap();
    if (!map || !window.maplibregl) return;
    clearLabelMarkers();
    const Marker = window.maplibregl.Marker;
    for (const w of featuresByLayer('writing')) {
        const c = w.geometry?.coordinates;
        if (!Array.isArray(c)) continue;
        const el = document.createElement('div');
        el.className = 'ed-mb-edit-handle ed-mb-edit-handle-label';
        el.title = `Yazıyı taşı: ${w.properties?.id || ''}`;
        el.innerHTML = LABEL_HANDLE_ICON;
        const marker = new Marker({ element: el, draggable: true }).setLngLat(c).addTo(map);
        const wid = w.properties.id;
        marker.on('drag', () => {
            const ll = marker.getLngLat();
            const wf = featuresByLayer('writing').find(x => x.properties.id === wid);
            if (!wf) return;
            wf.geometry = { type: 'Point', coordinates: [ll.lng, ll.lat] };
            map.getSource('writing')?.setData({ type: 'FeatureCollection', features: featuresByLayer('writing') });
        });
        marker.on('dragend', async () => {
            const ll = marker.getLngLat();
            let coord = [ll.lng, ll.lat];
            const wf = featuresByLayer('writing').find(x => x.properties.id === wid);
            // Keep the label within its owning unit when it has one.
            const owner = wf ? ownerRoomOfWriting(wf) : null;
            if (owner && turf()) {
                try {
                    if (!coordInRoom(coord, turf().feature(owner.geometry))) {
                        coord = centroidCoord(owner) || coord;
                        marker.setLngLat(coord);
                    }
                } catch (_) { /* keep dropped point */ }
            }
            if (wf) wf.geometry = { type: 'Point', coordinates: coord };
            await mbState.applyEditedFeatures([{ id: wid, layer: 'writing', geometry: { type: 'Point', coordinates: coord } }]);
            refreshProcessedSources();
            scheduleBridgePatch();
            app?.onStorageChange?.();
        });
        labelMarkers.push(marker);
    }
}

/* ── reshape (vertex editing) ─────────────────────────────────────────── *
 * Drag a unit's corners directly. Each polygon vertex gets a draggable marker;
 * a small "+" marker sits on every edge midpoint to insert a corner, and
 * double-clicking a corner removes it (min 3). Reliable + dependency-free, and
 * the markers track the (flattened) map so they sit exactly on the corners. */
function clearReshapeMarkers() {
    for (const m of reshapeMarkers) { try { m.remove(); } catch (_) {} }
    reshapeMarkers = [];
}

function ringSignedArea(ring) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return a / 2;
}

/* The outer ring to edit: the polygon's ring, or the largest part of a
 * MultiPolygon. Returned by reference so mutating it mutates the geometry. */
function editableOuterRing(geom) {
    if (geom?.type === 'Polygon' && geom.coordinates[0]?.length >= 4) return geom.coordinates[0];
    if (geom?.type === 'MultiPolygon') {
        let best = null, bestA = -1;
        for (const part of geom.coordinates) {
            const r = part[0];
            if (!r || r.length < 4) continue;
            const a = Math.abs(ringSignedArea(r));
            if (a > bestA) { bestA = a; best = r; }
        }
        return best;
    }
    return null;
}

function startReshapeMode() {
    if (!primaryId) return;
    const room = findRoom(primaryId);
    const map = getProcessedMap();
    if (!room || !map) return;
    const geom = cloneGeom(room.geometry);
    const ring = editableOuterRing(geom);
    if (!ring) { app?.setStatus?.('Bu birim yeniden şekillendirilemiyor', 'dirty'); return; }
    flattenForEdit();
    clearHandles();
    reshapeState = { roomId: String(primaryId), geom, ring };
    setMode('reshape');
    rebuildReshapeMarkers();
    app?.setStatus?.('Köşeleri sürükleyin · kenar ortasındaki + ile köşe ekleyin · köşeye çift tık siler · "Bitir" kaydeder (Esc iptal)', 'dirty');
}

function applyReshapeLive() {
    if (!reshapeState) return;
    const room = findRoom(reshapeState.roomId);
    if (!room) return;
    room.geometry = reshapeState.geom;
    refreshProcessedSources();
    scheduleBridgePatch();
    updateMetric();
}

function insertReshapeVertex(at, coord) {
    if (!reshapeState) return;
    reshapeState.ring.splice(at, 0, [coord[0], coord[1]]);
    applyReshapeLive();
    rebuildReshapeMarkers();
}

function deleteReshapeVertex(idx) {
    if (!reshapeState) return;
    const ring = reshapeState.ring;
    if (ring.length - 1 <= 3) { app?.setStatus?.('Bir birimde en az 3 köşe olmalı', 'dirty'); return; }
    ring.splice(idx, 1);
    if (idx === 0) ring[ring.length - 1] = [ring[0][0], ring[0][1]];  // keep ring closed
    applyReshapeLive();
    rebuildReshapeMarkers();
}

function rebuildReshapeMarkers() {
    const map = getProcessedMap();
    if (!map || !reshapeState || !window.maplibregl) return;
    clearReshapeMarkers();
    const Marker = window.maplibregl.Marker;
    const ring = reshapeState.ring;
    const n = ring.length - 1;   // last vertex duplicates the first

    for (let i = 0; i < n; i++) {
        const el = document.createElement('div');
        el.className = 'ed-mb-edit-handle ed-mb-vertex-handle';
        el.title = 'Köşe — sürükle, çift tık siler';
        const marker = new Marker({ element: el, draggable: true }).setLngLat(ring[i]).addTo(map);
        const idx = i;
        marker.on('drag', () => {
            const ll = marker.getLngLat();
            ring[idx] = [ll.lng, ll.lat];
            if (idx === 0) ring[n] = [ll.lng, ll.lat];
            applyReshapeLive();
        });
        marker.on('dragend', () => { applyReshapeLive(); rebuildReshapeMarkers(); });
        el.addEventListener('dblclick', (ev) => { ev.stopPropagation(); ev.preventDefault(); deleteReshapeVertex(idx); });
        reshapeMarkers.push(marker);
    }

    for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const el = document.createElement('div');
        el.className = 'ed-mb-edit-handle ed-mb-vertex-add';
        el.title = 'Köşe ekle';
        el.textContent = '+';
        const marker = new Marker({ element: el, draggable: false }).setLngLat(mid).addTo(map);
        const insertAt = i + 1;
        el.addEventListener('click', (ev) => { ev.stopPropagation(); insertReshapeVertex(insertAt, mid); });
        reshapeMarkers.push(marker);
    }
}

async function finishReshapeMode() {
    const room = reshapeState ? findRoom(reshapeState.roomId) : null;
    const geom = reshapeState ? reshapeState.geom : null;
    clearReshapeMarkers();
    if (room && geom) {
        room.geometry = geom;
        await mbState.applyEditedFeatures([{ id: room.properties.id, layer: 'rooms', geometry: geom }]);
        refreshProcessedSources();
        scheduleBridgePatch();
        app?.setStatus?.(`Şekil güncellendi: ${room.properties.id}`, 'saved');
        app?.onStorageChange?.();
    }
    reshapeState = null;
    setMode('select');
    if (primaryId) positionHandles();
}

/* ── metric readout ──────────────────────────────────────────────────── */
function computeMetric(feat) {
    const t = turf();
    try {
        const area = t.area(feat);                  // m²
        const bb = t.bbox(feat);
        const w = t.rhumbDistance([bb[0], bb[1]], [bb[2], bb[1]], { units: 'meters' });
        const h = t.rhumbDistance([bb[0], bb[1]], [bb[0], bb[3]], { units: 'meters' });
        return { area, w, h };
    } catch { return null; }
}

function updateMetric() {
    const $m = document.getElementById('mbEditMetric');
    if (!$m) return;
    const feat = primaryId ? findRoom(primaryId) : null;
    const sub = feat?.properties?.sublayer;
    if (!feat || sub === 'walking' || sub === 'building') { $m.textContent = ''; return; }
    const m = computeMetric(feat);
    if (!m) { $m.textContent = ''; return; }
    $m.textContent = `≈ ${Math.round(m.area)} m² · ${m.w.toFixed(1)}×${m.h.toFixed(1)} m`;
}

/* ── actions: disable / delete / merge / split / add label ────────────── */
async function toggleDisableSelected() {
    const rooms = [...selectedIds].map(findRoom).filter(Boolean).filter(r => isUnitProps(r.properties));
    if (!rooms.length) return;
    // If any selected unit is still enabled → disable all; if all already
    // disabled → re-enable all.
    const disable = rooms.some(r => !isUnitDisabled(r.properties));
    const updates = rooms.map(r => ({
        id: r.properties.id, layer: 'rooms', properties: { disabled: disable },
    }));
    await mbState.patchFeatureProperties(updates);
    refreshProcessedSources();
    scheduleBridgePatch();
    afterSelectionChange();
    app?.setStatus?.(
        disable ? `${rooms.length} birim devre dışı bırakıldı` : `${rooms.length} birim etkinleştirildi`,
        'saved',
    );
    app?.onStorageChange?.();
}

async function deleteSelected() {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const refs = [];
    for (const id of ids) {
        const room = findRoom(id);
        if (!room) continue;
        refs.push({ id: room.properties.id, layer: 'rooms' });
        const poly = turf().feature(room.geometry);
        for (const w of collectWritingForRoom(room.geometry, room.properties.id)) {
            refs.push({ id: w.properties.id, layer: 'writing' });
        }
        for (const d of featuresByLayer('doors')) {
            if (lineTouchesRoom(d, poly)) refs.push({ id: d.properties.id, layer: 'doors' });
        }
    }
    if (!refs.length) return;
    const n = ids.length;
    await mbState.removeFeatures(refs);
    clearSelection();
    refreshProcessedSources();
    scheduleBridgePatch();
    app?.setStatus?.(`${n} birim silindi (etiket + kapı dahil)`, 'saved');
    app?.onStorageChange?.();
}

async function mergeSelected() {
    const rooms = [...selectedIds].map(findRoom).filter(Boolean);
    if (rooms.length < 2) return;
    const t = turf();
    let union;
    try { union = t.union(t.featureCollection(rooms.map(r => t.feature(r.geometry)))); }
    catch (e) { app?.setStatus?.('Birleştirme başarısız (geçersiz geometri)', 'dirty'); return; }
    if (!union?.geometry) { app?.setStatus?.('Birleştirme başarısız', 'dirty'); return; }

    // If the units don't quite touch, union leaves a gap (MultiPolygon).
    // Close it so the merged unit comes out as one solid polygon.
    let geom = union.geometry;
    if (geom.type === 'MultiPolygon') {
        const closed = closeGaps(geom, SNAP_M);
        const closedParts = closed?.type === 'MultiPolygon' ? closed.coordinates.length : 1;
        const origParts = geom.coordinates.length;
        if (closed && closedParts < origParts) geom = closed;
    }

    // Keep the largest unit's id + properties so its Sheets/routing link survives.
    const primary = rooms.slice().sort((a, b) => t.area(b) - t.area(a))[0];
    const merged = { type: 'Feature', properties: { ...primary.properties }, geometry: geom };

    await mbState.replaceFeatures({
        remove: rooms.map(r => ({ id: r.properties.id, layer: 'rooms' })),
        add: [merged],
    });
    selectedIds = new Set([String(primary.properties.id)]);
    recomputePrimary();
    afterSelectionChange();
    refreshProcessedSources();
    scheduleBridgePatch();
    app?.setStatus?.(`${rooms.length} birim birleştirildi → ${primary.properties.id}`, 'saved');
    app?.onStorageChange?.();
}

function startSplit() {
    if (selectedIds.size !== 1) return;
    clearSplitOverlay();
    setMode('split');
    const map = getProcessedMap();
    if (map) {
        map.doubleClickZoom?.disable?.();
        if (!map.__mbSplitDbl) { map.__mbSplitDbl = onSplitDblClick; map.on('dblclick', onSplitDblClick); }
    }
    app?.setStatus?.('Kesme çizgisi için noktalar tıklayın (2+); bitirmek için çift tık / Enter / "Bitir", iptal için Esc', 'dirty');
}

function handleSplitClick(e) {
    splitPts.push([e.lngLat.lng, e.lngLat.lat]);
    drawSplitOverlay();
}

function onSplitDblClick() {
    // The double tap registered two near-identical points — drop the trailing one.
    if (splitPts.length > 2) splitPts.pop();
    finishSplit();
}

function finishSplit() {
    if (splitPts.length < 2) { exitMode(); app?.setStatus?.('Parçalama iptal edildi (en az 2 nokta gerekli)', 'saved'); return; }
    doSplit();
}

function dedupePts(pts) {
    const out = [];
    for (const p of pts) {
        const last = out[out.length - 1];
        if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) out.push(p);
    }
    return out;
}

/* Extend the cut polyline beyond its ends so it crosses the polygon boundary
 * (otherwise a difference makes a notch, not a clean separation). */
function extendPolyline(pts, R) {
    const a0 = pts[0], a1 = pts[1];
    const bn = pts[pts.length - 1], bm = pts[pts.length - 2];
    const d0x = a0[0] - a1[0], d0y = a0[1] - a1[1]; const l0 = Math.hypot(d0x, d0y) || 1e-9;
    const dnx = bn[0] - bm[0], dny = bn[1] - bm[1]; const ln = Math.hypot(dnx, dny) || 1e-9;
    return [
        [a0[0] + (d0x / l0) * R, a0[1] + (d0y / l0) * R],
        ...pts,
        [bn[0] + (dnx / ln) * R, bn[1] + (dny / ln) * R],
    ];
}

/* Split a polygon by an arbitrary (multi-vertex) cut line: thicken the line
 * into a thin strip and subtract it — the polygon falls into 2+ pieces.
 *
 * After the cut, the strip leaves a thin GAP between pieces; if left as-is each
 * piece builds its own perimeter wall and a double wall (with a groove) shows
 * at the split. So we snap each piece's near-cut vertices back onto the cut
 * line, making the shared edge coincident → the two pieces read as one wall
 * there (same as any two adjacent units). The cut only ever touches `geom`
 * (the selected unit), so no other unit is affected. */
function splitPolygonByLine(geom, rawPts) {
    const t = turf();
    const pts = dedupePts(rawPts);
    if (pts.length < 2) return [];
    const extended = extendPolyline(pts, 0.02);
    let strip;
    try { strip = t.buffer(t.lineString(extended), 0.08, { units: 'meters' }); }
    catch { return []; }
    if (!strip) return [];
    let diff;
    try { diff = t.difference(t.featureCollection([t.feature(geom), strip])); }
    catch { return []; }
    const g = diff?.geometry;
    if (!g) return [];

    let pieces;
    if (g.type === 'Polygon') pieces = [{ type: 'Polygon', coordinates: g.coordinates }];
    else if (g.type === 'MultiPolygon') pieces = g.coordinates.map(poly => ({ type: 'Polygon', coordinates: poly }));
    else return [];

    // Close the strip gap so neighbouring split pieces share the cut edge.
    let cutLine;
    try { cutLine = t.lineString(extended); } catch { cutLine = null; }
    if (cutLine) {
        const snap = (coord) => {
            try {
                const np = t.nearestPointOnLine(cutLine, t.point(coord), { units: 'meters' });
                if (np.properties.dist <= 0.14) return np.geometry.coordinates;
            } catch (_) { /* keep */ }
            return coord;
        };
        pieces = pieces.map(poly => {
            const snapped = { type: 'Polygon', coordinates: poly.coordinates.map(ring => ring.map(snap)) };
            try { return t.cleanCoords(t.feature(snapped)).geometry; }
            catch { return snapped; }
        });
    }

    return pieces;
}

/* Allocate a fresh unit id following the floor's IDxxx (zero-padded) scheme,
 * guaranteed not to collide with `taken`. Falls back to a letter suffix on the
 * base id when the floor doesn't use the IDxxx convention. */
function allocateUnitId(baseId, taken) {
    const nums = [];
    let width = 3;
    for (const id of taken) {
        const m = /^ID0*(\d+)$/i.exec(String(id));
        if (m) {
            nums.push(parseInt(m[1], 10));
            width = Math.max(width, String(id).replace(/^ID/i, '').length);
        }
    }
    if (nums.length) {
        let n = Math.max(...nums) + 1;
        let candidate = 'ID' + String(n).padStart(width, '0');
        while (taken.has(candidate)) { n++; candidate = 'ID' + String(n).padStart(width, '0'); }
        return candidate;
    }
    // Non-standard ids → letter suffix on the base id (B, C, …).
    let i = 1;
    let candidate = `${baseId}${String.fromCharCode(65 + i)}`;
    while (taken.has(candidate) && i < 25) { i++; candidate = `${baseId}${String.fromCharCode(65 + i)}`; }
    return candidate;
}

/* 3-line writing label matching the SVG-converter shape so the runtime
 * location binding (lines[0] → "IDxxx") resolves the store name. */
function makeWritingFeature(id, coord) {
    const lines = [`${id}_1_`, `${id}_2_`, `${id}_3_`];
    return {
        type: 'Feature',
        properties: { id: `w_${id}`, layer: 'writing', text: lines.join('\n'), lines, font_size: 12, room_area: 0 },
        geometry: { type: 'Point', coordinates: coord },
    };
}

async function doSplit() {
    const room = findRoom(primaryId);
    if (!room) { exitMode(); return; }
    const t = turf();
    const pieces = splitPolygonByLine(room.geometry, splitPts);

    // Drop sliver fragments (a near-edge cut can shave a tiny piece) so only
    // real subdivisions become units — the split affects exactly the selected
    // unit and yields the pieces the user intended, nothing stray.
    const origArea = (() => { try { return t.area(t.feature(room.geometry)); } catch { return 0; } })();
    const minPieceArea = Math.max(0.25, origArea * 0.01);
    const ordered = pieces
        .map(g => ({ g, area: (() => { try { return t.area(t.feature(g)); } catch { return 0; } })() }))
        .filter(p => p.area >= minPieceArea)
        .sort((a, b) => b.area - a.area);

    if (ordered.length < 2) {
        app?.setStatus?.('Parçalama başarısız: kesme çizgisi seçili birimi baştan başa ikiye bölmeli', 'dirty');
        clearSplitOverlay();
        return;
    }
    const baseId = String(room.properties.id);
    // Largest piece keeps the original id so its Sheets link (category colour +
    // title) and existing writing survive. Each extra piece gets a fresh,
    // collision-free id in the floor's convention plus its own 3-line writing.

    const taken = new Set(activeRooms().map(r => String(r.properties.id)));
    const addRooms = [];
    const addWritings = [];
    const newIds = [];
    ordered.forEach(({ g }, i) => {
        let id = baseId;
        if (i > 0) { id = allocateUnitId(baseId, taken); taken.add(id); newIds.push(id); }
        addRooms.push({ type: 'Feature', properties: { ...room.properties, id }, geometry: g });
        if (i > 0) {
            let coord = null;
            try { coord = t.centroid(t.feature(g)).geometry.coordinates; } catch { coord = null; }
            if (coord) addWritings.push(makeWritingFeature(id, coord));
        }
    });

    await mbState.replaceFeatures({
        remove: [{ id: baseId, layer: 'rooms' }],
        add: [...addRooms, ...addWritings],
    });
    exitMode();
    clearSelection();
    refreshProcessedSources();
    scheduleBridgePatch();
    app?.setStatus?.(
        `${baseId} → ${addRooms.length} parça · ${baseId} kategori/başlığını korur` +
        (newIds.length ? ` · yeni birimler (etiketli): ${newIds.join(', ')} — Sheets satırı ekleyin` : ''),
        'saved',
    );
    app?.onStorageChange?.();
}

function startAddLabel() {
    setMode('addLabel');
    app?.setStatus?.('Etiket eklemek için haritada bir noktaya tıklayın (Esc ile iptal)', 'dirty');
}

function startMoveLabel() {
    setMode('moveLabel');
    app?.setStatus?.('Yazı etiketlerini sürükleyerek taşıyın; bitirmek için "Yazı" / Esc', 'dirty');
}

async function handleAddLabelClick(e) {
    const raw = (window.prompt('Birim id\'si (örn. ID003):', '') || '').trim();
    if (!raw) { exitMode(); return; }
    const id = raw.replace(/\s+/g, '');
    // Match the SVG-converter's label shape: 3 door-pattern lines so the
    // runtime location binding (lines[0] → "ID003") resolves the store name.
    const lines = [`${id}_1_`, `${id}_2_`, `${id}_3_`];
    const feat = {
        type: 'Feature',
        properties: {
            id: `text-${Date.now()}`,
            layer: 'writing',
            text: lines.join('\n'),
            lines,
            font_size: 12,
            room_area: 0,
        },
        geometry: { type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] },
    };
    await mbState.addFeatures([feat]);
    exitMode();
    refreshProcessedSources();
    scheduleBridgePatch();
    app?.setStatus?.(`Etiket eklendi: ${id}`, 'saved');
    app?.onStorageChange?.();
}

/* ── modes ───────────────────────────────────────────────────────────── */
function setMode(m) {
    // Tear down the previous mode's transient UI before switching.
    if (mode === 'moveLabel' && m !== 'moveLabel') clearLabelMarkers();
    if (mode === 'reshape' && m !== 'reshape') { clearReshapeMarkers(); reshapeState = null; }

    mode = m;
    const map = getProcessedMap();
    if (map) map.getCanvas().style.cursor = m === 'select' ? '' : 'crosshair';
    document.getElementById('mbEditSplit')?.classList.toggle('is-active', m === 'split');
    document.getElementById('mbEditAddLabel')?.classList.toggle('is-active', m === 'addLabel');
    document.getElementById('mbEditMoveLabel')?.classList.toggle('is-active', m === 'moveLabel');
    document.getElementById('mbEditReshape')?.classList.toggle('is-active', m === 'reshape');
    const splLabel = document.getElementById('mbEditSplitLabel');
    if (splLabel) splLabel.textContent = m === 'split' ? 'Bitir' : 'Parçala';
    const rsLabel = document.getElementById('mbEditReshapeLabel');
    if (rsLabel) rsLabel.textContent = m === 'reshape' ? 'Bitir' : 'Şekil';

    if (m === 'moveLabel') { clearHandles(); showLabelMarkers(); }
    else if (m === 'select' && primaryId) positionHandles();
    else clearHandles();
}

function exitMode() {
    const map = getProcessedMap();
    if (map) {
        map.doubleClickZoom?.enable?.();
        if (map.__mbSplitDbl) { map.off('dblclick', map.__mbSplitDbl); map.__mbSplitDbl = null; }
    }
    clearSplitOverlay();
    setMode('select');
}

/* ── selection state ─────────────────────────────────────────────────── */
function recomputePrimary() {
    primaryId = selectedIds.size === 1 ? [...selectedIds][0] : null;
}

function afterSelectionChange() {
    drawSelection();
    if (mode === 'select' && primaryId) positionHandles();
    else clearHandles();
    updateSelectionUi();
}

function selectSingle(id) {
    selectedIds = new Set([String(id)]);
    recomputePrimary();
    afterSelectionChange();
}

function toggleSelection(id) {
    const key = String(id);
    if (selectedIds.has(key)) selectedIds.delete(key);
    else selectedIds.add(key);
    recomputePrimary();
    afterSelectionChange();
}

function clearSelection() {
    selectedIds = new Set();
    primaryId = null;
    afterSelectionChange();
    restoreCamera();
}

function updateSelectionUi() {
    const n = selectedIds.size;
    const $sel = document.getElementById('mbEditSel');
    if ($sel) $sel.textContent = n === 0 ? 'Bir birime tıklayın' : n === 1 ? `Seçili: ${primaryId}` : `${n} birim seçili`;
    const del = document.getElementById('mbEditDelete'); if (del) del.disabled = n === 0;
    const mrg = document.getElementById('mbEditMerge'); if (mrg) mrg.disabled = n < 2;
    const spl = document.getElementById('mbEditSplit'); if (spl) spl.disabled = n !== 1;
    const rsh = document.getElementById('mbEditReshape'); if (rsh) rsh.disabled = n !== 1;

    // Disable toggle: enabled when ≥1 unit selected. Label flips to "Etkinleştir"
    // when every selected unit is already disabled.
    const dis = document.getElementById('mbEditDisable');
    if (dis) {
        dis.disabled = n === 0;
        const rooms = [...selectedIds].map(findRoom).filter(Boolean);
        const allDisabled = rooms.length > 0 && rooms.every(r => isUnitDisabled(r.properties));
        dis.classList.toggle('is-active', allDisabled);
        const $lbl = document.getElementById('mbEditDisableLabel');
        if ($lbl) $lbl.textContent = allDisabled ? 'Etkinleştir' : 'Devre dışı';
    }
    updateMetric();
}

/* ── map click ───────────────────────────────────────────────────────── */
function onMapClick(e) {
    if (window.__mbModelPlacing) return;
    const map = getProcessedMap();
    if (!map) return;

    if (mode === 'addLabel') { handleAddLabelClick(e); return; }
    if (mode === 'split') { handleSplitClick(e); return; }
    // Label-drag and reshape modes own the map interactions themselves; a
    // stray click shouldn't change the unit selection underneath them.
    if (mode === 'moveLabel' || mode === 'reshape') return;

    const layers = ROOM_LAYERS.filter(l => map.getLayer(l));
    const feats = map.queryRenderedFeatures(e.point, { layers });
    // Pick the first real unit; skip the venue frame / walking corridors so
    // the big outline can't be selected.
    const hit = (feats || []).find(f => isUnitProps(f.properties));
    const id = hit?.properties?.id;
    if (!id) {
        if (!e.originalEvent?.shiftKey) clearSelection();
        return;
    }
    if (e.originalEvent?.shiftKey) toggleSelection(id);
    else selectSingle(id);
}

/* ── toolbar ─────────────────────────────────────────────────────────── */
function showToolbar() {
    const $tb = document.getElementById('mbEditToolbar');
    if ($tb) $tb.hidden = !mbState.geojson;
}

function wireToolbar() {
    document.getElementById('mbEditDisable')?.addEventListener('click', () => toggleDisableSelected());
    document.getElementById('mbEditDelete')?.addEventListener('click', () => deleteSelected());
    document.getElementById('mbEditMerge')?.addEventListener('click', () => mergeSelected());
    document.getElementById('mbEditSplit')?.addEventListener('click', () => {
        if (mode === 'split') finishSplit(); else startSplit();
    });
    document.getElementById('mbEditAddLabel')?.addEventListener('click', () => {
        if (mode === 'addLabel') exitMode(); else startAddLabel();
    });
    document.getElementById('mbEditMoveLabel')?.addEventListener('click', () => {
        if (mode === 'moveLabel') exitMode(); else startMoveLabel();
    });
    document.getElementById('mbEditReshape')?.addEventListener('click', () => {
        if (mode === 'reshape') finishReshapeMode(); else startReshapeMode();
    });
}

/* ── init ────────────────────────────────────────────────────────────── */
export function initGeometryEdit(host) {
    app = host;

    wireToolbar();

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && mode === 'split') {
            e.preventDefault();
            finishSplit();
            return;
        }
        if (e.key !== 'Escape') return;
        if (mode !== 'select') { exitMode(); app?.setStatus?.('İptal edildi', 'saved'); }
        else if (selectedIds.size) clearSelection();
    });

    const attachClick = (map) => {
        if (!map || map.__mbEditWired) return;
        map.__mbEditWired = true;
        // MapLibre's box-zoom hijacks shift+click and swallows the `click`
        // event, breaking shift-click multi-select. Disable it on the editor map.
        try { map.boxZoom?.disable?.(); } catch (_) {}
        map.on('click', onMapClick);
    };

    mbState.on('processed-map-ready', (map) => { attachClick(map); showToolbar(); });
    mbState.on('processed-map-rendered', (map) => { attachClick(map); showToolbar(); drawSelection(); });
    mbState.on('geojson-changed', () => { showToolbar(); });
    mbState.on('hydrate', () => { showToolbar(); });
    mbState.on('active-floor-changed', () => { exitMode(); clearSelection(); showToolbar(); });
    mbState.on('geometry-edited', () => { drawSelection(); if (mode === 'select' && primaryId) positionHandles(); });
}
