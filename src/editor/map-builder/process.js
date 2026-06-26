/**
 * Process pane: convert SVG → GeoJSON, render the result on a 3D MapLibre map.
 *
 * Also owns the "Apply to preview iframe" button: it copies the generated
 * geojson into IndexedDB and queues an iframe reload.
 */

import { mbState, SUBLAYER_COLORS } from './state.js';
import { storage } from '../storage.js';
import { convertSvg, parseSvgInfo } from '../svg/svg-converter.js';
import { loadMapBuilderCdns } from './shell.js';
import { buildWallBand, carveDoorways, doorOpeningsByUnit, pathCrossOpeningsByUnit, openingsKey, insetFeature } from '../../features/map/wall-geometry.js';

let processedMap = null;
let processedMapReady = false;

/* Editor host (set by initProcess) — lets the module-level room renderer read
 * the live, override-merged config for the wall/solid render mode. */
let _host = null;

/* Set by initProcess() so other tab modules (e.g. upload.js auto-
 * processing a freshly-uploaded SVG) can drive the same conversion
 * pipeline without duplicating logic. */
let _processActiveFloorRef = null;
export function processActiveFloor(opts) {
    if (!_processActiveFloorRef) return Promise.resolve(null);
    return _processActiveFloorRef(opts);
}

