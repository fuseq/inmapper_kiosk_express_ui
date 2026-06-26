import { config } from './core/config.js';
import { featureLoader } from './core/feature-loader.js';
import { eventBus } from './core/event-bus.js';
import { state } from './core/state.js';
import { resolveInterface } from './core/interface-resolver.js';
import { getInterfaceProfile } from './core/interface-profile.js';

/* ------------------------------------------------------------
 * Preview mode (Config Editor)
 * ------------------------------------------------------------
 * When the app is loaded inside the editor iframe with ?preview=1
 * we deep-merge any localStorage overrides on top of `config`
 * BEFORE any apply*() or feature init runs, so what the user sees
 * in the iframe always reflects the editor's current state.
 */
const __params = new URLSearchParams(location.search);
const __isPreview = __params.get('preview') === '1';

if (__isPreview) {
    try {
        const raw = localStorage.getItem('kiosk:configOverrides');
        if (raw) {
            const overrides = JSON.parse(raw);
            (function deepMerge(t, s) {
                if (!s || typeof s !== 'object') return;
                for (const k of Object.keys(s)) {
                    const v = s[k];
                    if (Array.isArray(v)) t[k] = v.slice();
                    else if (v && typeof v === 'object') {
                        if (!t[k] || typeof t[k] !== 'object' || Array.isArray(t[k])) t[k] = {};
                        deepMerge(t[k], v);
                    } else t[k] = v;
                }
            })(config, overrides);
        }
    } catch (err) {
        console.warn('[preview] failed to load overrides', err);
    }
}

/* Resolve the active interface (web/kiosk/kiosk-portrait/mobile) for this
 * load. Honours an explicit `?view=` (editor preview / manual), then a fixed
 * `initialView`, then auto-detects web<->mobile by viewport. The resolved
 * value is written back to `config.initialView` so every downstream check
 * keeps working unchanged. */
config.initialView = resolveInterface(config, __params);

/* Convenience accessor for the current interface's structural profile. */
export function interfaceProfile() {
    return getInterfaceProfile(config.initialView);
}

/* Read editor-managed assets (geojson, categories, placed icons) from
 * IndexedDB and stash them on `window.__previewAssets`. The map / category
 * loaders check that first before hitting fetch(). */
