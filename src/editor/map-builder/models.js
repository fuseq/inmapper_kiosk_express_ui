/**
 * 3D model placement on the processed map.
 *
 * Workflow:
 *   1. The library lists available GLB models (from config.features.
 *      models3d.models + any URLs the user adds).
 *   2. Pick a model → "Yerleştir" → click the processed map to drop it at
 *      that lng/lat (a draggable marker lets the user reposition it).
 *   3. Per-placement controls tweak scale / rotation / altitude.
 *
 * Placements are stored per-floor in IndexedDB (mbState.modelPlacements),
 * merged across floors into config.features.models3d.models (so they
 * survive preview reloads + ship in the export), and pushed live into the
 * preview iframe via the bridge (no reload needed).
 *
 * The processed map also renders the active floor's models in 3D via the
 * same combined Three.js layer used at runtime, so the user sees exactly
 * what the kiosk will show while they position things.
 */

import { mbState } from './state.js';
import { getProcessedMap } from './process.js';

const DEFAULT_ROTATION = [Math.PI / 2, 0, 0];
const LAYER_ID = '3d-models-combined';

let app = null;
let library = [];             // [{ id, url, name }]
let placingUrl = null;        // url currently armed for click-to-place
let markers = new Map();      // placementId -> maplibregl.Marker (move handle)
let three = null;             // { THREE, GLTFLoader, createCombinedModelLayer }
let processedLayer = null;    // live custom-layer impl on the processed map
let layerRebuildTimer = null;
let liveBridgeTimer = null;

/* Selection + on-map transform handles (mirror geometry-edit UX). */
let selectedId = null;
let scaleHandle = null;
let rotateHandle = null;
let handleDrag = null;

/* ── helpers ─────────────────────────────────────────────────────────── */

function turf() { return window.turf; }

function uid() { return 'm_' + Math.random().toString(36).slice(2, 9); }

function baseName(url) {
    try { return decodeURIComponent(url.split('/').pop().replace(/\.glb$/i, '')); }
    catch { return url; }
}

function toRuntimeModel(p) {
    return {
        id: p.id,
        url: p.url,
        origin: p.origin,
        altitude: p.altitude || 0,
        rotation: p.rotation || DEFAULT_ROTATION,
        heading: p.heading || 0,
        scale: p.scale || 1,
        floor: p.floor ?? null,
    };
}

/* Active-floor placements carry no `floor` field (they live under one floor
 * record); tag them with the active floor key so per-floor runtime filtering
 * works in the live preview / processed map too. */
function activeModelsRuntime() {
    const fk = mbState.activeFloorKey;
    return mbState.getActiveModelPlacements().map(p => toRuntimeModel({ ...p, floor: p.floor ?? fk }));
}

/* Small glyphs placed inside the transform handles so it's obvious which
 * one moves / scales / rotates. */
const HANDLE_ICON = {
    move: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>',
    scale: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
};

function seedLibrary() {
    const cfg = app?.getConfig?.();
    const models = cfg?.features?.models3d?.models || [];
    const seen = new Set();
    library = [];
    for (const m of models) {
        if (!m.url || seen.has(m.url)) continue;
        seen.add(m.url);
        library.push({ id: m.id || uid(), url: m.url, name: baseName(m.url) });
    }
    // Always offer the two bundled sample assets.
    for (const url of ['assets/models/Town Hall.glb', 'assets/models/Football Stadium.glb']) {
        if (!seen.has(url)) { seen.add(url); library.push({ id: uid(), url, name: baseName(url) }); }
    }
}

/* ── output sync (config override + live bridge) ─────────────────────── */

function syncOut() {
    const merged = mbState.buildMergedModelPlacements().map(toRuntimeModel);
    try { app?.setOverride?.('features.models3d.models', merged); } catch (e) { console.warn('[models] setOverride failed', e); }
    try { app?.bridge?.setModels?.(merged); } catch (e) { console.warn('[models] bridge setModels failed', e); }
    app?.onStorageChange?.();
}

async function persistAndSync(list) {
    await mbState.setActiveModelPlacements(list);
    syncOut();
    rebuildProcessedLayer();
    renderPlacedList();
    renderMarkers();
    refreshSelectionHandles();
}

/* ── library UI ──────────────────────────────────────────────────────── */

function renderLibrary() {
    const $lib = document.getElementById('mbModelLibrary');
    if (!$lib) return;
    $lib.innerHTML = library.map(m => `
        <button type="button" class="ed-mb-model-chip${placingUrl === m.url ? ' is-arming' : ''}" data-url="${m.url}" title="${m.url}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            <span>${m.name}</span>
        </button>`).join('');
    $lib.querySelectorAll('.ed-mb-model-chip').forEach(btn => {
        btn.addEventListener('click', () => armPlacement(btn.dataset.url));
    });
}