export async function initProcess(app) {
    _host = app;
    const $process = document.getElementById('mbProcessBtn');
    const $cLat    = document.getElementById('mbCenterLat');
    const $cLng    = document.getElementById('mbCenterLng');
    const $scale   = document.getElementById('mbScale');
    const $rotate  = document.getElementById('mbRotation');
    const $emptyP  = document.getElementById('mbProcessedEmpty');
    const $mapHost = document.getElementById('mbProcessedMap');

    // Reflect persisted meta into form fields.
    function syncFormFromState() {
        $cLat.value   = mbState.centerLat;
        $cLng.value   = mbState.centerLng;
        $scale.value  = mbState.scale;
        $rotate.value = mbState.rotation;
    }

    [$cLat, $cLng, $scale, $rotate].forEach(el => {
        el.addEventListener('change', () => {
            mbState.centerLat = parseFloat($cLat.value) || 0;
            mbState.centerLng = parseFloat($cLng.value) || 0;
            mbState.scale     = parseFloat($scale.value) || 0.03;
            mbState.rotation  = parseFloat($rotate.value) || 0;
            mbState.persistMeta();
        });
    });

    /* True while alignment is still at the hard-coded sentinel defaults — i.e.
     * the user has never aligned this project. Picked so a deliberate manual
     * alignment (which would change at least one of these) is never clobbered. */
    function isSentinelAlignment() {
        return (parseFloat($scale.value) || 0.03) === 0.03
            && (parseFloat($cLat.value) || 0) === 0
            && (parseFloat($cLng.value) || 0) === 0
            && (parseFloat($rotate.value) || 0) === 0;
    }

    /* Auto-pick a human-scaled default m/px from the SVG size on first import. */
    function maybeAutoScale() {
        if (!mbState.svgText || !isSentinelAlignment()) return;
        try {
            const info = parseSvgInfo(mbState.svgText);
            const span = Math.max(info?.viewBox?.width || 0, info?.viewBox?.height || 0);
            if (span > 0) {
                const TARGET_SPAN_M = 120;
                const s = +(TARGET_SPAN_M / span).toFixed(4);
                if (s > 0 && Number.isFinite(s)) {
                    $scale.value = String(s);
                    mbState.scale = s;
                }
            }
        } catch (_) { /* keep the existing default scale */ }
    }

    /**
     * Convert the active floor's SVG with the current shared alignment
     * (centerLat/Lng/scale/rotation taken from the form fields), persist
     * the geojson, refresh the processed-map preview and emit
     * `geojson-changed`. Exported so that `upload.js` can auto-process
     * a freshly-uploaded SVG when the project is already aligned.
     */
    async function processActiveFloor({ silent = false, force = false } = {}) {
        if (!mbState.svgText) return null;

        /* GeoJSON is the source of truth once the user has moved/scaled/
         * rotated units on the map. Re-converting the SVG would discard
         * those edits, so:
         *   • silent (auto-process of a sibling floor) → skip entirely
         *   • explicit "SVG'yi İşle" → confirm before clobbering
         */
        if (mbState.isGeometryEdited() && !force) {
            if (silent) return null;
            const ok = window.confirm(
                'Bu katta haritada yapılmış birim düzenlemeleri (taşıma/ölçek/döndürme) var.\n\n' +
                "SVG'yi yeniden işlemek bu düzenlemelerin ÜZERİNE YAZACAK ve onları silecek.\n\n" +
                'Devam edilsin mi?');
            if (!ok) {
                app.setStatus('İşleme iptal edildi — mevcut düzenlemeler korundu', 'saved');
                return null;
            }
        }

        // First import has no real alignment yet (sentinel defaults). The
        // metric door/wall geometry needs a human-scaled map to behave, so
        // derive a sensible default scale (m per SVG px) from the SVG size —
        // aiming for a ~120 m venue — instead of the tiny 0.03 default that
        // makes units a couple of metres across and breaks the wall inset and
        // doorway carving until the user manually aligns.
        maybeAutoScale();

        $process.disabled = true;
        $process.innerHTML = '<span class="ed-mb-spinner"></span>İşleniyor…';
        try {
            const result = convertSvg(mbState.svgText, {
                centerLat: parseFloat($cLat.value) || 0,
                centerLng: parseFloat($cLng.value) || 0,
                scale:     parseFloat($scale.value) || 0.03,
                rotation:  parseFloat($rotate.value) || 0,
            });
            mbState.geojson  = result.geojson;
            mbState.stats    = result.stats;
            mbState.centerLat = parseFloat($cLat.value) || 0;
            mbState.centerLng = parseFloat($cLng.value) || 0;
            mbState.scale     = parseFloat($scale.value) || 0.03;
            mbState.rotation  = parseFloat($rotate.value) || 0;
            mbState.contentExtent = result.contentExtent || null;
            // Fresh conversion from SVG → geometry edits no longer apply.
            mbState.geometryEdited = false;

            await storage.setGeojson(result.geojson);
            await mbState.persistMeta();
            await renderProcessedMap();

            mbState.emit('geojson-changed');
            // Push the freshly-processed geojson into the preview iframe
            // automatically. Used to require a separate "Önizleme
            // iframe'ine uygula" click; that's the one place where the
            // editor would silently drift from the preview, which was
            // confusing more than it was useful.
            try { app?.reload?.(['venue.geojsonPath']); } catch {}
            if (!silent) {
                app.setStatus(`İşlendi · ${result.geojson.features.length} feature · önizleme güncellendi`, 'saved');
            }
            app.onStorageChange?.();
            return result;
        } catch (e) {
            console.error(e);
            app.setStatus('Dönüştürme hatası: ' + e.message, 'dirty');
            return null;
        } finally {
            $process.disabled = false;
            $process.textContent = "SVG'yi İşle";
        }
    }

    $process.addEventListener('click', () => processActiveFloor());

    // Expose to other tab modules (upload.js) via a module-scoped hook.
    _processActiveFloorRef = processActiveFloor;

    syncFormFromState();
    mbState.on('hydrate', async () => {
        syncFormFromState();
        if (mbState.geojson) {
            await renderProcessedMap();
        }
    });

    // Re-render the processed map whenever the geojson changes via a path
    // other than the local "İşle" button — e.g. the align tab's "Apply &
    // Yeniden işle" updates mbState.geojson and emits this event. Without
    // this, room / path / door layers would keep stale coordinates while
    // the writing layer (kept in sync by labels.js) would jump to the new
    // ones, producing the visual offset reported by users.
    mbState.on('geojson-changed', () => {
        syncFormFromState();
        if (processedMap && mbState.geojson) {
            try {
                applyGeojsonToMap(processedMap, mbState.geojson);
                mbState.emit('processed-map-rendered', processedMap);
            } catch (e) { console.error('[process] re-render after change failed', e); }
        }
    });

    // Switching active floor: redraw the processed map (or show empty
    // placeholder) and reflect the new floor's center/scale/rotation in
    // the form fields.
    mbState.on('active-floor-changed', async () => {
        syncFormFromState();
        if (mbState.geojson) {
            await renderProcessedMap();
        } else {
            // No geojson on this floor yet → blank the map.
            if (processedMap) {
                ['rooms','paths','doors','portals','writing','rooms-flat'].forEach(srcId => {
                    const src = processedMap.getSource(srcId);
                    if (src) src.setData({ type: 'FeatureCollection', features: [] });
                });
            }
            $emptyP.hidden = false;
            $mapHost.hidden = true;
        }
    });

    // Toggling override on/off changes which slot the form is bound to;
    // re-sync so the inputs immediately reflect the right values.
    mbState.on('floor-alignment-changed', () => syncFormFromState());

    async function renderProcessedMap() {
        if (!mbState.geojson) return;
        try {
            await loadMapBuilderCdns();
            await ensureProcessedMap();
            applyGeojsonToMap(processedMap, mbState.geojson);
            $emptyP.hidden = true;
            $mapHost.hidden = false;
            // Notify dependent panes (labels, icons) so they can re-apply
            // their per-feature overrides on top of the freshly-rebuilt
            // sources. Without this, switching floors clobbers e.g.
            // user-set label sizes because applyGeojsonToMap reseeds the
            // `writing` source with raw `font_size` values.
            mbState.emit('processed-map-rendered', processedMap);
        } catch (e) {
            console.error('[process] map render failed', e);
            app.setStatus('Harita oluşturulamadı: ' + e.message, 'dirty');
        }
    }

    async function ensureProcessedMap() {
        if (processedMap) {
            // Make sure layout is correct after tab switches
            requestAnimationFrame(() => processedMap.resize());
            return;
        }
        $mapHost.hidden = false;
        $emptyP.hidden = true;

        processedMap = new window.maplibregl.Map({
            container: $mapHost,
            style: {
                version: 8, sources: {},
                layers: [{ id: 'background', type: 'background',
                          paint: { 'background-color': '#f0f0f0' } }],
                light: { anchor: 'viewport', color: '#ffffff', intensity: 0.4,
                         position: [1.5, 180, 30] },
            },
            center: [mbState.centerLng, mbState.centerLat],
            zoom: 16, pitch: 60, bearing: -20, maxZoom: 24, antialias: true,
        });
        processedMap.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }));

        await new Promise(res => processedMap.once('load', res));
        processedMapReady = true;
        mbState.emit('processed-map-ready', processedMap);
    }
}