const __previewAssetsReady = (async () => {
    if (!__isPreview) return null;
    try {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('kiosk-editor-store', 1);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            // If the store doesn't exist yet (editor never opened), the
            // upgrade path here is a no-op; it just creates empty stores.
            req.onupgradeneeded = () => {
                const d = req.result;
                if (!d.objectStoreNames.contains('kv'))    d.createObjectStore('kv');
                if (!d.objectStoreNames.contains('icons')) d.createObjectStore('icons', { keyPath: 'id' });
            };
        });
        const get = (store, key) => new Promise((res, rej) => {
            const t = db.transaction(store).objectStore(store).get(key);
            t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
        });
        const getAll = (store) => new Promise((res, rej) => {
            const t = db.transaction(store).objectStore(store).getAll();
            t.onsuccess = () => res(t.result || []); t.onerror = () => rej(t.error);
        });

        // Multi-floor layout: read the floor index and merge per-floor
        // geojson/placed-icons/etc. into a single dataset for the
        // runtime. Falls back to the legacy flat keys when a freshly
        // upgraded session hasn't migrated yet.
        const [floors, activeFloorKey, categories, icons, legacyGj, legacyPlaced, legacyHeights, legacyMeta, legacyLabels] = await Promise.all([
            get('kv', 'floors').catch(() => null),
            get('kv', 'activeFloorKey').catch(() => null),
            get('kv', 'categories').catch(() => null),
            getAll('icons').catch(() => []),
            get('kv', 'geojson').catch(() => null),
            get('kv', 'placedIcons').catch(() => null),
            get('kv', 'heights').catch(() => null),
            get('kv', 'meta').catch(() => null),
            get('kv', 'labelSizes').catch(() => null),
        ]);

        let geojson = null;
        let placedIcons = null;
        let heights = legacyHeights;
        let meta = legacyMeta;
        let labelSizes = legacyLabels;
        let floorList = null;

        if (Array.isArray(floors) && floors.length) {
            // New per-floor layout. Merge all floors into one geojson
            // (each feature tagged with its floor) and one placed-icon
            // list, then read meta/heights/labelSizes from whichever
            // floor the editor was last focussed on.
            floorList = [...floors].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const features = [];
            const placed = [];
            const labelMerged = {};
            for (const f of floorList) {
                const [gj, pl, lb] = await Promise.all([
                    get('kv', `floor:${f.key}:geojson`).catch(() => null),
                    get('kv', `floor:${f.key}:placedIcons`).catch(() => null),
                    get('kv', `floor:${f.key}:labelSizes`).catch(() => null),
                ]);
                if (gj?.features) {
                    for (const feat of gj.features) {
                        features.push({
                            ...feat,
                            properties: { ...(feat.properties || {}), floor: f.key },
                        });
                    }
                }
                if (Array.isArray(pl)) {
                    for (const p of pl) placed.push({ ...p, floor: f.key });
                }
                if (lb && typeof lb === 'object') Object.assign(labelMerged, lb);
            }
            geojson = features.length ? { type: 'FeatureCollection', features } : null;
            placedIcons = placed;
            labelSizes = labelMerged;

            const activeKey = activeFloorKey || floorList[0]?.key;
            let alignmentMeta = null;
            let bestCeArea = 0;
            for (const f of floorList) {
                const mm = await get('kv', `floor:${f.key}:meta`).catch(() => null);
                const ce = mm?.contentExtent;
                const area = (ce?.width || 0) * (ce?.height || 0);
                if (area > bestCeArea) {
                    bestCeArea = area;
                    alignmentMeta = mm;
                }
            }
            if (activeKey) {
                const [hh, mm] = await Promise.all([
                    get('kv', `floor:${activeKey}:heights`).catch(() => null),
                    get('kv', `floor:${activeKey}:meta`).catch(() => null),
                ]);
                heights = hh;
                meta = mm;
            }
            if (alignmentMeta?.contentExtent) {
                meta = { ...(meta || {}), contentExtent: alignmentMeta.contentExtent };
            }
        } else {
            // Pre-migration session — fall back to the flat keys.
            geojson = legacyGj;
            placedIcons = legacyPlaced;
        }

        // Bake the editor's per-label font-size overrides onto the writing
        // features so the kiosk preview matches the processed-map preview.
        // (labelSizes are stored separately from the geojson; without this the
        // kiosk would keep the SVG-derived auto sizes and never reflect edits.)
        if (geojson?.features && labelSizes && Object.keys(labelSizes).length) {
            for (const f of geojson.features) {
                if (f.properties?.layer !== 'writing') continue;
                const ovr = labelSizes[f.properties.id];
                if (ovr != null) f.properties.font_size = Number(ovr);
            }
        }

        const assets = { geojson, categories, placedIcons, icons, heights, meta, labelSizes, floors: floorList };
        window.__previewAssets = assets;

        // Push the editor-controlled extrusion heights into config so the
        // map renderer's `buildHeightExpr()` picks them up. Mirrors the
        // logic of map-builder/heights.js → applyToMap():
        //   • auto   → DEFAULT_HEIGHTS × heightScaleAuto
        //   • manual → mbState.heights as-is
        const projectAlignment = await get('kv', 'projectAlignment').catch(() => null);
        applyEditorHeights(heights, meta);
        applyEditorFloors(floorList);
        applyEditorGeoAlignment(meta, projectAlignment);
        return assets;
    } catch (e) {
        console.warn('[preview] could not read editor assets', e);
        return null;
    }
})();

const __DEFAULT_EDITOR_HEIGHTS = {
    walking: 0, building: 0, stand: 8, service: 6, food: 6, water: 0.5,
    other: 5, shop: 8, green: 1, medical: 6, commercial: 7, social: 5, structure: 3,
};

/**
 * Push the editor's floor list into the live config so the floor
 * selector and map renderer pick up new floors immediately when the
 * preview iframe reloads. Falls back silently when the editor only has
 * the default floor.
 */
function applyEditorGeoAlignment(meta, projectAlignment) {
    if (!config.venue) config.venue = {};
    const pa = projectAlignment && typeof projectAlignment === 'object' ? projectAlignment : {};
    const m = meta && typeof meta === 'object' ? meta : {};
    const ce = m.contentExtent || pa.contentExtent;
    const mapCenter = config.features?.map?.center;
    const align = {
        centerLat: m.centerLat ?? pa.centerLat ?? (Array.isArray(mapCenter) ? mapCenter[1] : 0),
        centerLng: m.centerLng ?? pa.centerLng ?? (Array.isArray(mapCenter) ? mapCenter[0] : 0),
        scale: m.scale ?? pa.scale ?? 0.03,
        rotation: m.rotation ?? pa.rotation ?? 0,
        originX: ce?.originX ?? 0,
        originY: ce?.originY ?? 0,
        svgWidth: ce?.width ?? 0,
        svgHeight: ce?.height ?? 0,
    };
    if (align.svgWidth > 0 && align.svgHeight > 0) {
        config.venue.geoAlignment = align;
    }
}