function armPlacement(url) {
    placingUrl = (placingUrl === url) ? null : url;
    // Flag read by geometry-edit so unit-selection clicks don't fire while
    // the user is dropping a 3D model.
    window.__mbModelPlacing = !!placingUrl;
    const $hint = document.getElementById('mbModelHint');
    if ($hint) $hint.hidden = !placingUrl;
    const map = getProcessedMap();
    if (map) map.getCanvas().style.cursor = placingUrl ? 'copy' : '';
    renderLibrary();
}

/* ── placed list UI ──────────────────────────────────────────────────── */

function renderPlacedList() {
    const $list = document.getElementById('mbModelPlacedList');
    if (!$list) return;
    const placements = mbState.getActiveModelPlacements();
    if (!placements.length) {
        $list.innerHTML = '<div class="ed-mb-models-empty">Bu katta yerleştirilmiş model yok.</div>';
        return;
    }
    $list.innerHTML = placements.map(p => {
        const headingDeg = Math.round((p.heading || 0) * 180 / Math.PI);
        return `
        <div class="ed-mb-model-card${p.id === selectedId ? ' is-selected' : ''}" data-id="${p.id}">
          <div class="ed-mb-model-card-head">
            <span class="ed-mb-model-card-name" data-select="${p.id}">${p.name || baseName(p.url)}</span>
            <button type="button" class="ed-mb-model-del" data-del="${p.id}" title="Sil">✕</button>
          </div>
          <div class="ed-mb-model-card-grid">
            <label>Ölçek<input type="number" step="0.01" min="0.001" data-field="scale" value="${p.scale ?? 1}"></label>
            <label>Yükseklik (m)<input type="number" step="0.5" data-field="altitude" value="${p.altitude ?? 0}"></label>
            <label>Yön (°)<input type="number" step="5" data-field="heading" value="${headingDeg}"></label>
          </div>
        </div>`;
    }).join('');

    $list.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', () => deletePlacement(btn.dataset.del));
    });
    $list.querySelectorAll('[data-select]').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.dataset.select;
            selectPlacement(id);
            const p = findPlacement(id);
            const map = getProcessedMap();
            if (p && map) map.flyTo({ center: p.origin, duration: 400 });
        });
    });
    $list.querySelectorAll('.ed-mb-model-card input').forEach(inp => {
        inp.addEventListener('change', () => {
            const id = inp.closest('.ed-mb-model-card').dataset.id;
            updatePlacementField(id, inp.dataset.field, parseFloat(inp.value));
        });
    });
}

function updatePlacementField(id, field, value) {
    if (!Number.isFinite(value)) return;
    const list = mbState.getActiveModelPlacements().map(p => {
        if (p.id !== id) return p;
        const next = { ...p };
        if (field === 'scale') next.scale = Math.max(0.001, value);
        else if (field === 'altitude') next.altitude = value;
        else if (field === 'heading') next.heading = value * Math.PI / 180;
        return next;
    });
    persistAndSync(list);
}

function deletePlacement(id) {
    const list = mbState.getActiveModelPlacements().filter(p => p.id !== id);
    persistAndSync(list);
}

/* ── click-to-place ──────────────────────────────────────────────────── */

function onMapClick(e) {
    if (placingUrl) {
        const lngLat = [e.lngLat.lng, e.lngLat.lat];
        const url = placingUrl;
        const placement = {
            id: uid(),
            url,
            name: baseName(url),
            origin: lngLat,
            altitude: 0,
            scale: 1,
            heading: 0,
            rotation: [...DEFAULT_ROTATION],
        };
        const list = [...mbState.getActiveModelPlacements(), placement];
        armPlacement(null);
        selectedId = placement.id;
        persistAndSync(list);
        app?.setStatus?.(`Model yerleştirildi: ${placement.name}`, 'saved');
        return;
    }
    // Clicking empty map (not on a marker) clears the selection.
    selectPlacement(null);
}

/* ── selection ───────────────────────────────────────────────────────── */

function findPlacement(id) {
    return mbState.getActiveModelPlacements().find(p => p.id === id) || null;
}

function selectPlacement(id) {
    selectedId = id;
    renderPlacedList();
    renderMarkers();
    refreshSelectionHandles();
}

/* ── draggable position markers (Move) ───────────────────────────────── */

function clearMarkers() {
    for (const m of markers.values()) { try { m.remove(); } catch {} }
    markers.clear();
}

