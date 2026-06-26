/**
 * Preview bridge — lives inside the kiosk app when loaded with ?preview=1.
 *
 * Responsibilities:
 *   - Handshake with the editor (postMessage 'preview:ready')
 *   - Apply incoming config mutations in-place and emit the matching
 *     eventBus 'reapply' events so the app updates its DOM / CSS
 *     variables without reloading.
 *   - If a change targets a cold path, request an iframe reload.
 *   - Honour scene commands from the editor (editor:goToScene) to drive
 *     the UI into the screen where the user's edit is visible.
 *   - Highlight DOM elements (editor:highlight) to show which component
 *     a focused form field affects.
 */

import { config } from '../../core/config.js';
import { eventBus } from '../../core/event-bus.js';
import { state, dataStore } from '../../core/state.js';
import { isKioskView } from '../../app.js';

/* ============================================================
 * Cold-path detection
 *
 * These prefixes identify paths whose change cannot be applied live —
 * they need the iframe to reload. The editor's schema also tags each
 * field with requiresReload, but we keep a defensive fallback here in
 * case the editor is out of sync.
 * ============================================================ */
const COLD_PATH_PREFIXES = [
    'initialView',
    'features.data.',
    'features.map.',
    'features.navigation.routeTypes',
    'features.navigation.startPointMode',
    'features.navigation.droppedPin.',
    'features.navigation.qrBaseUrl',
    'features.keyboard.',
    'features.search.enabled',
    'features.storeDetail.enabled',
    'features.messaging.enabled',
    'features.clock.enabled',
    'features.floorSelector.enabled',
    'features.sidePanel.enabled',
    'features.sidePanel.layout',
    'features.home.',
    'venue.',
    'theme.mobile.categoryGrid.',
];

function isColdPath(path, fieldMeta) {
    if (fieldMeta?.requiresReload) return true;
    if (fieldMeta?.reapply)        return false;
    return COLD_PATH_PREFIXES.some(prefix =>
        path === prefix.replace(/\.$/, '') || path.startsWith(prefix)
    );
}

/* ============================================================
 * Path helpers
 * ============================================================ */
function setByPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
}

function inferReapplyEvents(path) {
    const events = new Set();
    if (path.startsWith('theme.')) events.add('theme:reapply');
    if (path.startsWith('branding.') || path === 'venue.name') events.add('branding:reapply');
    if (path.startsWith('navbar.')) events.add('navbar:reapply');
    if (path.startsWith('features.sidePanel.island.') ||
        path === 'features.sidePanel.layout' ||
        path === 'features.sidePanel.defaultSide') {
        events.add('island:reapply');
    }
    if (path.startsWith('features.models3d.')) events.add('models3d:reapply');
    return events;
}

/* ============================================================
 * Hot apply
 * ============================================================ */
function applyChange(change) {
    const { path, value, meta } = change;

    if (isColdPath(path, meta)) {
        postToParent({ type: 'preview:reloadRequired', paths: [path] });
        return;
    }

    setByPath(config, path, value);

    const events = new Set();
    if (meta?.reapply) events.add(`${meta.reapply}:reapply`);
    inferReapplyEvents(path).forEach(e => events.add(e));

    events.forEach(e => eventBus.emit(e));

    postToParent({ type: 'preview:applied', path, value });
}

/* ============================================================
 * Scene navigation
 *
 * The editor sends { type: 'editor:goToScene', commands: [...] }.
 * Each command is a short verb we map to existing app primitives.
 * Commands run sequentially with small delays so DOM transitions can
 * settle between them.
 * ============================================================ */
async function runCommands(commands) {
    // Each scene transition starts from a clean slate. Without this, leftover
    // state from a previously shown scene (e.g. a drawn route + navigation
    // card, or a selected store detail) leaks into the next scene and the
    // preview shows overlapping / impossible combinations of UI.
    try { await resetPreviewState(); } catch (err) {
        console.warn('[preview-bridge] resetPreviewState failed', err);
    }

    for (const cmd of (commands || [])) {
        try {
            await runCommand(cmd);
        } catch (err) {
            console.warn('[preview-bridge] scene command failed', cmd, err);
        }
        await wait(80);
    }
}

