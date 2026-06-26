/**
 * Upload pane: drag-drop SVG, optional sample loader, info stats.
 */

import { mbState, DEFAULT_HEIGHTS } from './state.js';
import { storage } from '../storage.js';
import { parseSvgInfo } from '../svg/svg-converter.js';
import { processActiveFloor } from './process.js';

/* Seed `mbState.heights` (and storage) with any sublayer the freshly
 * loaded SVG uses but the active floor has never seen before. Without
 * this the runtime preview falls back to its built-in 5 m extrusion for
 * unknown keys (carpark, entrance, wc, …) until the user manually
 * opens the 3D-heights panel and tweaks every new slider. */
async function ensureHeightsForSublayers(info) {
    const subs = Object.keys(info?.sublayers || {}).map(s => s.toLowerCase());
    if (subs.length === 0) return;
    let changed = false;
    for (const sl of subs) {
        if (sl === 'walking' || sl === 'building') continue;
        if (mbState.heights[sl] == null) {
            mbState.heights[sl] = DEFAULT_HEIGHTS[sl] ?? 4;
            changed = true;
        }
    }
    if (changed && mbState.activeFloorKey) {
        await storage.setFloorHeights(mbState.activeFloorKey, mbState.heights);
    }
}

const SAMPLE_SVG_URL = 'assets/terminal.svg';

let panZoomInstance = null;

