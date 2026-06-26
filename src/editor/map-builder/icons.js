/**
 * POI icons pane: built-in palette + custom icon upload + click-to-place.
 *
 * Storage:
 *   - Custom icon Blobs   → IndexedDB `icons` store (storage.addIcon)
 *   - Placed POIs (svg-pixel + type) → IndexedDB kv:placedIcons
 *
 * Why SVG-pixel coords?
 *   The processed map is laid out via the current alignment params
 *   (centerLat/Lng/scale/rotation). If we stored icons as raw lng/lat,
 *   they'd drift away from the rooms whenever the user re-aligns. By
 *   storing each icon's SVG pixel position we can re-project to lng/lat
 *   on every render, so icons follow rooms through any future alignment.
 *   Records still keep `lng/lat` for legacy/migration compatibility.
 */

import { mbState } from './state.js';
import { storage } from '../storage.js';
import { getProcessedMap } from './process.js';
import { GeoTransform } from '../svg/svg-converter.js';

const BUILTIN_POIS = [
    { id: 'restaurant', name: 'Restoran', color: '#ef4444', symbol: 'R' },
    { id: 'cafe',       name: 'Kafe',     color: '#a16207', symbol: 'C' },
    { id: 'wc',         name: 'WC',       color: '#0ea5e9', symbol: 'W' },
    { id: 'info',       name: 'Bilgi',    color: '#6366f1', symbol: 'i' },
    { id: 'atm',        name: 'ATM',      color: '#16a34a', symbol: '$' },
    { id: 'parking',    name: 'Otopark',  color: '#1f2937', symbol: 'P' },
    { id: 'elevator',   name: 'Asansör',  color: '#64748b', symbol: '↕' },
    { id: 'exit',       name: 'Çıkış',    color: '#16a34a', symbol: '→' },
];

const allPois = [...BUILTIN_POIS];   // augmented with customs at runtime
let activePoi = null;

