/**
 * 3D heights pane: per-sublayer extrusion height controls + auto-mode slider.
 *
 * The processed map's `rooms-3d` layer paint expression is updated in place
 * whenever heights or the active mode changes.
 */

import { mbState, DEFAULT_HEIGHTS } from './state.js';
import { storage } from '../storage.js';
import { getProcessedMap, buildHeightExpr, refreshProcessedRooms } from './process.js';

/* Sublayers we never expose in the 3D-heights grid:
 *   • `walking` — always rendered flat (path/concourse fill).
 *   • `building` — handled by the auto shell-detector in the runtime
 *     map renderer; surfacing a slider here only causes confusion when
 *     a setting from this grid silently has no effect.
 * Everything else found in the active SVG gets a row, including
 * sublayers the editor has never seen before (carpark, entrance, wc,
 * info, prayer, …). New sublayers default to `DEFAULT_HEIGHTS[sl] ?? 4`. */
const HIDDEN_SUBLAYERS = new Set(['walking', 'building']);
const FALLBACK_HEIGHT  = 4;

/**
 * The 3D-heights grid must reflect *only* the dynamic sublayer groups that
 * actually exist in the current floor — never a static default list. We
 * source them from the parsed SVG when available, otherwise straight from
 * the GeoJSON room features (so floors loaded from GeoJSON alone still work).
 */
function collectSublayerKeys() {
    const keys = new Set();

    for (const s of Object.keys(mbState.svgInfo?.sublayers || {})) {
        keys.add(String(s).toLowerCase());
    }

    for (const feat of (mbState.geojson?.features || [])) {
        if (feat?.properties?.layer === 'rooms' && feat.properties.sublayer) {
            keys.add(String(feat.properties.sublayer).toLowerCase());
        }
    }

    return [...keys].filter(s => !HIDDEN_SUBLAYERS.has(s)).sort();
}