/**
 * Tear down all transient UI state (route, navigation, selection, store
 * detail, bottom sheet mode …). Called before each scene transition so
 * that scenes start from a predictable baseline.
 */
async function resetPreviewState() {
    eventBus.emit('route:clear');
    eventBus.emit('map:deselected');
    eventBus.emit('storeDetail:hide');

    state.selectedLocation = null;
    state.endPoint = null;
    state.startPoint = null;
    state.currentRoute = null;

    const detailContent = document.getElementById('storeDetailContent');
    if (detailContent) {
        detailContent.classList.add('hidden');
        detailContent.classList.remove('active');
    }
    const searchContent = document.getElementById('searchContent');
    if (searchContent) searchContent.classList.remove('hidden');

    const detail = document.getElementById('sideStoreDetailView');
    if (detail) {
        detail.classList.add('hidden');
        detail.style.display = '';
    }

    // Remove any leftover nav / route cards from previous scenes.
    document.querySelectorAll(
        '.isl-nav, .isl-nav-card, .isl-nav-step-card, ' +
        '.ms-nav-step-card, .sp-nav-card, .nav-step-card, ' +
        '.similar-stores-container, .route-info-card'
    ).forEach(el => el.remove());

    // Let reset propagate before the scene's own commands run.
    await wait(60);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runCommand(cmd) {
    switch (cmd.type) {
        case 'closeSearch': {
            const tab = document.getElementById('searchTab');
            tab?.classList.remove('open', 'closing', 'animating');
            const home = document.getElementById('initialHome');
            home?.classList.remove('search-mode', 'animating');
            return;
        }

        case 'openSearch': {
            if (config.initialView === 'web') {
                // Web has no home / search-tab screen — fall back to
                // the canonical default map view.
                eventBus.emit('map:default');
                return;
            }
            // Make sure the home screen is actually visible first —
            // showSearchTab() reads the home element and bails if it's
            // `display:none`.
            const home = document.getElementById('initialHome');
            if (home) {
                home.style.display = '';
                home.style.opacity = '1';
                home.style.visibility = 'visible';
                home.style.pointerEvents = 'auto';
            }
            eventBus.emit('search:open');
            // Wait for the transition to finish (search tab uses a delayed
            // transition of ~0.5s + 0.6s).
            await wait(1200);
            return;
        }

        case 'showHome': {
            // Ensure no stale classes block showing the home screen.
            const home = document.getElementById('initialHome');
            const tab  = document.getElementById('searchTab');
            if (home) {
                home.style.display = '';
                home.classList.remove('search-mode', 'animating');
            }
            tab?.classList.remove('open', 'closing', 'animating');
            eventBus.emit('home:requestShow');
            return;
        }

        case 'goToMap': {
            // Drive the preview into the canonical "default" map view:
            // panel/island visible, floor selector visible, no back
            // button. This is what most map-* scenes want (Birim Seçili,
            // Rota Çizili, Varsayılan, …). The kiosk-only explore mode
            // is a separate command (`goToExplore`).
            const home = document.getElementById('initialHome');
            const searchTab = document.getElementById('searchTab');
            const slideshow = document.getElementById('homeMiniSlideshow');
            if (home) {
                home.style.transition = 'none';
                home.style.opacity = '0';
                home.style.visibility = 'hidden';
                home.style.pointerEvents = 'none';
                home.classList.remove('search-mode', 'animating');
            }
            if (searchTab) searchTab.classList.remove('open', 'closing', 'animating');
            if (slideshow) slideshow.classList.add('hidden');

            const panel = document.getElementById('mapSidePanel');
            if (panel && !isKioskView()) panel.classList.remove('hidden');

            eventBus.emit('map:default');
            return;
        }

        case 'goToExplore': {
            // Kiosk-only "Haritayı Keşfet": panel hidden, only floor
            // selector + back button visible. Drives the preview into
            // the kiosk-specific explore scene.
            const home = document.getElementById('initialHome');
            const searchTab = document.getElementById('searchTab');
            const slideshow = document.getElementById('homeMiniSlideshow');
            if (home) {
                home.style.transition = 'none';
                home.style.opacity = '0';
                home.style.visibility = 'hidden';
                home.style.pointerEvents = 'none';
                home.classList.remove('search-mode', 'animating');
            }
            if (searchTab) searchTab.classList.remove('open', 'closing', 'animating');
            if (slideshow) slideshow.classList.add('hidden');

            eventBus.emit('map:explore');
            return;
        }

        case 'goToItemEditor': {
            /* Editor "Birimler" tab modu. Tam kiosk render'ı + tıklanabilir
             * polygon'lar, ama: home/search/side-panel/store-detail/geri
             * butonu hepsi gizli. Sadece harita + kat seçici görünür.
             *
             * Tıklama akışı: map/index.js içindeki click handler
             * `state.itemEditorMode` true iken normal selection yerine
             * `eventBus.emit('editor:itemClicked')` yollar — burada bunu
             * yakalayıp parent window'a iletiyoruz. */
            state.itemEditorMode = true;

            const home      = document.getElementById('initialHome');
            const searchTab = document.getElementById('searchTab');
            const slideshow = document.getElementById('homeMiniSlideshow');
            const panel     = document.getElementById('mapSidePanel');
            const backBtn   = document.getElementById('mapBackBtn');
            const detail    = document.getElementById('storeDetailContent');
            const mapFloor  = document.getElementById('mapFloorSelectorCompact');

            const hide = (el) => {
                if (!el) return;
                el.style.transition = 'none';
                el.style.opacity = '0';
                el.style.visibility = 'hidden';
                el.style.pointerEvents = 'none';
                el.classList.remove('search-mode', 'animating', 'open');
            };
            hide(home);
            hide(searchTab);
            hide(slideshow);
            if (panel)   panel.classList.add('hidden');
            if (backBtn) backBtn.style.display = 'none';
            if (detail) { detail.classList.add('hidden'); detail.classList.remove('active'); }

            if (mapFloor) {
                mapFloor.classList.remove('hidden');
                mapFloor.style.display = 'flex';
            }

            /* Make sure the underlying map module is initialised. Emitting
             * `map:default` would also bring in side-panel/island; we want
             * the OPPOSITE — just the map. So directly toggle currentView. */
            state.currentView = 'map';

            // Force the map's container to be sized — if the kiosk booted
            // into web/kiosk home mode the floor map container may be
            // display:none.
            const mapContainer = document.getElementById('floorMapContainer');
            if (mapContainer) {
                mapContainer.style.display = '';
                mapContainer.classList.remove('hidden');
            }

            // Resize + fit after a tick so the container has its size.
            setTimeout(async () => {
                try {
                    const { featureLoader } = await import('../../core/feature-loader.js');
                    const mapMod = featureLoader.getModule('map');
                    if (mapMod?.mapRenderer?.mainMap) {
                        mapMod.mapRenderer.mainMap.resize();
                        mapMod.mapRenderer.fitToAll?.(mapMod.mapRenderer.mainMap);
                    }
                } catch (e) { /* not ready yet */ }
            }, 60);
            return;
        }

        case 'clearSelection': {
            state.selectedLocation = null;
            state.endPoint = null;
            state.startPoint = null;
            eventBus.emit('map:deselected');
            return;
        }

        case 'selectFirstLocation': {
            // Wait for locations data to be ready — may arrive async.
            await waitFor(() => Array.isArray(dataStore.locations) && dataStore.locations.length > 0, 3000);
            const loc = pickSampleLocation();
            if (!loc) return;

            // The "Harita — Birim Seçili" scene is meant to preview the
            // *map* state with a unit highlighted (side panel / island
            // shows store preview, route button, similar stores …). On
            // kiosk, emitting `location:selected` would also pop the
            // pre-map storeDetail tab over the map — that's a separate
            // flow (search → detail → start route), not what this scene
            // is for. So we drive the map-selection path directly:
            //   • set selection state
            //   • make sure side panel is visible
            //   • emit routePoint:updated + sidePanel:showPreviewMode
            //   • highlight the feature on the map (via map module)
            state.selectedLocation = loc;
            state.endPoint = loc;
            const isAuto = (config.features.navigation?.startPointMode || 'auto') === 'auto';
            if (!state.startPoint && isAuto) {
                state.startPoint = config.venue?.kioskLocation || null;
            }

            const panel = document.getElementById('mapSidePanel');
            if (panel) panel.classList.remove('hidden');

            eventBus.emit('routePoint:updated', { point: 'end', location: loc });
            if (config.initialView === 'mobile') {
                // Mobile uses the bottom sheet — `map:locationClicked` is what
                // bottom-sheet/index.js listens to in order to switch into
                // detail mode and snap-to-fit.
                eventBus.emit('map:locationClicked', { location: loc });
            } else {
                eventBus.emit('sidePanel:showPreviewMode', loc);
            }
            eventBus.emit('map:locationSelected', { location: loc });

            // Highlight + zoom on the actual map if the module is available.
            try {
                const mapMod = (await import('../../core/feature-loader.js')).featureLoader.getModule('map');
                if (mapMod?.mapRenderer?.mainMap) {
                    mapMod.mapRenderer.selectFeature(mapMod.mapRenderer.mainMap, loc.id);
                    mapMod.mapRenderer.flyToFeature?.(mapMod.mapRenderer.mainMap, loc.id);
                }
            } catch { /* map module not ready yet — preview mode is fine without zoom */ }
            return;
        }

        case 'drawSampleRoute': {
            await waitFor(() => Array.isArray(dataStore.locations) && dataStore.locations.length > 0, 3000);
            const loc = pickSampleLocation();
            if (!loc) return;
            state.selectedLocation = loc;
            state.endPoint = loc;
            if (!state.startPoint) {
                state.startPoint = config.venue?.kioskLocation || dataStore.locations[1] || loc;
            }
            eventBus.emit('location:selected', { locationId: loc.id, fromMap: false });
            await wait(120);
            eventBus.emit('navigation:startRoute');
            return;
        }

        case 'mobileHome': {
            // Bottom sheet default state is home — just ensure nothing else
            // is selected.
            state.selectedLocation = null;
            eventBus.emit('map:deselected');
            eventBus.emit('sheet:requestSnap', 'peek');
            return;
        }

        default:
            console.warn('[preview-bridge] unknown scene command', cmd);
    }
}

function pickSampleLocation() {
    const locs = dataStore.locations || [];
    // Prefer a "real" location over the kiosk stub.
    return locs.find(l => l && l.id !== 0 && l.name) || locs[0];
}

function waitFor(predicate, timeoutMs = 2000) {
    return new Promise(resolve => {
        const t0 = Date.now();
        const tick = () => {
            if (predicate()) return resolve(true);
            if (Date.now() - t0 > timeoutMs) return resolve(false);
            setTimeout(tick, 80);
        };
        tick();
    });
}

/* ============================================================
 * Highlight overlay
 *
 * Non-intrusive outlines around the elements matched by a list of
 * selectors. Each element gets a floating pill labelling it, and a
 * pulsing border. Cleared on editor:clearHighlight or after a timeout.
 * ============================================================ */

const HIGHLIGHT_STYLE_ID = 'preview-bridge-highlight-style';
const HIGHLIGHT_CLASS    = 'pb-highlight-target';
const HIGHLIGHT_ROOT_ID  = 'pb-highlight-root';
let highlightTimer = null;

function ensureHighlightStyle() {
    if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
    // CRITICAL: do NOT touch `position` on the target — many highlighted
    // components (navbar, island, side-panel, bottom-sheet, etc.) rely on
    // `position: fixed` for their layout. Forcing `position: relative` here
    // pulls them into normal flow and leaves an empty hole behind. Outline
    // + box-shadow render outside the box without affecting layout, which
    // is enough to make the target stand out without any z-index hacks.
    const css = `
        .${HIGHLIGHT_CLASS} {
            outline: 2px solid #4f46e5 !important;
            outline-offset: 2px !important;
            box-shadow:
                0 0 0 4px rgba(79, 70, 229, 0.22),
                0 8px 30px rgba(79, 70, 229, 0.25) !important;
            border-radius: inherit;
            animation: pb-highlight-pulse 1.4s ease-in-out infinite;
        }
        @keyframes pb-highlight-pulse {
            0%, 100% { outline-color: rgba(79, 70, 229, 0.95); }
            50%      { outline-color: rgba(79, 70, 229, 0.45); }
        }
        #${HIGHLIGHT_ROOT_ID} {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 9999;
        }
        #${HIGHLIGHT_ROOT_ID} .pb-tag {
            position: absolute;
            padding: 4px 10px;
            background: #4f46e5;
            color: white;
            font: 600 11px/1 -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
            border-radius: 999px;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
            white-space: nowrap;
            transform: translate(0, -100%) translateY(-6px);
        }
    `;
    const el = document.createElement('style');
    el.id = HIGHLIGHT_STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
}

function clearHighlight() {
    document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach(el => {
        el.classList.remove(HIGHLIGHT_CLASS);
    });
    document.getElementById(HIGHLIGHT_ROOT_ID)?.remove();
    if (highlightTimer) {
        clearTimeout(highlightTimer);
        highlightTimer = null;
    }
}

function applyHighlight(selectors, label) {
    // If the app loader is still visible, defer — the underlying UI
    // isn't ready yet.
    const loader = document.getElementById('appLoader');
    if (loader && !loader.classList.contains('hidden') &&
        loader.style.display !== 'none' && loader.style.opacity !== '0') {
        setTimeout(() => applyHighlight(selectors, label), 200);
        return;
    }

    ensureHighlightStyle();
    clearHighlight();

    const root = document.createElement('div');
    root.id = HIGHLIGHT_ROOT_ID;
    document.body.appendChild(root);

    const targets = [];
    for (const sel of (selectors || [])) {
        try {
            document.querySelectorAll(sel).forEach(el => targets.push(el));
        } catch { /* invalid selector, ignore */ }
    }

    if (targets.length === 0) {
        postToParent({ type: 'preview:highlight:missed', selectors });
        return;
    }

    // Only highlight elements that are actually visible in the viewport
    // or at least in the DOM; some components render off-screen.
    const visible = targets.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    });
    const chosen = visible.length ? visible : targets;

    chosen.forEach((el, idx) => {
        el.classList.add(HIGHLIGHT_CLASS);
        if (idx === 0 && label) {
            const r = el.getBoundingClientRect();
            const tag = document.createElement('div');
            tag.className = 'pb-tag';
            tag.textContent = label;
            tag.style.left = `${Math.max(8, r.left)}px`;
            tag.style.top  = `${Math.max(28, r.top)}px`;
            root.appendChild(tag);
        }
    });

    // Auto-scroll the first target into view ONLY when it's actually
    // off-screen. Calling scrollIntoView on an element that is already
    // visible (e.g. a fixed navbar or bottom sheet) can still bump the
    // page when the document body is shorter than the viewport, which
    // produces the same "empty area" symptom as the position bug above.
    const first = chosen[0];
    if (first && !isInViewport(first)) {
        try { first.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
    }

    highlightTimer = setTimeout(clearHighlight, 4000);
}