function applyGeojsonToMap(map, geojson) {
    if (!map) return;
    const layerNames = ['rooms', 'paths', 'doors', 'portals', 'writing'];
    const layerData = Object.fromEntries(layerNames.map(l => [l, {
        type: 'FeatureCollection',
        features: geojson.features.filter(f => f.properties.layer === l),
    }]));

    for (const l of layerNames) {
        const src = map.getSource(l);
        if (src) src.setData(layerData[l]);
        else map.addSource(l, { type: 'geojson', data: layerData[l] });
    }

    applyRoomLayers(map, layerData.rooms.features, layerData.doors?.features || [], layerData.paths?.features || []);
    if (!map.getLayer('rooms-outline')) {
        map.addLayer({
            id: 'rooms-outline', type: 'line', source: 'rooms',
            paint: { 'line-color': '#888', 'line-width': 1 },
        });
    }
    const textSizeExpr = buildTextSizeExpr((mbState.scale || 0.03) / 0.03);
    if (!map.getLayer('writing-md')) {
        map.addLayer({
            id: 'writing-md', type: 'symbol', source: 'writing',
            layout: {
                'text-field': ['get', 'text'],
                'text-anchor': 'center',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
                'text-rotation-alignment': 'viewport',
                'text-pitch-alignment': 'viewport',
                'text-size': textSizeExpr,
            },
            paint: { 'text-color': '#000', 'text-halo-color': '#fff', 'text-halo-width': 1 },
        });
    } else {
        map.setLayoutProperty('writing-md', 'text-size', textSizeExpr);
    }

    // Fit to the active floor only — neighbouring floors are no longer
    // shown here (they live in the Hizala tab as alignment guides).
    const bounds = new window.maplibregl.LngLatBounds();
    let extended = false;
    const visit = (g) => {
        if (!g) return;
        if (g.type === 'Point') { bounds.extend(g.coordinates); extended = true; }
        else if (g.type === 'LineString') { g.coordinates.forEach(c => bounds.extend(c)); extended = true; }
        else if (g.type === 'Polygon') { g.coordinates[0].forEach(c => bounds.extend(c)); extended = true; }
        else if (g.type === 'MultiPolygon') {
            g.coordinates.forEach(poly => poly[0]?.forEach(c => bounds.extend(c)));
            extended = true;
        }
    };
    geojson.features.forEach(f => visit(f.geometry));
    if (extended) map.fitBounds(bounds, { padding: 40, pitch: 60, bearing: -20, animate: false });
}

