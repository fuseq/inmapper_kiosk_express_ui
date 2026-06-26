/**
 * Label sizes pane: per-feature S/M/L override for `writing` features.
 *
 * Updates `mbState.labelSizes` and re-applies them onto the geojson source
 * so the processed map updates in place.
 */

import { mbState } from './state.js';
import { storage } from '../storage.js';
import { getProcessedMap } from './process.js';

const PRESETS = [8, 12, 18];
const MIN_FS = 4;
const MAX_FS = 96;

function clampFs(n) {
    if (!Number.isFinite(n)) return null;
    return Math.max(MIN_FS, Math.min(MAX_FS, Math.round(n)));
}

export async function initLabels(app) {
    const $section = document.getElementById('mbSection-labels');
    const $grid    = document.getElementById('mbLabelGrid');
    const $search  = document.getElementById('mbLabelSearch');
    const $bulk    = [...document.querySelectorAll('#mbSection-labels .ed-mb-label-bulk button[data-fs]')];
    const $bulkCustom = document.getElementById('mbLabelBulkCustom');
    const $bulkApply  = document.getElementById('mbLabelBulkApply');

    /* ---- Normalization: per-tier minZoom (kiosk-only) -------------------- *
     * These are global config overrides under features.map.labels. The
     * processed-map preview ignores minZoom, so changes are pushed to the
     * kiosk preview iframe via setOverride + reload. */
    const $normToggle = [...document.querySelectorAll('#mbLabelNormToggle button[data-norm]')];
    const $normOpts   = document.getElementById('mbLabelNormOpts');
    const $zoomSm = document.getElementById('mbLabelZoomSm');
    const $zoomMd = document.getElementById('mbLabelZoomMd');
    const $zoomLg = document.getElementById('mbLabelZoomLg');
    const $zoomSmVal = document.getElementById('mbLabelZoomSmVal');
    const $zoomMdVal = document.getElementById('mbLabelZoomMdVal');
    const $zoomLgVal = document.getElementById('mbLabelZoomLgVal');

    const labelsCfg = () => app?.getConfig?.()?.features?.map?.labels || {};

    function syncNormUi() {
        const cfg = labelsCfg();
        const on = cfg.normalization !== false;
        $normToggle.forEach(b => b.classList.toggle('is-active', (b.dataset.norm === 'on') === on));
        if ($normOpts) $normOpts.hidden = !on;
        const mz = cfg.minZoom || {};
        const set = (slider, valEl, v, def) => {
            const z = Number(v ?? def);
            if (slider) slider.value = String(z);
            if (valEl) valEl.textContent = z;
        };
        set($zoomSm, $zoomSmVal, mz.sm, 19);
        set($zoomMd, $zoomMdVal, mz.md, 17);
        set($zoomLg, $zoomLgVal, mz.lg, 15);
    }

    function applyMinZoom() {
        app?.setOverride?.('features.map.labels.minZoom', {
            sm: Number($zoomSm.value),
            md: Number($zoomMd.value),
            lg: Number($zoomLg.value),
        });
        try { app?.reload?.(['features.map.labels']); } catch {}
    }

    $normToggle.forEach(btn => {
        btn.addEventListener('click', () => {
            app?.setOverride?.('features.map.labels.normalization', btn.dataset.norm === 'on');
            syncNormUi();
            try { app?.reload?.(['features.map.labels']); } catch {}
        });
    });

    [[$zoomSm, $zoomSmVal], [$zoomMd, $zoomMdVal], [$zoomLg, $zoomLgVal]].forEach(([sl, valEl]) => {
        sl?.addEventListener('input', () => {
            if (valEl) valEl.textContent = sl.value;
            applyMinZoom();
        });
    });

    function applyToMap() {
        const map = getProcessedMap();
        if (!map || !mbState.geojson) return;
        const src = map.getSource('writing');
        if (!src) return;
        const features = mbState.geojson.features
            .filter(f => f.properties.layer === 'writing')
            .map(f => {
                const ovr = mbState.labelSizes[f.properties.id];
                return ovr
                    ? { ...f, properties: { ...f.properties, font_size: ovr } }
                    : f;
            });
        src.setData({ type: 'FeatureCollection', features });
    }

    function build(filter = '') {
        if (!mbState.geojson) { $grid.innerHTML = ''; return; }
        const labels = mbState.geojson.features
            .filter(f => f.properties.layer === 'writing')
            .filter(f => !filter || (f.properties.text || '').toLowerCase().includes(filter));
        $grid.innerHTML = '';
        for (const f of labels) {
            const id = f.properties.id;
            const cur = Number(mbState.labelSizes[id] ?? f.properties.font_size ?? 12);
            const row = document.createElement('div');
            row.className = 'ed-mb-label-row';
            const display = (f.properties.text || '(boş)').replace(/\n/g, ' ');
            row.innerHTML = `
              <span class="ed-mb-label-text" title="${escapeHtml(display)}">${escapeHtml(display.slice(0, 22))}</span>
              <div class="ed-mb-label-presets" data-id="${id}">
                ${PRESETS.map(p => `<button type="button" data-fs="${p}" class="${cur === p ? 'is-active' : ''}">${p === 8 ? 'S' : p === 12 ? 'M' : 'L'}</button>`).join('')}
                <input type="number" class="ed-mb-label-custom" min="${MIN_FS}" max="${MAX_FS}" step="1" value="${cur}" title="Özel boyut (px)">
              </div>
            `;
            const $btns  = row.querySelectorAll('button');
            const $input = row.querySelector('input.ed-mb-label-custom');

            const refreshActive = (val) => {
                $btns.forEach(b => b.classList.toggle('is-active', Number(b.dataset.fs) === val));
                $input.value = val;
            };

            $btns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const fs = Number(btn.dataset.fs);
                    mbState.labelSizes[id] = fs;
                    refreshActive(fs);
                    schedulePersist();
                    applyToMap();
                });
            });

            $input.addEventListener('change', () => {
                const fs = clampFs(parseFloat($input.value));
                if (fs == null) { $input.value = cur; return; }
                mbState.labelSizes[id] = fs;
                refreshActive(fs);
                schedulePersist();
                applyToMap();
            });

            $grid.appendChild(row);
        }
    }

    /**
     * Persist the *current floor's* labelSizes after a debounce. We snap
     * the floor key + labelSizes reference at schedule time so that
     * switching floors before the timer fires doesn't end up writing
     * the new floor's data into the old floor's row (or vice-versa).
     * Each floor gets its own pending timer keyed by floor key.
     */
    const persistTimers = new Map(); // floorKey -> timeoutId
    function schedulePersist() {
        const floorKey = mbState.activeFloorKey;
        const sizes    = mbState.labelSizes;   // ref to the active floor's object
        if (!floorKey) return;
        const prev = persistTimers.get(floorKey);
        if (prev) clearTimeout(prev);
        const t = setTimeout(async () => {
            persistTimers.delete(floorKey);
            await storage.setFloorLabelSizes(floorKey, sizes).catch(() => {});
            // Refresh the kiosk preview iframe so the "Ayarlar" map picks up
            // the new sizes (it reads baked font_size, not the live override).
            try { app?.reload?.(['features.map.labels']); } catch {}
        }, 250);
        persistTimers.set(floorKey, t);
    }
    /** Flush every pending floor immediately. Called when switching floors. */
    function flushPending() {
        for (const [floorKey, t] of persistTimers) {
            clearTimeout(t);
            const f = mbState.getFloor(floorKey);
            if (f) storage.setFloorLabelSizes(floorKey, f.labelSizes).catch(() => {});
        }
        persistTimers.clear();
    }

    $search.addEventListener('input', () => build($search.value.trim().toLowerCase()));

    function applyBulk(fs) {
        if (!Number.isFinite(fs) || !mbState.geojson) return;
        for (const f of mbState.geojson.features) {
            if (f.properties.layer === 'writing') {
                mbState.labelSizes[f.properties.id] = fs;
            }
        }
        schedulePersist();
        applyToMap();
        build($search.value.trim().toLowerCase());
    }

    $bulk.forEach(btn => {
        btn.addEventListener('click', () => applyBulk(Number(btn.dataset.fs)));
    });

    $bulkApply?.addEventListener('click', () => {
        const fs = clampFs(parseFloat($bulkCustom.value));
        if (fs == null) return;
        $bulkCustom.value = fs;
        applyBulk(fs);
    });
    $bulkCustom?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); $bulkApply.click(); }
    });

    function show() { $section.hidden = false; build(); applyToMap(); syncNormUi(); }
    function hide() { $section.hidden = true; }
    mbState.on('geojson-changed', show);
    mbState.on('hydrate', () => { if (mbState.geojson) show(); });
    mbState.on('active-floor-changed', () => {
        // Make sure pending writes for the *previous* floor land before
        // its labelSizes object goes "out of focus" via the property shim.
        flushPending();
        if (mbState.geojson) show();
        else hide();
    });
    // process.js re-creates the writing source with raw features on every
    // re-render (e.g. after a floor switch). Re-apply overrides afterwards
    // otherwise the user-set sizes "disappear" visually.
    mbState.on('processed-map-rendered', () => {
        if (!$section.hidden) applyToMap();
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