export async function initIcons(app) {
    const $section  = document.getElementById('mbSection-icons');
    const $palette  = document.getElementById('mbIconPalette');
    const $hint     = document.getElementById('mbIconHint');
    const $list     = document.getElementById('mbPlacedList');
    const $custom   = document.getElementById('mbCustomIconInput');

    // Load existing custom icons from IndexedDB → augment palette + register imgs
    const customs = await storage.getIcons();
    for (const rec of customs) {
        const url = URL.createObjectURL(rec.blob);
        allPois.push({
            id: rec.id, name: rec.name || rec.id,
            color: '#6b7280', symbol: '★',
            dataUrl: url, custom: true,
        });
    }

    function render() {
        $palette.innerHTML = '';
        for (const poi of allPois) {
            const div = document.createElement('button');
            div.type = 'button';
            div.className = 'ed-mb-icon-pick' + (poi.id === activePoi ? ' is-active' : '');
            div.dataset.poiId = poi.id;
            const inner = poi.dataUrl
                ? `<span class="ed-mb-ic-circle" style="background:transparent"><img src="${poi.dataUrl}" alt=""></span>`
                : `<span class="ed-mb-ic-circle" style="background:${poi.color}">${escapeHtml(poi.symbol)}</span>`;
            div.innerHTML = inner + `<span class="ed-mb-ic-name">${escapeHtml(poi.name)}</span>`;
            div.addEventListener('click', () => toggleActive(poi.id));
            $palette.appendChild(div);
        }
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'ed-mb-icon-pick is-add';
        add.innerHTML = `<span class="ed-mb-ic-circle">+</span><span class="ed-mb-ic-name">Özel</span>`;
        add.addEventListener('click', () => $custom.click());
        $palette.appendChild(add);
    }

    function renderPlacedList() {
        $list.innerHTML = '';
        if (!mbState.placedIcons.length) {
            $list.innerHTML = `<div class="ed-mb-empty-mini">Henüz POI yok</div>`;
            return;
        }
        for (const it of mbState.placedIcons) {
            const poi = allPois.find(p => p.id === it.type);
            const row = document.createElement('div');
            row.className = 'ed-mb-placed-item';
            const visual = poi?.dataUrl
                ? `<img src="${poi.dataUrl}" alt="">`
                : `<span style="background:${poi?.color || '#6b7280'};color:#fff">${escapeHtml(poi?.symbol || '·')}</span>`;
            row.innerHTML = `
              <span class="ed-mb-pi-circle">${visual}</span>
              <span class="ed-mb-pi-name">${escapeHtml(poi?.name || it.type)}</span>
              <button type="button" class="ed-mb-pi-del" title="Sil">×</button>
            `;
            row.querySelector('.ed-mb-pi-del').addEventListener('click', async () => {
                mbState.placedIcons = mbState.placedIcons.filter(p => p.id !== it.id);
                await storage.setPlacedIcons(mbState.placedIcons);
                renderPlacedList();
                refreshLayer();
                schedulePreviewReload();
            });
            $list.appendChild(row);
        }
    }

    function toggleActive(id) {
        if (activePoi === id) {
            activePoi = null;
            $hint.hidden = true;
            setMapCursor('');
        } else {
            activePoi = id;
            $hint.hidden = false;
            setMapCursor('crosshair');
        }
        $palette.querySelectorAll('.ed-mb-icon-pick').forEach(b =>
            b.classList.toggle('is-active', b.dataset.poiId === activePoi));
    }

    function setMapCursor(c) {
        const map = getProcessedMap();
        if (map) map.getCanvas().style.cursor = c;
    }

    function ensureMapClickHandler() {
        const map = getProcessedMap();
        if (!map || map.__mbIconsClickAttached) return;
        map.__mbIconsClickAttached = true;
        map.on('click', async (e) => {
            if (!activePoi) return;
            const id = 'poi_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const transform = currentTransform();
            const svgXY = transform
                ? transform.toSvg(e.lngLat.lng, e.lngLat.lat)
                : null;
            mbState.placedIcons.push({
                id, type: activePoi,
                svgX: svgXY?.[0] ?? null,
                svgY: svgXY?.[1] ?? null,
                lng: e.lngLat.lng, lat: e.lngLat.lat,
            });
            await storage.setPlacedIcons(mbState.placedIcons);
            renderPlacedList();
            refreshLayer();
            schedulePreviewReload();
        });
    }

    let previewReloadTimer = null;
    function schedulePreviewReload() {
        if (previewReloadTimer) clearTimeout(previewReloadTimer);
        previewReloadTimer = setTimeout(() => {
            try { app?.reload?.(['features.map.placedIcons']); } catch {}
        }, 350);
    }

    /**
     * Build a GeoTransform from mbState (svgInfo + current alignment).
     * Returns null if we don't have enough info to project — callers must
     * gracefully fall back to stored lng/lat in that case.
     */
    function currentTransform() {
        let ce = mbState.contentExtent;
        if (!ce && mbState.svgInfo?.viewBox) {
            // Fallback: use the SVG viewBox if a legacy session never cached
            // a content extent. Round-trip won't be perfect but it's enough
            // to keep icons sticky for routine alignments.
            const vb = mbState.svgInfo.viewBox;
            ce = { originX: 0, originY: 0, width: vb.width, height: vb.height };
        }
        if (!ce) return null;
        return new GeoTransform(ce.width, ce.height, {
            centerLat: mbState.centerLat,
            centerLng: mbState.centerLng,
            scale: mbState.scale || 0.03,
            rotation: mbState.rotation || 0,
            originX: ce.originX, originY: ce.originY,
        });
    }

    /**
     * Resolve an icon record's lng/lat for rendering. Newer records carry
     * `svgX/svgY` and re-project every render (so they track the rooms
     * after Apply). Legacy records have only lng/lat — we migrate them on
     * first sight by computing svg-coords against the *current* transform,
     * pinning them to where they appear right now and letting future
     * alignments move them with the rooms.
     */
    function resolveCoords(icon, transform, mutated) {
        if (Number.isFinite(icon.svgX) && Number.isFinite(icon.svgY) && transform) {
            const [lng, lat] = transform.toLngLat(icon.svgX, icon.svgY);
            return [lng, lat];
        }
        if (transform && Number.isFinite(icon.lng) && Number.isFinite(icon.lat)) {
            const [sx, sy] = transform.toSvg(icon.lng, icon.lat);
            icon.svgX = sx;
            icon.svgY = sy;
            mutated.flag = true;
            return [icon.lng, icon.lat];
        }
        return [icon.lng, icon.lat];
    }

    async function refreshLayer() {
        const map = getProcessedMap();
        if (!map || !window.maplibregl) return;
        await Promise.all(allPois.map(loadPoiImage));
        const transform = currentTransform();
        const mutated = { flag: false };
        const features = mbState.placedIcons.map(p => {
            const [lng, lat] = resolveCoords(p, transform, mutated);
            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: { id: p.id, icon_type: p.type },
            };
        });
        if (mutated.flag) {
            // Persist auto-migrated svgX/svgY so the next render is a no-op.
            storage.setPlacedIcons(mbState.placedIcons).catch(() => {});
        }
        const data = { type: 'FeatureCollection', features };
        if (map.getSource('placed-icons')) {
            map.getSource('placed-icons').setData(data);
        } else {
            map.addSource('placed-icons', { type: 'geojson', data });
            map.addLayer({
                id: 'placed-icons-layer',
                type: 'symbol',
                source: 'placed-icons',
                layout: {
                    'icon-image': ['concat', 'poi-', ['get', 'icon_type']],
                    'icon-size': 0.75,
                    'icon-allow-overlap': true,
                    'icon-ignore-placement': true,
                    'icon-anchor': 'center',
                },
            });
        }
    }

    async function loadPoiImage(poi) {
        const map = getProcessedMap();
        if (!map) return;
        const imgId = 'poi-' + poi.id;
        if (map.hasImage(imgId)) return;
        const size = 40;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (poi.dataUrl) {
            await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => { ctx.drawImage(img, 0, 0, size, size); resolve(); };
                img.onerror = resolve;
                img.src = poi.dataUrl;
            });
        } else {
            ctx.beginPath();
            ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
            ctx.fillStyle = poi.color; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.round(size * 0.38)}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(poi.symbol, size/2, size/2);
        }
        const data = ctx.getImageData(0, 0, size, size);
        if (!map.hasImage(imgId)) map.addImage(imgId, { width: size, height: size, data: data.data });
    }

    $custom.addEventListener('change', async () => {
        const file = $custom.files?.[0];
        if (!file) return;
        $custom.value = '';
        const id = 'custom_' + Date.now();
        const name = file.name.replace(/\.[^.]+$/, '').slice(0, 12) || id;
        await storage.addIcon({ id, name, blob: file, mime: file.type, createdAt: Date.now() });
        const dataUrl = URL.createObjectURL(file);
        allPois.push({ id, name, color: '#6b7280', symbol: '★', dataUrl, custom: true });
        render();
        toggleActive(id);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && activePoi) toggleActive(activePoi);
    });

    function show() {
        $section.hidden = false;
        render();
        renderPlacedList();
        ensureMapClickHandler();
        refreshLayer();
    }
    function hide() { $section.hidden = true; }
    mbState.on('hydrate', () => { if (mbState.geojson) show(); });
    mbState.on('geojson-changed', show);
    mbState.on('active-floor-changed', () => {
        if (mbState.geojson) show();
        else hide();
    });
    mbState.on('processed-map-ready', () => { ensureMapClickHandler(); refreshLayer(); });
    // Re-paint placed icons after process.js rebuilds the map sources
    // (otherwise switching floors leaves the active floor's icons gone).
    mbState.on('processed-map-rendered', () => refreshLayer());
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