/**
 * Build a FeatureCollection of room polygons from every floor *other*
 * than the active one. Used by the Hizala tab as a static alignment
 * guide so the user can drag the active floor's overlay relative to
 * the floors that are already in place.
 */
export function buildOtherFloorsRooms() {
    const activeKey = mbState.activeFloorKey;
    const out = [];
    for (const f of mbState.listFloors()) {
        if (f.key === activeKey) continue;
        if (!f.geojson?.features) continue;
        for (const feat of f.geojson.features) {
            if (feat.properties?.layer !== 'rooms') continue;
            const t = feat.geometry?.type;
            if (t !== 'Polygon' && t !== 'MultiPolygon') continue;
            out.push({ ...feat, properties: { ...feat.properties, floor: f.key } });
        }
    }
    return { type: 'FeatureCollection', features: out };
}

/**
 * Text-size expression for the writing layer.
 *
 * Two factors compose into the final pixel size:
 *   - per-feature `font_size` (px) — typed into labels.js (default 12).
 *     Treated as a raw pixel target divided by the M-tier reference (12).
 *   - geo `scaleFactor` — softened with sqrt() so the labels stay legible
 *     at large map scales (e.g. real-building scale=0.3 → 10× ref) without
 *     ballooning. Linear scaling overshoots dramatically at zoom 20–22;
 *     the square-root keeps growth tame while still correlating with how
 *     much real-world area the SVG covers.
 */
function buildTextSizeExpr(rawScaleFactor = 1) {
    const scaleFactor = Math.sqrt(Math.max(0.01, rawScaleFactor));
    const sizeRatio = ['*', scaleFactor,
        ['/', ['coalesce', ['to-number', ['get', 'font_size']], 12], 12]];
    return ['interpolate', ['exponential', 2], ['zoom'],
        14, ['*', 0.5, sizeRatio],
        16, ['*', 1.4, sizeRatio],
        18, ['*', 3.5, sizeRatio],
        20, ['*', 6,   sizeRatio],
        22, ['*', 9,   sizeRatio]];
}

function getMapCfg() {
    return _host?.getConfig?.()?.features?.map || {};
}

/* Derive the flat-fill + extruded room sources for the processed map, honouring
 * the (global) wall/solid render mode — mirrors the runtime renderer so the
 * editor preview is WYSIWYG while placing 3D models inside units. */