function isInViewport(el) {
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth  || document.documentElement.clientWidth;
    // A small margin tolerates partial overlap (sticky headers, etc.).
    return r.bottom > 8 && r.top < vh - 8 && r.right > 8 && r.left < vw - 8;
}

/* ============================================================
 * postMessage plumbing
 * ============================================================ */
function postToParent(msg) {
    try {
        window.parent?.postMessage(msg, '*');
    } catch (err) {
        console.warn('[preview-bridge] postMessage failed', err);
    }
}

function onMessage(e) {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
        case 'editor:hello':
            postToParent({ type: 'preview:ready' });
            break;

        case 'editor:setMany': {
            const changes = Array.isArray(msg.changes) ? msg.changes : [];
            for (const ch of changes) applyChange(ch);
            break;
        }

        case 'editor:goToScene':
            runCommands(msg.commands);
            break;

        case 'editor:highlight':
            applyHighlight(msg.selectors, msg.label);
            break;

        case 'editor:clearHighlight':
            clearHighlight();
            break;

        case 'editor:highlightItem': {
            /* Items tab: zoom + highlight a feature by ID. Used when the
             * user clicks a row in the list — we want the map to follow. */
            (async () => {
                try {
                    const { featureLoader } = await import('../../core/feature-loader.js');
                    const mapMod = featureLoader.getModule('map');
                    if (!mapMod?.mapRenderer?.mainMap) return;
                    mapMod.mapRenderer.selectFeature(mapMod.mapRenderer.mainMap, msg.id || null);
                    if (msg.id) mapMod.mapRenderer.flyToFeature?.(mapMod.mapRenderer.mainMap, msg.id);
                } catch (err) { console.warn('[preview-bridge] highlightItem failed', err); }
            })();
            break;
        }

        case 'editor:setItemEditorMode': {
            state.itemEditorMode = !!msg.enabled;
            break;
        }

        case 'editor:patchGeojson': {
            /* Live geometry edit from the Map Builder — swap the geojson
             * in place (no reload). */
            (async () => {
                try {
                    if (!msg.geojson?.features) return;
                    const { featureLoader } = await import('../../core/feature-loader.js');
                    const mapMod = featureLoader.getModule('map');
                    mapMod?.mapRenderer?.updateGeojson?.(msg.geojson);
                } catch (err) { console.warn('[preview-bridge] patchGeojson failed', err); }
            })();
            break;
        }

        case 'editor:setModels': {
            /* Live 3D model placement from the Map Builder. */
            (async () => {
                try {
                    const models = Array.isArray(msg.models) ? msg.models : [];
                    config.features.models3d = {
                        ...(config.features.models3d || {}),
                        enabled: true,
                        models,
                    };
                    eventBus.emit('models3d:reapply');
                } catch (err) { console.warn('[preview-bridge] setModels failed', err); }
            })();
            break;
        }
    }
}