function applyEditorFloors(floors) {
    if (!Array.isArray(floors) || floors.length === 0) return;
    if (!config.venue) config.venue = {};
    const floorMap = {};
    for (const f of floors) floorMap[f.key] = f.name || f.key;
    config.venue.floorMap = { ...(config.venue.floorMap || {}), ...floorMap };
    if (!config.venue.defaultFloor || !floors.some(f => f.key === String(config.venue.defaultFloor))) {
        config.venue.defaultFloor = floors.find(f => f.key === '0')?.key || floors[0].key;
    }
}

function applyEditorHeights(heights, meta) {
    if (!config.features?.map) return;
    const mode  = meta?.heightMode || 'auto';
    const mult  = meta?.heightScaleAuto ?? 0.1;
    let effective;
    if (mode === 'auto') {
        /* The editor used to iterate only over `__DEFAULT_EDITOR_HEIGHTS`
         * keys here, which silently dropped any sublayer the static list
         * didn't know about (carpark, entrance, wc, info, …). Now we
         * union the static defaults with whatever keys the editor has
         * persisted from the live SVG — unknown sublayers fall back to
         * 4 m so they still get a sensible auto-scaled height. */
        effective = {};
        const dynamicKeys = (heights && typeof heights === 'object')
            ? Object.keys(heights) : [];
        const allKeys = new Set([
            ...Object.keys(__DEFAULT_EDITOR_HEIGHTS),
            ...dynamicKeys,
        ]);
        for (const k of allKeys) {
            const base = __DEFAULT_EDITOR_HEIGHTS[k] ?? 4;
            effective[k] = base * mult;
        }
    } else if (heights && typeof heights === 'object') {
        effective = { ...heights };
    } else {
        return;
    }
    // Merge over (don't replace) so any sublayer the editor doesn't know
    // about keeps its config default.
    config.features.map.sublayerHeights = {
        ...(config.features.map.sublayerHeights || {}),
        ...effective,
    };
}

function isIslandLayout() {
    return config.features.sidePanel?.layout === 'island';
}

function isKioskView() {
    const v = config.initialView;
    return v === 'kiosk' || v === 'kiosk-portrait';
}

function applyPanelSide() {
    const side = config.features.sidePanel?.defaultSide === 'left' ? 'left' : 'right';
    state.panelSide = side;

    if (isIslandLayout()) return;

    const panel = document.getElementById('mapSidePanel');
    const mapContainer = document.getElementById('mapContainer');
    const method = side === 'right' ? 'add' : 'remove';
    panel?.classList[method]('panel-right');
    mapContainer?.classList[method]('panel-right');

    if (mapContainer) {
        mapContainer.classList.remove('panel-visible-left', 'panel-visible-right');
        if (!panel?.classList.contains('hidden')) {
            mapContainer.classList.add(side === 'right' ? 'panel-visible-right' : 'panel-visible-left');
        }
    }
}

function applyIslandLayout() {
    if (!isIslandLayout()) return;

    const panel = document.getElementById('mapSidePanel');
    const mapPanel = document.getElementById('mapPanel');
    if (!panel) return;

    const icfg = config.features.sidePanel.island || {};
    const pos = icfg.position || 'bottom-left';

    panel.classList.add('island-layout', `island-${pos}`);
    if (mapPanel) mapPanel.classList.add(`island-${pos}`);

    const root = document.documentElement.style;
    root.setProperty('--island-width', `${icfg.width || 380}px`);
    root.setProperty('--island-max-height', icfg.maxHeight || '70vh');
    root.setProperty('--island-margin', `${icfg.margin ?? 20}px`);
    root.setProperty('--island-radius', `${icfg.borderRadius ?? 20}px`);

    const visibleRows = Math.max(1, Math.min(8, icfg.compactVisibleRows ?? 3));
    const headerH = 76;
    const contentPad = 16;
    const gridPadTop = 6;
    const rowH = 80;
    const gapH = 8;
    const hintH = 24;
    const compactH = headerH + contentPad + gridPadTop + (visibleRows * rowH) + ((visibleRows - 1) * gapH) + hintH;
    const margin = (icfg.margin ?? 20);
    const cappedH = `min(${compactH}px, calc(100vh - ${margin * 2}px))`;
    root.setProperty('--island-compact-height', cappedH);
}