function buildEditorRoomSources(roomsFeatures, mapCfg, doorFeatures = [], pathFeatures = []) {
    const globalMode = mapCfg.roomRenderMode || 'solid';
    const bySub = mapCfg.renderModeBySublayer || {};
    const effMode = (f) => bySub[f.properties.sublayer] || globalMode;
    const isFlatBase = f => ['walking', 'building'].includes(f.properties.sublayer);
    const flatBase = roomsFeatures.filter(isFlatBase);
    const rooms = roomsFeatures.filter(f => !isFlatBase(f));

    const wallRooms  = rooms.filter(f => effMode(f) === 'walls');
    const solidRooms = rooms.filter(f => effMode(f) !== 'walls');

    const flat = [...flatBase];
    const extruded = [];

    if (wallRooms.length) {
        const t = mapCfg.wallThickness ?? 0.6;
        const wallGap = mapCfg.wallGap ?? 0;
        const gapsOn = mapCfg.doorGaps !== false;
        const gapWidth = mapCfg.doorGapWidth ?? 1.2;
        const doorGapMode = mapCfg.doorGapMode || 'doors';
        const openings = !gapsOn ? null
            : (doorGapMode === 'paths'
                ? pathCrossOpeningsByUnit(wallRooms, pathFeatures)
                : doorOpeningsByUnit(wallRooms, doorFeatures, pathFeatures));
        for (const f of wallRooms) {
            const fForWall = wallGap > 0 ? insetFeature(f, wallGap) : f;
            let band = buildWallBand(fForWall, t) || fForWall;
            const mids = openings ? openings.get(openingsKey(f)) : null;
            if (band && mids && mids.length) band = carveDoorways(band, mids, gapWidth, t);
            // Tag walls so a fixed wall colour hits bands only (solid groups
            // keep their category colour) — mirrors the runtime renderer.
            extruded.push({ ...band, properties: { ...(band.properties || {}), __wall: 1 } });
            flat.push({ ...f, properties: { ...f.properties, __unit: 1 } });
        }
    }
    for (const f of solidRooms) extruded.push(f);

    const color = (mapCfg.wallColorMode === 'fixed' && mapCfg.wallColor)
        ? ['case', ['==', ['get', '__wall'], 1], mapCfg.wallColor, buildColorExpr()]
        : buildColorExpr();

    return {
        flat: { type: 'FeatureCollection', features: flat },
        extruded: { type: 'FeatureCollection', features: extruded },
        extrColor: color,
    };
}

/* Build/refresh the rooms-flat (floors) + rooms-extruded (blocks/walls) sources
 * and their layers. Sources update via setData so mode/color changes are live
 * without tearing layers down (keeps heights.js' in-place height edits). */
function applyRoomLayers(map, roomsFeatures, doorFeatures = [], pathFeatures = []) {
    if (!map) return;
    const { flat, extruded, extrColor } = buildEditorRoomSources(roomsFeatures, getMapCfg(), doorFeatures, pathFeatures);

    if (map.getSource('rooms-flat')) map.getSource('rooms-flat').setData(flat);
    else map.addSource('rooms-flat', { type: 'geojson', data: flat });

    if (map.getSource('rooms-extruded')) map.getSource('rooms-extruded').setData(extruded);
    else map.addSource('rooms-extruded', { type: 'geojson', data: extruded });

    if (!map.getLayer('rooms-floor')) {
        map.addLayer({
            id: 'rooms-floor', type: 'fill', source: 'rooms-flat',
            paint: { 'fill-color': buildColorExpr(), 'fill-opacity': 0.9 },
        });
    }
    if (!map.getLayer('rooms-3d')) {
        map.addLayer({
            id: 'rooms-3d', type: 'fill-extrusion', source: 'rooms-extruded',
            paint: {
                'fill-extrusion-color': extrColor,
                'fill-extrusion-height': buildHeightExpr(),
                'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.88,
            },
        });
    } else {
        map.setPaintProperty('rooms-3d', 'fill-extrusion-color', extrColor);
    }
}

/* Live re-apply the room render mode (called by render-mode.js after a
 * wall/solid/color/thickness change). No camera refit — just source + paint. */
export function refreshProcessedRooms() {
    if (!processedMap || !mbState.geojson) return;
    const rooms = mbState.geojson.features.filter(f => f.properties.layer === 'rooms');
    const doors = mbState.geojson.features.filter(f => f.properties.layer === 'doors');
    const paths = mbState.geojson.features.filter(f => f.properties.layer === 'paths');
    applyRoomLayers(processedMap, rooms, doors, paths);
}

export function buildColorExpr() {
    const expr = ['match', ['get', 'sublayer']];
    for (const [k, v] of Object.entries(SUBLAYER_COLORS)) expr.push(k, v);
    expr.push('#cccccc');
    return expr;
}

export function buildHeightExpr(heights, multiplier = 1) {
    const h = heights || mbState.heights;
    const expr = ['match', ['get', 'sublayer']];
    for (const [k, v] of Object.entries(h)) expr.push(k, v * multiplier);
    expr.push(4 * multiplier);
    return expr;
}

export function getProcessedMap() { return processedMap; }
export function processedMapIsReady() { return processedMapReady; }