export async function initUpload(app) {
    const $area     = document.getElementById('mbUploadArea');
    const $input    = document.getElementById('mbUploadInput');
    const $name     = document.getElementById('mbUploadName');
    const $stats    = document.getElementById('mbStats');
    const $emptyOrig = document.getElementById('mbOriginalEmpty');
    const $preview  = document.getElementById('mbSvgPreview');
    const $sample   = document.getElementById('mbLoadSampleBtn');
    const $process  = document.getElementById('mbProcessBtn');

    $area.addEventListener('click', () => $input.click());
    $area.addEventListener('dragover', (e) => { e.preventDefault(); $area.classList.add('dragover'); });
    $area.addEventListener('dragleave', () => $area.classList.remove('dragover'));
    $area.addEventListener('drop', (e) => {
        e.preventDefault();
        $area.classList.remove('dragover');
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    });
    $input.addEventListener('change', () => {
        const file = $input.files?.[0];
        if (file) handleFile(file);
    });
    $sample.addEventListener('click', loadSample);

    async function handleFile(file) {
        if (!file.name.toLowerCase().endsWith('.svg')) {
            app.setStatus('Lütfen .svg dosyası seçin', 'dirty');
            return;
        }
        const text = await file.text();
        await ingest(text, file.name);
    }

    async function loadSample() {
        try {
            const r = await fetch(SAMPLE_SVG_URL);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const text = await r.text();
            await ingest(text, 'terminal.svg');
        } catch (e) {
            app.setStatus('Örnek harita yüklenemedi: ' + e.message, 'dirty');
        }
    }

    async function ingest(text, filename) {
        try {
            // Re-importing an SVG onto a floor whose geometry was edited on
            // the map is a conscious "replace source" action — warn first,
            // since processing the new SVG discards those edits.
            if (mbState.isGeometryEdited() && mbState.geojson?.features?.length) {
                const ok = window.confirm(
                    'Bu kata ait haritada yapılmış birim düzenlemeleri var.\n\n' +
                    'Yeni bir SVG yüklemek mevcut geometriyi değiştirecek; ' +
                    "düzenlemeler SVG yeniden işlenince kaybolabilir.\n\nDevam edilsin mi?");
                if (!ok) {
                    app.setStatus('SVG yükleme iptal edildi', 'saved');
                    return;
                }
                // User accepted replacing the source geometry.
                mbState.geometryEdited = false;
            }
            const info = parseSvgInfo(text);
            mbState.svgText = text;
            mbState.svgFilename = filename;
            mbState.svgInfo = info;
            await storage.setSvg(text);
            await ensureHeightsForSublayers(info);
            await mbState.persistMeta();

            $name.textContent = filename;
            $area.classList.add('has-file');
            renderStats(info);
            showSvg(text);

            $process.disabled = false;
            mbState.emit('svg-loaded');
            app.setStatus(`SVG yüklendi (${info.layers.rooms || 0} oda)`, 'saved');
            app.onStorageChange?.();

            // Auto-process subsequent floors using the project's shared
            // alignment so the user doesn't have to re-align each one.
            // Triggered when at least one *other* floor has already been
            // processed (i.e. the alignment is meaningful).
            if (shouldAutoProcess()) {
                const r = await processActiveFloor({ silent: true });
                if (r) {
                    app.setStatus(
                        `SVG yüklendi ve diğer katlarla aynı hizaya yerleştirildi (${r.geojson.features.length} feature)`,
                        'saved');
                    // The preview iframe must reload so the runtime
                    // picks up both the new floor in `config.venue.floorMap`
                    // and its merged geojson.
                    try { app?.reload?.(['venue.geojsonPath']); } catch {}
                }
            }
        } catch (e) {
            console.error(e);
            app.setStatus('SVG ayrıştırılamadı: ' + e.message, 'dirty');
        }
    }

    /**
     * True when the project already has at least one *other* floor with
     * processed geojson. In that case the shared alignment is non-trivial
     * and uploading a new floor should snap into the same world position
     * automatically — no manual "İşle" / "Hizala" needed.
     */
    function shouldAutoProcess() {
        const active = mbState.activeFloorKey;
        const others = mbState.listFloors().filter(f => f.key !== active);
        return others.some(f => !!f.geojson?.features?.length);
    }

    function renderStats(info) {
        const layerLines = Object.entries(info.layers)
            .map(([k, v]) => `<span class="ed-mb-stat-chip"><b>${v}</b> ${k}</span>`).join('');
        const sublayerLines = Object.entries(info.sublayers || {})
            .map(([k, v]) => `<span class="ed-mb-stat-chip ed-mb-stat-chip-soft"><b>${v}</b> ${k.toLowerCase()}</span>`).join('');
        $stats.innerHTML = `
          <div class="ed-mb-stat-row">${layerLines}</div>
          ${sublayerLines ? `<div class="ed-mb-stat-row">${sublayerLines}</div>` : ''}
          <div class="ed-mb-stat-meta">viewBox: ${Math.round(info.viewBox.width)} × ${Math.round(info.viewBox.height)}</div>
        `;
        $stats.hidden = false;
    }

    function showSvg(text) {
        if (panZoomInstance) {
            try { panZoomInstance.destroy(); } catch {}
            panZoomInstance = null;
        }
        $preview.innerHTML = text;
        const svgEl = $preview.querySelector('svg');
        if (svgEl) {
            svgEl.setAttribute('width', '100%');
            svgEl.setAttribute('height', '100%');
            svgEl.removeAttribute('style');
        }
        $preview.hidden = false;
        $emptyOrig.hidden = true;

        if (svgEl && window.svgPanZoom) {
            requestAnimationFrame(() => {
                try {
                    panZoomInstance = window.svgPanZoom(svgEl, {
                        zoomEnabled: true, controlIconsEnabled: true,
                        fit: true, center: true,
                        minZoom: 0.1, maxZoom: 50, zoomScaleSensitivity: 0.3,
                    });
                } catch (e) { console.warn('[upload] panZoom failed', e); }
            });
        }
    }

    function refreshFromState() {
        if (mbState.svgText) {
            $name.textContent = mbState.svgFilename || 'svg';
            $area.classList.add('has-file');
            if (mbState.svgInfo) renderStats(mbState.svgInfo);
            else $stats.hidden = true;
            showSvg(mbState.svgText);
            $process.disabled = false;
        } else {
            // Empty floor — reset the upload UI.
            $name.textContent = '';
            $area.classList.remove('has-file');
            $stats.hidden = true;
            $preview.innerHTML = '';
            $preview.hidden = true;
            $emptyOrig.hidden = false;
            if (panZoomInstance) {
                try { panZoomInstance.destroy(); } catch {}
                panZoomInstance = null;
            }
            $process.disabled = true;
        }
    }

    mbState.on('hydrate', refreshFromState);
    mbState.on('active-floor-changed', refreshFromState);
}