export async function initHeights(app) {
    const $section  = document.getElementById('mbSection-heights');
    const $modes    = [...document.querySelectorAll('#mbSection-heights .ed-mb-mode')];
    const $auto     = document.getElementById('mbHeightAuto');
    const $manual   = document.getElementById('mbHeightManual');
    const $autoSlider = document.getElementById('mbHeightScale');
    const $autoVal  = document.getElementById('mbHeightVal');
    const $grid     = document.getElementById('mbHeightGrid');

    function applyToMap() {
        const map = getProcessedMap();
        if (!map || !map.getLayer('rooms-3d')) return;
        const multiplier = mbState.heightMode === 'auto' ? mbState.heightScaleAuto : 1;
        const heights = mbState.heightMode === 'auto'
            ? Object.fromEntries(Object.keys(mbState.heights).map(k => [k, DEFAULT_HEIGHTS[k] ?? 4]))
            : mbState.heights;
        map.setPaintProperty('rooms-3d', 'fill-extrusion-height', buildHeightExpr(heights, multiplier));
    }

    /* ---- per-group (sublayer) render mode: walls vs solid block ---------- */
    const mapCfg = () => app?.getConfig?.()?.features?.map || {};
    function effRenderMode(sl) {
        const cfg = mapCfg();
        const bySub = cfg.renderModeBySublayer || {};
        return bySub[sl] || cfg.roomRenderMode || 'solid';
    }
    function setRenderMode(sl, mode) {
        const cfg = mapCfg();
        const bySub = { ...(cfg.renderModeBySublayer || {}) };
        bySub[sl] = mode;
        app?.setOverride?.('features.map.renderModeBySublayer', bySub);
        // Rebuild the editor preview's room sources, then push the override to
        // any live kiosk preview iframe so both stay in sync.
        try { refreshProcessedRooms(); } catch {}
        try { app?.reload?.(['features.map.renderModeBySublayer']); } catch {}
    }

    function updateModeUi() {
        $modes.forEach(b => b.classList.toggle('is-active', b.dataset.mode === mbState.heightMode));
        $auto.hidden   = mbState.heightMode !== 'auto';
        $manual.hidden = mbState.heightMode !== 'manual';
    }

    function updateAutoSlider() {
        const v = Math.round((mbState.heightScaleAuto ?? 0.1) * 10);
        $autoSlider.value = String(v);
        $autoVal.textContent = (v / 10).toFixed(1) + '×';
    }

    function buildManualGrid() {
        $grid.innerHTML = '';
        const list = collectSublayerKeys();
        if (list.length === 0) {
            $grid.innerHTML =
                '<div class="ed-mb-empty">' +
                'SVG yüklendiğinde tespit edilen tüm sublayer’lar burada listelenecek.' +
                '</div>';
            return;
        }

        for (const sl of list) {
            if (mbState.heights[sl] == null) {
                mbState.heights[sl] = DEFAULT_HEIGHTS[sl] ?? FALLBACK_HEIGHT;
            }
            const row = document.createElement('div');
            row.className = 'ed-mb-height-row';
            const cur = mbState.heights[sl];
            const rm = effRenderMode(sl);
            row.innerHTML = `
              <span class="ed-mb-height-name">${sl}</span>
              <button type="button" class="ed-mb-rm-toggle ${rm === 'walls' ? 'is-walls' : ''}"
                      data-sublayer="${sl}" title="Bu grubu duvarlı mı yoksa dolu blok olarak mı çizelim">
                ${rm === 'walls' ? 'Duvar' : 'Dolu'}
              </button>
              <input type="range" min="0" max="20" step="0.5" value="${cur}" data-sublayer="${sl}">
              <span class="ed-mb-height-val">${cur}</span>
            `;
            const input = row.querySelector('input');
            const valEl = row.querySelector('.ed-mb-height-val');
            input.addEventListener('input', () => {
                const v = parseFloat(input.value);
                mbState.heights[sl] = v;
                valEl.textContent = v;
                applyToMap();
                schedulePersist();
            });
            const rmBtn = row.querySelector('.ed-mb-rm-toggle');
            rmBtn.addEventListener('click', () => {
                const next = effRenderMode(sl) === 'walls' ? 'solid' : 'walls';
                rmBtn.classList.toggle('is-walls', next === 'walls');
                rmBtn.textContent = next === 'walls' ? 'Duvar' : 'Dolu';
                setRenderMode(sl, next);
            });
            $grid.appendChild(row);
        }
    }

    /**
     * Persist the *current floor's* heights with a debounce. We snap the
     * floor key + heights ref at schedule time so that switching floors
     * before the timer fires doesn't write the new floor's heights into
     * the old floor (or vice-versa). One pending timer per floor.
     */
    const persistTimers = new Map(); // floorKey -> timeoutId
    function schedulePersist() {
        const floorKey = mbState.activeFloorKey;
        const heights  = mbState.heights;
        if (!floorKey) return;
        const prev = persistTimers.get(floorKey);
        if (prev) clearTimeout(prev);
        const t = setTimeout(async () => {
            persistTimers.delete(floorKey);
            await storage.setFloorHeights(floorKey, heights);
            try { app?.reload?.(['features.map.sublayerHeights']); } catch {}
        }, 250);
        persistTimers.set(floorKey, t);
    }
    function flushPending() {
        for (const [floorKey, t] of persistTimers) {
            clearTimeout(t);
            const f = mbState.getFloor(floorKey);
            if (f) storage.setFloorHeights(floorKey, f.heights).catch(() => {});
        }
        persistTimers.clear();
    }

    let modeReloadTimer = null;
    function scheduleModeReload() {
        if (modeReloadTimer) clearTimeout(modeReloadTimer);
        modeReloadTimer = setTimeout(() => {
            try { app?.reload?.(['features.map.sublayerHeights']); } catch {}
        }, 250);
    }

    $modes.forEach(btn => {
        btn.addEventListener('click', () => {
            mbState.heightMode = btn.dataset.mode;
            updateModeUi();
            applyToMap();
            mbState.persistMeta();
            scheduleModeReload();
        });
    });

    $autoSlider.addEventListener('input', () => {
        const raw = Number($autoSlider.value);
        mbState.heightScaleAuto = raw / 10;
        $autoVal.textContent = (raw / 10).toFixed(1) + '×';
        applyToMap();
        mbState.persistMeta();
        scheduleModeReload();
    });

    function showSection() {
        $section.hidden = false;
        updateModeUi();
        updateAutoSlider();
        buildManualGrid();
    }

    mbState.on('hydrate', () => {
        if (mbState.geojson) showSection();
    });
    mbState.on('geojson-changed', () => {
        showSection();
        applyToMap();
    });
    mbState.on('active-floor-changed', () => {
        flushPending();
        if (mbState.geojson) {
            showSection();
            applyToMap();
        } else {
            $section.hidden = true;
        }
    });
    mbState.on('processed-map-ready', () => applyToMap());
    // process.js rebuilds the rooms/extrusion sources on every render,
    // so re-apply the per-floor height expression afterwards.
    mbState.on('processed-map-rendered', () => applyToMap());
}