export function init() {
    window.addEventListener('message', onMessage);
    postToParent({ type: 'preview:ready' });

    /* `locations:loaded` is usually emitted BEFORE this bridge is
     * imported (featureLoader.loadAll runs first). So we check the
     * already-populated dataStore here and emit `data-ready` right away
     * if locations are present. The .on() registrations below still
     * cover the case where data is reloaded later in the iframe's life. */
    if (Array.isArray(dataStore.locations) && dataStore.locations.length > 0) {
        // Defer one tick so the iframe parent has time to wire its
        // listener after the initial 'preview:ready' handshake.
        setTimeout(() => postToParent({ type: 'preview:ready', phase: 'data-ready' }), 0);
    }

    // Announce again once the app has booted enough data.
    eventBus.on('app:ready', () => postToParent({ type: 'preview:ready', phase: 'app-ready' }));
    eventBus.on('locations:loaded', () => postToParent({ type: 'preview:ready', phase: 'data-ready' }));

    /* Forward item-editor click events to the parent (editor Items tab).
     * map/index.js emits these only while `state.itemEditorMode` is on. */
    eventBus.on('editor:itemClicked', ({ id }) => {
        postToParent({ type: 'preview:itemClicked', id: id ?? null });
    });

    console.log('👁️  Preview bridge active');
}

export function destroy() {
    window.removeEventListener('message', onMessage);
    clearHighlight();
}