function renderMarkers() {
    const map = getProcessedMap();
    if (!map || !window.maplibregl) return;
    clearMarkers();
    const Marker = window.maplibregl.Marker;
    for (const p of mbState.getActiveModelPlacements()) {
        const el = document.createElement('div');
        el.className = 'ed-mb-edit-handle ed-mb-edit-handle-move ed-mb-model-move'
            + (p.id === selectedId ? ' is-selected' : '');
        el.innerHTML = HANDLE_ICON.move;
        el.title = `Taşı — ${p.name || baseName(p.url)}`;
        el.addEventListener('click', (ev) => { ev.stopPropagation(); selectPlacement(p.id); });
        const marker = new Marker({ element: el, draggable: true }).setLngLat(p.origin).addTo(map);
        marker.on('dragstart', () => { selectedId = p.id; });
        marker.on('drag', () => {
            // Live-follow: update origin in place so the 3D model + handles
            // track the marker while dragging.
            const ll = marker.getLngLat();
            const pl = findPlacement(p.id);
            if (pl) { pl.origin = [ll.lng, ll.lat]; repositionSelectionHandles(); scheduleLiveRebuild(); }
        });
        marker.on('dragend', () => {
            const ll = marker.getLngLat();
            const list = mbState.getActiveModelPlacements().map(x =>
                x.id === p.id ? { ...x, origin: [ll.lng, ll.lat] } : x);
            persistAndSync(list);
        });
        markers.set(p.id, marker);
    }
}

/* ── on-map Scale / Rotate handles ───────────────────────────────────── */

function clearSelectionHandles() {
    if (scaleHandle)  { try { scaleHandle.remove(); }  catch {} scaleHandle = null; }
    if (rotateHandle) { try { rotateHandle.remove(); } catch {} rotateHandle = null; }
}

/** Offset (in km) at which the scale/rotate handles sit from the model
 *  origin — grows with the model's scale so handles track its footprint. */
function handleOffsetKm(p) {
    return Math.max(6, 14 * (p.scale || 1)) / 1000;
}

function handlePositions(p) {
    const t = turf();
    const km = handleOffsetKm(p);
    const headingDeg = (p.heading || 0) * 180 / Math.PI;
    // Scale handle to the east; rotate handle along the current heading.
    const scalePos  = t.destination(p.origin, km, 90).geometry.coordinates;
    const rotatePos = t.destination(p.origin, km, headingDeg).geometry.coordinates;
    return { scale: scalePos, rotate: rotatePos };
}

/** Move existing handle markers to track the current origin/scale/rotation
 *  without recreating them (used during live move-drag). */
function repositionSelectionHandles() {
    const p = selectedId ? findPlacement(selectedId) : null;
    if (!p || !turf() || (!scaleHandle && !rotateHandle)) return;
    const pos = handlePositions(p);
    if (scaleHandle)  scaleHandle.setLngLat(pos.scale);
    if (rotateHandle) rotateHandle.setLngLat(pos.rotate);
}

function refreshSelectionHandles() {
    clearSelectionHandles();
    const map = getProcessedMap();
    const p = selectedId ? findPlacement(selectedId) : null;
    if (!map || !p || !window.maplibregl || !turf()) return;
    const Marker = window.maplibregl.Marker;
    const pos = handlePositions(p);

    const sEl = document.createElement('div');
    sEl.className = 'ed-mb-edit-handle ed-mb-edit-handle-scale';
    sEl.title = 'Boyutlandır';
    sEl.innerHTML = HANDLE_ICON.scale;
    scaleHandle = new Marker({ element: sEl, draggable: true }).setLngLat(pos.scale).addTo(map);
    wireScale(scaleHandle);

    const rEl = document.createElement('div');
    rEl.className = 'ed-mb-edit-handle ed-mb-edit-handle-rotate';
    rEl.title = 'Döndür';
    rEl.innerHTML = HANDLE_ICON.rotate;
    rotateHandle = new Marker({ element: rEl, draggable: true }).setLngLat(pos.rotate).addTo(map);
    wireRotate(rotateHandle);
}

function wireScale(marker) {
    marker.on('dragstart', () => {
        const p = findPlacement(selectedId);
        if (!p) return;
        handleDrag = {
            kind: 'scale',
            startScale: p.scale || 1,
            startDist: turf().distance(p.origin, marker.getLngLat().toArray()) || 1e-9,
        };
    });
    marker.on('drag', () => applyHandleDrag(marker.getLngLat().toArray()));
    marker.on('dragend', () => { commitHandle(); });
}

function wireRotate(marker) {
    marker.on('dragstart', () => {
        const p = findPlacement(selectedId);
        if (!p) return;
        handleDrag = {
            kind: 'rotate',
            startHeading: p.heading || 0,
            startBearing: turf().bearing(p.origin, marker.getLngLat().toArray()),
        };
    });
    marker.on('drag', () => applyHandleDrag(marker.getLngLat().toArray()));
    marker.on('dragend', () => { commitHandle(); });
}