function prepareDirectMapView() {
    const home = document.getElementById('initialHome');
    const slideshow = document.getElementById('homeMiniSlideshow');
    const mapEl = document.getElementById('floorMapContainer');
    const panel = document.getElementById('mapSidePanel');
    const mapContainer = document.getElementById('mapContainer');
    const mapFloorSel = document.getElementById('mapFloorSelectorCompact');

    if (home) {
        home.style.transition = 'none';
        home.style.opacity = '0';
        home.style.visibility = 'hidden';
        home.style.pointerEvents = 'none';
    }
    if (slideshow) slideshow.classList.add('hidden');

    if (mapEl) {
        mapEl.style.transition = 'none';
        mapEl.style.opacity = '1';
        mapEl.classList.add('map-ready');
    }

    if (panel && !isIslandLayout()) panel.classList.remove('hidden');

    if (!isIslandLayout() && mapContainer) {
        const side = config.features.sidePanel?.defaultSide || 'right';
        mapContainer.classList.add(side === 'right' ? 'panel-visible-right' : 'panel-visible-left');
    }
    if (mapFloorSel) {
        mapFloorSel.classList.remove('hidden');
        mapFloorSel.style.display = 'flex';
    }

    const detailView = document.getElementById('sideStoreDetailView');
    if (detailView) detailView.classList.add('hidden');
}

function activateMapView() {
    state.currentView = 'map';
    const isAutoStart = (config.features.navigation?.startPointMode || 'auto') === 'auto';
    if (isAutoStart) state.startPoint = config.venue.kioskLocation;
    console.log('🗺️ Started directly in map view');

    showDefaultSidePanel();
}

function showDefaultSidePanel() {
    eventBus.emit('sidePanel:showLocationList');
}