function applyHandleDrag(current) {
    const p = findPlacement(selectedId);
    if (!p || !handleDrag) return;
    const t = turf();
    if (handleDrag.kind === 'scale') {
        const d1 = t.distance(p.origin, current);
        const factor = Math.max(0.05, d1 / handleDrag.startDist);
        p.scale = Math.max(0.001, handleDrag.startScale * factor);
    } else if (handleDrag.kind === 'rotate') {
        const b1 = t.bearing(p.origin, current);
        const deltaDeg = b1 - handleDrag.startBearing;
        // Heading = yaw about the vertical axis (model stays grounded).
        p.heading = handleDrag.startHeading + deltaDeg * Math.PI / 180;
    }
    scheduleLiveRebuild();
}

async function commitHandle() {
    handleDrag = null;
    const list = mbState.getActiveModelPlacements();
    await persistAndSync(list);
}

/* ── live 3D layer on the processed map ──────────────────────────────── */

async function ensureThree() {
    if (three) return three;
    try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
        const { createCombinedModelLayer } = await import('../../features/models-3d/model-loader.js');
        three = { THREE, GLTFLoader, DRACOLoader, createCombinedModelLayer };
    } catch (e) {
        console.warn('[models] three.js unavailable in editor — skipping 3D preview', e);
        three = null;
    }
    return three;
}

/** Live feedback while dragging: update the existing layer's model
 *  transforms in place (no GLB reload → smooth) and, debounced, push the
 *  in-flight transforms to the preview iframe. Falls back to a full
 *  rebuild only when the layer can't be updated in place yet. */
function scheduleLiveRebuild() {
    const models = activeModelsRuntime();
    if (processedLayer?.updateModelTransforms) {
        processedLayer.updateModelTransforms(models);
    } else {
        rebuildProcessedLayer();
    }
    clearTimeout(liveBridgeTimer);
    liveBridgeTimer = setTimeout(() => {
        try { app?.bridge?.setModels?.(models); }
        catch (e) { console.warn('[models] live bridge push failed', e); }
    }, 100);
}

function rebuildProcessedLayer() {
    clearTimeout(layerRebuildTimer);
    layerRebuildTimer = setTimeout(async () => {
        const map = getProcessedMap();
        if (!map) return;
        const t = await ensureThree();
        if (!t) return;
        try {
            if (map.getLayer(LAYER_ID)) { map.removeLayer(LAYER_ID); processedLayer = null; }
            const models = activeModelsRuntime();
            if (!models.length) return;
            const layer = t.createCombinedModelLayer(t.THREE, t.GLTFLoader, models, t.DRACOLoader);
            map.addLayer(layer);
            processedLayer = layer;
        } catch (e) { console.warn('[models] rebuild processed layer failed', e); }
    }, 150);
}

/* ── visibility ──────────────────────────────────────────────────────── */

function showSection() {
    const $section = document.getElementById('mbSection-models');
    if ($section) $section.hidden = !mbState.geojson;
}

/* ── init ────────────────────────────────────────────────────────────── */

export async function initModels(host) {
    app = host;
    seedLibrary();
    renderLibrary();

    const $add = document.getElementById('mbModelUrlAdd');
    const $url = document.getElementById('mbModelUrlInput');
    const addFromInput = () => {
        const url = ($url.value || '').trim();
        if (!url) return;
        if (!library.some(m => m.url === url)) {
            library.push({ id: uid(), url, name: baseName(url) });
            renderLibrary();
        }
        $url.value = '';
        armPlacement(url);
    };
    $add?.addEventListener('click', addFromInput);
    $url?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addFromInput(); }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (placingUrl) armPlacement(null);
        else if (selectedId) selectPlacement(null);
    });

    const onMap = (map) => {
        if (!map || map.__mbModelsWired) return;
        map.__mbModelsWired = true;
        map.on('click', onMapClick);
    };

    mbState.on('processed-map-ready', (map) => {
        onMap(map);
        showSection();
        renderMarkers();
        rebuildProcessedLayer();
    });
    mbState.on('processed-map-rendered', (map) => {
        onMap(map);
        showSection();
        renderMarkers();
        rebuildProcessedLayer();
    });
    mbState.on('hydrate', () => { seedLibrary(); renderLibrary(); renderPlacedList(); showSection(); });
    mbState.on('active-floor-changed', () => {
        selectedId = null;
        clearSelectionHandles();
        renderPlacedList();
        renderMarkers();
        rebuildProcessedLayer();
        showSection();
    });

    renderPlacedList();
    showSection();
}