function applyTheme() {
    const { theme } = config;
    if (!theme) return;

    const root = document.documentElement.style;

    if (theme.backgroundGradient) {
        const [c1, c2, c3] = theme.backgroundGradient;
        root.setProperty('--bg-gradient-1', c1);
        root.setProperty('--bg-gradient-2', c2);
        root.setProperty('--bg-gradient-3', c3);

        const loader = document.getElementById('appLoader');
        if (loader) loader.style.background = `linear-gradient(135deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`;
    }

    const map = {
        accentColor:           '--accent',
        accentHover:           '--accent-hover',
        textPrimary:           '--theme-text',
        textSecondary:         '--theme-text-secondary',
        textMuted:             '--theme-text-muted',
        glassBackground:       '--glass-bg',
        glassBorder:           '--glass-border',
        glassBlur:             '--glass-blur',
    };

    const isNoGlass = theme.glassEnabled === false;

    const glassKeys = new Set([
        'glassBackground', 'glassBorder', 'glassBlur',
    ]);

    for (const [key, cssVar] of Object.entries(map)) {
        if (isNoGlass && glassKeys.has(key)) continue;
        if (theme[key] !== undefined) {
            root.setProperty(cssVar, theme[key]);
        }
    }

    const textBase = theme.textPrimary || 'rgba(255,255,255,0.95)';
    const tm = textBase.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (tm) {
        const [, tr, tg, tb, ta] = [null, +tm[1], +tm[2], +tm[3], tm[4] !== undefined ? +tm[4] : 1];
        const opacities = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.4];
        const tierNames = ['--t-95','--t-90','--t-85','--t-80','--t-75','--t-70','--t-65','--t-60','--t-55','--t-50','--t-40'];
        for (let i = 0; i < tierNames.length; i++) {
            const a = Math.min(1, ta * (opacities[i] / 0.95));
            root.setProperty(tierNames[i], `rgba(${tr},${tg},${tb},${a.toFixed(3)})`);
        }
        root.setProperty('--t-full', `rgb(${tr},${tg},${tb})`);
    }

    // Surface tier variables that are ONLY written during no-glass mode.
    // They're not re-set by the main theme loop, so we clear them when glass
    // is re-enabled — otherwise components stay solid-dark even after toggle.
    const SOLID_TIER_VARS = [
        '--s-3', '--s-5', '--s-8', '--s-10', '--s-12', '--s-15',
        '--s-20', '--s-22', '--s-25', '--s-30', '--s-35', '--s-50',
    ];

    if (isNoGlass) {
        document.documentElement.classList.add('no-glass');
        // Remove every leftover backdrop-filter contributor.
        root.setProperty('--glass-blur', '0px');

        const base = theme.solidSurface || 'rgb(18, 22, 48)';
        const rgb = parseColorToRgb(base);
        if (rgb) {
            const [r, g, b] = rgb;
            const clr = (r2, g2, b2) => `rgb(${Math.max(0,Math.min(255,r2))},${Math.max(0,Math.min(255,g2))},${Math.max(0,Math.min(255,b2))})`;

            const tiers = [
                ['--s-3',  r-3, g-4, b-6],
                ['--s-5',  r-3, g-4, b-6],
                ['--s-8',  r,   g,   b],
                ['--s-10', r,   g,   b],
                ['--s-12', r+2, g+2, b+2],
                ['--s-15', r+4, g+4, b+4],
                ['--s-20', r+7, g+8, b+8],
                ['--s-22', r+10,g+11,b+10],
                ['--s-25', r+12,g+13,b+14],
                ['--s-30', r+17,g+18,b+20],
                ['--s-35', r+22,g+23,b+24],
                ['--s-50', r+32,g+33,b+34],
            ];
            for (const [v, tr, tg, tb] of tiers) {
                root.setProperty(v, clr(tr, tg, tb));
            }
            root.setProperty('--glass-bg', clr(r, g, b));
            root.setProperty('--card-bg', clr(r, g, b));
            root.setProperty('--chip-bg', clr(r+17, g+18, b+17));
            root.setProperty('--input-bg', clr(r, g, b));
            root.setProperty('--glass-border', clr(r+30, g+30, b+30));
            if (!theme.cardBorder) {
                root.setProperty('--card-border', clr(r+25, g+25, b+25));
            }
        }
    } else {
        document.documentElement.classList.remove('no-glass');
        // Drop inline solid surface tiers; the main theme loop above already
        // refreshed --glass-bg, --glass-border, etc. for glass mode.
        for (const v of SOLID_TIER_VARS) root.removeProperty(v);
        // Card + chip surfaces share the base glass surface — no separate
        // per-component color controls. Derive them from glassBackground.
        if (theme.glassBackground) {
            root.setProperty('--card-bg', theme.glassBackground);
            root.setProperty('--chip-bg', theme.glassBackground);
            root.setProperty('--input-bg', theme.glassBackground);
        }
        if (theme.glassBorder && !theme.cardBorder) {
            root.setProperty('--card-border', theme.glassBorder);
        }
    }

    if (theme.cardBorder) {
        root.setProperty('--card-border', theme.cardBorder);
    }

    function hexToRgb(hex) {
        let h = (hex || '').replace('#', '');
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        if (h.length !== 6) return [0, 0, 0];
        return [
            parseInt(h.substring(0, 2), 16),
            parseInt(h.substring(2, 4), 16),
            parseInt(h.substring(4, 6), 16),
        ];
    }

    /**
     * Accepts hex (#rgb / #rrggbb), rgb(…), rgba(…) — returns [r, g, b] or null.
     * Needed by `solidSurface` logic, which previously only handled rgb().
     */
    function parseColorToRgb(str) {
        if (!str || typeof str !== 'string') return null;
        const s = str.trim();
        if (s.startsWith('#')) {
            const [r, g, b] = hexToRgb(s);
            return [r, g, b];
        }
        const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
        if (m) return [+m[1], +m[2], +m[3]];
        return null;
    }
    const rgb = (arr) => arr.join(', ');
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

    if (theme.accentColor) {
        const c = hexToRgb(theme.accentColor);
        root.setProperty('--accent-rgb', rgb(c));
        // Active chip surface derives straight from the accent (no separate
        // control) — a translucent accent fill keeps the selected state on-brand.
        root.setProperty('--chip-active-bg', `rgba(${rgb(c)}, 0.8)`);
        root.setProperty('--accent-dark-rgb', rgb(mix(c, [0,0,0], 0.45)));
        root.setProperty('--primary-light-rgb', rgb(mix(c, [255,255,255], 0.35)));
        root.setProperty('--blue-lighter-rgb', rgb(mix(c, [255,255,255], 0.6)));
        root.setProperty('--accent-light-rgb', rgb(mix(c, [255,255,255], 0.75)));
        // UI glow / highlight tiers follow accent — not backgroundGradient.
        root.setProperty('--gradient-2-rgb', rgb(c));
        root.setProperty('--gradient-3-rgb', rgb(mix(c, [255,255,255], 0.15)));
        root.setProperty('--blue-light-rgb', rgb(mix(c, [255,255,255], 0.25)));
    }
    if (theme.accentHover) root.setProperty('--accent-hover-rgb', rgb(hexToRgb(theme.accentHover)));

    // Mobile bottom-sheet tokens
    const mb = theme.mobile || {};
    const mobileMap = {
        sheetBackground:   '--mobile-sheet-bg',
        sheetShadow:       '--mobile-sheet-shadow',
        cardBackground:    '--mobile-card-bg',
        cardBorder:        '--mobile-card-border',
        surfaceBackground: '--mobile-surface-bg',
        dangerBackground:  '--mobile-danger-bg',
        dangerColor:       '--mobile-danger-color',
    };
    for (const [key, cssVar] of Object.entries(mobileMap)) {
        if (mb[key] != null) root.setProperty(cssVar, mb[key]);
    }

    // Mobile text colors: an explicit theme.mobile.text* override wins;
    // otherwise inherit the general theme text color so a single "Yazı Rengi"
    // change also restyles the mobile sheet. Secondary/muted derive from the
    // primary (the general secondary/muted are light, for the dark kiosk bg,
    // and would be invisible on the light mobile sheet).
    const toRgba = (color, alpha) => {
        const c = parseColorToRgb(color);
        return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})` : null;
    };
    const mTextPrimary = mb.textPrimary ?? theme.textPrimary;
    const mTextSecondary = mb.textSecondary ?? toRgba(theme.textPrimary, 0.62);
    const mTextMuted = mb.textMuted ?? toRgba(theme.textPrimary, 0.42);
    if (mTextPrimary) root.setProperty('--mobile-text-primary', mTextPrimary);
    if (mTextSecondary) root.setProperty('--mobile-text-secondary', mTextSecondary);
    if (mTextMuted) root.setProperty('--mobile-text-muted', mTextMuted);

    // Auto-derive accent-dependent mobile tokens from the resolved accent
    if (theme.accentColor) {
        const ac = hexToRgb(theme.accentColor);
        const acRgb = rgb(ac);
        root.setProperty('--mobile-accent-light', `rgba(${acRgb}, 0.2)`);
        root.setProperty('--mobile-accent-bg', `rgba(${acRgb}, 0.1)`);
        root.setProperty('--mobile-accent-hover-bg', `rgba(${acRgb}, 0.06)`);

        const lighter = mix(ac, [255, 255, 255], 0.35);
        root.setProperty('--mobile-progress-end', `rgb(${rgb(lighter)})`);
    }
    if (mb.progressGradientEnd) {
        root.setProperty('--mobile-progress-end', mb.progressGradientEnd);
    }

    // Glass-aware mobile sheet
    if (!isNoGlass && theme.glassEnabled) {
        root.setProperty('--mobile-sheet-bg', 'rgba(255, 255, 255, 0.45)');
        root.setProperty('--mobile-sheet-blur', theme.glassBlur || '25px');
    } else {
        root.setProperty('--mobile-sheet-blur', '0px');
    }
}

function applyBranding() {
    const { branding } = config;
    if (!branding) return;

    document.title = [branding.title, branding.subtitle].filter(Boolean).join(' - ');

    const selectors = {
        logos: ['.home-logo .logo-image', '.nav-logo', '#appLoader .loader-logo'],
        titles: ['.home-title', '.nav-logo-title', '#appLoader .loader-title'],
        subtitles: ['.home-title-location', '.nav-logo-subtitle', '#appLoader .loader-subtitle'],
    };

    if (branding.logo) {
        selectors.logos.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) { el.src = branding.logo; el.alt = branding.title || ''; }
        });
    }
    if (branding.title) {
        selectors.titles.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.textContent = branding.title;
        });
    }
    if (branding.subtitle !== undefined) {
        selectors.subtitles.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) el.textContent = branding.subtitle || '';
        });
    }
}

function applyNavbarConfig() {
    const { navbar } = config;
    if (!navbar) return;

    /* Mobile layout hides the bar in CSS; nothing to sync here. */
    if (document.documentElement.classList.contains('mobile-layout')) return;

    const navEl = document.querySelector('.glass-navbar');

    /* Structural rule: interfaces without a navbar (web) never show the bar,
     * regardless of `navbar.enabled` (which is a kiosk-scoped setting). */
    if (!getInterfaceProfile(config.initialView).navbar) {
        document.documentElement.classList.remove('map-view-active');
        if (navEl) navEl.style.display = 'none';
        document.documentElement.style.setProperty('--nav-offset', '0px');
        return;
    }

    /* On full map chrome (web island, kiosk side panel, portrait map rail)
     * the floating navbar sits over the island / top UI — hide it for
     * `currentView === 'map'` only; home + search overlays keep the bar. */
    const hideForMap = state.currentView === 'map';

    if (!navbar.enabled) {
        document.documentElement.classList.remove('map-view-active');
        if (navEl) navEl.style.display = 'none';
        document.documentElement.style.setProperty('--nav-offset', '0px');
        return;
    }

    if (hideForMap) {
        document.documentElement.classList.add('map-view-active');
        if (navEl) navEl.style.display = 'none';
        document.documentElement.style.setProperty('--nav-offset', '0px');
        return;
    }

    document.documentElement.classList.remove('map-view-active');
    if (navEl) navEl.style.display = '';
    document.documentElement.style.removeProperty('--nav-offset');

    const clockEl = document.querySelector('.time-date');
    if (clockEl) clockEl.style.display = navbar.clock ? '' : 'none';

    const logoGroup = document.querySelector('.nav-center');
    if (logoGroup) logoGroup.style.display = navbar.logo ? '' : 'none';

    const langSwitcher = document.querySelector('.language-switcher');
    if (langSwitcher) langSwitcher.style.display = navbar.langSwitcher ? '' : 'none';
}

function prepareMobileView() {
    document.documentElement.classList.add('mobile-layout');

    config.features.keyboard = { enabled: false };
    config.features.home = { ...config.features.home, enabled: false };

    const home = document.getElementById('initialHome');
    const slideshow = document.getElementById('homeMiniSlideshow');
    const mapEl = document.getElementById('floorMapContainer');
    const mapFloorSel = document.getElementById('mapFloorSelectorCompact');

    if (home) { home.style.display = 'none'; }
    if (slideshow) { slideshow.style.display = 'none'; }
    if (mapEl) {
        mapEl.style.transition = 'none';
        mapEl.style.opacity = '1';
        mapEl.classList.add('map-ready');
    }
    if (mapFloorSel) {
        mapFloorSel.classList.add('hidden');
        mapFloorSel.style.display = 'none';
    }
}

function activateMobileView() {
    state.currentView = 'map';
    const isAutoStart = (config.features.navigation?.startPointMode || 'auto') === 'auto';
    if (isAutoStart) state.startPoint = config.venue.kioskLocation;
    console.log('📱 Started in mobile view');
}

async function bootstrap() {
    if (__isPreview) {
        try { await __previewAssetsReady; } catch {}
    }
    const isMobile = config.initialView === 'mobile';
    const isPortrait = config.initialView === 'kiosk-portrait';
    console.log(`🚀 ${config.venue.name} Kiosk starting (modular architecture${isMobile ? ' - mobile' : isPortrait ? ' - kiosk-portrait' : ''})`);

    document.documentElement.setAttribute('data-initial-view', config.initialView);
    document.documentElement.setAttribute(
        'data-keyboard-enabled',
        String(config.features?.keyboard?.enabled !== false)
    );
    if (isMobile) document.documentElement.classList.add('mobile-layout');
    else document.documentElement.classList.remove('mobile-layout');
    if (isPortrait) {
        document.documentElement.classList.add('kiosk-portrait-layout');
    } else {
        document.documentElement.classList.remove('kiosk-portrait-layout');
    }

    /* Portrait reuses the horizontal kiosk pipeline 1:1 — same home
     * screen, same search-tab, same store-detail bottom sheet, same side
     * panel for routing. Portrait-specific: CSS reposition + portrait
     * rail; navbar follows the same rules as landscape (visible on home /
     * search, hidden on full map so it does not cover the rail / island).
     */
    applyTheme();
    applyBranding();
    if (isPortrait) applyKioskPortraitTheme();

    if (isMobile) {
        prepareMobileView();
    } else {
        eventBus.on('state:currentView', () => applyNavbarConfig());
        applyNavbarConfig();
        applyIslandLayout();
        applyPanelSide();
    }

    if (config.initialView === 'web') {
        prepareDirectMapView();
    }

    await featureLoader.loadAll();

    if (config.initialView === 'web') {
        activateMapView();
    } else if (isMobile) {
        activateMobileView();
    }

    if (__isPreview) {
        wireReapplyHandlers();
        import('./features/preview-bridge/index.js').then(m => m.init());
    }

    eventBus.emit('app:ready');
    console.log('✅ Application fully initialized');

    hideAppLoader();
}

/**
 * Push portrait-kiosk theme into CSS variables. Mirrors what `applyTheme`
 * does for the shared/mobile tokens, but scoped to the new `kioskPortrait`
 * theme group so the rest of the runtime stays untouched.
 */
function applyKioskPortraitTheme() {
    const kp = config.theme?.kioskPortrait;
    if (!kp) return;
    const root = document.documentElement.style;
    const set = (name, value) => {
        if (value === undefined || value === null || value === '') return;
        root.setProperty(name, value);
    };
    const setPx = (name, value) => {
        if (typeof value !== 'number' || !isFinite(value)) return;
        root.setProperty(name, `${value}px`);
    };

    setPx('--kp-edge-pad', kp.edgePadding);
    setPx('--kp-rail-w', kp.railWidth);
    /* These are signed offsets from viewport center (e.g. -580 → 580px
     * above center). CSS does `calc(50% + var(--kp-*-offset))`. */
    setPx('--kp-logo-offset',       kp.logoTopOffset);
    setPx('--kp-search-offset',     kp.searchTopOffset);
    setPx('--kp-cards-offset',      kp.cardsTopOffset);
    setPx('--kp-explore-offset',    kp.exploreTopOffset);
    setPx('--kp-search-tab-offset', kp.searchTabTopOffset);
    if (typeof kp.searchListMaxRows === 'number') {
        root.setProperty('--kp-search-rows', String(Math.max(1, Math.min(6, kp.searchListMaxRows))));
    }
}

/**
 * Editor-driven reapply handlers. Only wired when in preview mode.
 * Each handler re-runs the corresponding apply*() so the DOM / CSS
 * variables pick up the latest config without a full reload.
 */
function wireReapplyHandlers() {
    eventBus.on('theme:reapply',    () => { applyTheme(); applyKioskPortraitTheme(); });
    eventBus.on('branding:reapply', () => applyBranding());
    eventBus.on('navbar:reapply',   () => applyNavbarConfig());
    eventBus.on('island:reapply',   () => {
        // Clear old island position classes before reapplying.
        const panel = document.getElementById('mapSidePanel');
        const mapPanel = document.getElementById('mapPanel');
        ['island-top-left','island-top-right','island-bottom-left','island-bottom-right']
            .forEach(c => { panel?.classList.remove(c); mapPanel?.classList.remove(c); });
        applyIslandLayout();
        applyPanelSide();
    });
    eventBus.on('kioskPortrait:reapply', () => {
        applyKioskPortraitTheme();
        // Let the portrait-chrome feature re-render its rail items if the
        // configurable item list changed.
        eventBus.emit('portraitChrome:reapply');
    });
}

function hideAppLoader() {
    const loader = document.getElementById('appLoader');
    if (!loader) return;

    let hidden = false;
    const doHide = () => {
        if (hidden) return;
        hidden = true;
        loader.classList.add('loader-hide');
        setTimeout(() => loader.remove(), 450);
    };

    let mapReady = false;
    const onMapReady = () => { mapReady = true; maybeHide(); };
    const maybeHide = () => { if (mapReady) doHide(); };

    eventBus.on('map:ready', onMapReady);

    // Fallback: hide after a short delay in case map:ready never fires (e.g. no map view).
    setTimeout(() => { if (!hidden) doHide(); }, 2500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
} else {
    bootstrap();
}

window.__testRoute = function (from, to) {
    from = from || 'ID001';
    to = to || 'ID036';
    console.log(`🚀 Requesting route via API: ${from} → ${to}`);
    eventBus.emit('route:draw', { fromId: from, toId: to, routeType: state.routeType || 'shortest' });
};

window.__clearRoute = function () {
    const mapMod = featureLoader.getModule('map');
    if (!mapMod) return;
    const { mapRenderer } = mapMod;
    if (mapRenderer.mainMap) {
        mapRenderer.clearRoute(mapRenderer.mainMap);
        console.log('🧹 Route cleared');
    }
};

window.__listUnits = function () {
    const mapMod = featureLoader.getModule('map');
    if (!mapMod) return;
    const units = mapMod.mapRenderer.getAvailableUnits();
    console.log(`📋 ${units.length} units available:`, units);
    return units;
};

export { config, featureLoader, eventBus, isIslandLayout, isKioskView };
