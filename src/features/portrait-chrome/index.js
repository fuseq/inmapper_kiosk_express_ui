/**
 * Kiosk Dikey (Portrait) chrome.
 *
 * The portrait kiosk reuses the entire horizontal kiosk pipeline — same
 * `.initial-home`, `.search-tab`, `.store-detail-content`, side panel.
 * `kiosk-portrait.css` repositions those for a 1080×1920 viewport.
 *
 * The one piece that doesn't have a direct horizontal-kiosk analog is
 * the row of utility actions that normally lives in the top navbar
 * (which we hide). This feature injects a small right-edge rail with
 * those actions:
 *
 *     ┌──────────────────────────────────┐
 *     │                                  │
 *     │  ←──  yatay kiosk home/search/   │
 *     │       store-detail/side-panel    │
 *     │       (CSS repositioned)         │
 *     │                                  │
 *     │                          ┌────┐  │
 *     │                          │home│  │
 *     │                          │find│  │
 *     │                          │lang│  │
 *     │                          │ a11│  │
 *     │                          └────┘  │
 *     │                                  │
 *     └──────────────────────────────────┘
 *
 * Also exposes a `kp-mode-*` class on <html> so portrait CSS can target
 * which surfaces are visible (idle / search / map / card).
 */

import { eventBus } from '../../core/event-bus.js';
import { config } from '../../core/config.js';
import { state } from '../../core/state.js';
import { featureLoader } from '../../core/feature-loader.js';

const SVG = {
    arrowLeft:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M5 12L12 19M5 12L12 5"/></svg>',
    home:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    lang:         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14M5 8l3 8M5 8l-3 8"/><path d="M9 16h-4"/><path d="M14 20l4-10 4 10M15.5 16h5"/></svg>',
    accessibility:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><path d="M10 22V14L7 10V6H17V10L14 14V22"/><path d="M10 14H14"/></svg>',
    findMe:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>',
};

/** Current "mode" of the portrait chrome — drives overlay visibility.
 *
 *   idle    home screen overlays cover the map
 *   search  search-tab open with the search content (results + keyboard)
 *   detail  search-tab open with the store-detail content
 *           (rail / floor selector stay hidden — they'd sit behind the
 *           opaque sheet anyway)
 *   map     map is fully visible to the user. Route directions panel
 *           may be docked at top-center, but the map is the foreground
 *           surface and the user can pan/zoom — so rail + floor
 *           selector are visible and useful here.
 */
let chromeMode = 'idle';

const PORTRAIT_MODES = new Set(['idle', 'search', 'detail', 'map']);

let railEl = null;

/* ------------------------------------------------------------ */
/* mount                                                        */
/* ------------------------------------------------------------ */

function mount() {
    const root = document.querySelector('.main-container') || document.body;
    railEl = document.createElement('div');
    railEl.id = 'kpRail';
    railEl.className = 'kp-rail';
    railEl.dataset.kpSlot = '';
    root.appendChild(railEl);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ------------------------------------------------------------ */
/* rail rendering                                               */
/* ------------------------------------------------------------ */

function renderRail() {
    if (!railEl) return;
    const items = config.theme?.kioskPortrait?.railItems || ['home', 'findMe'];
    railEl.innerHTML = '';
    for (const item of items) railEl.appendChild(makeRailBtn(item));
}

function makeRailBtn(kind) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `kp-rail-btn kp-rail-${kind}`;
    btn.dataset.kpAction = kind;
    const icon = railIcon(kind);
    const label = railLabel(kind);
    btn.innerHTML = `<span class="kp-rail-icon">${icon}</span><span class="kp-rail-label">${escapeHtml(label)}</span>`;
    btn.title = label;
    btn.addEventListener('click', () => handleRailAction(kind));
    return btn;
}

function railIcon(kind) {
    switch (kind) {
        case 'back':           return SVG.arrowLeft;
        case 'findMe':         return SVG.findMe;
        case 'home':           return SVG.home;
        case 'lang':           return SVG.lang;
        case 'accessibility':  return SVG.accessibility;
        default:               return SVG.home;
    }
}

function railLabel(kind) {
    switch (kind) {
        case 'back':           return 'Geri';
        case 'findMe':         return 'Konumum';
        case 'home':           return 'Ana Sayfa';
        case 'lang':           return 'Dil';
        case 'accessibility':  return 'Erişim';
        default:               return '';
    }
}

/* ------------------------------------------------------------ */
/* actions                                                      */
/* ------------------------------------------------------------ */

function handleRailAction(kind) {
    switch (kind) {
        case 'back':
        case 'home':
            resetToHome();
            return;
        case 'findMe':
            flyToKioskLocation();
            return;
        case 'lang':
            cycleLanguage();
            return;
        case 'accessibility':
            document.documentElement.classList.toggle('kp-a11y');
            return;
    }
}

/* Full reset: clear any drawn route / pin / selection on the map, drop
 * the state machine back to idle, then show the home overlay. Same
 * effect as tapping the X in the island route panel. */
function resetToHome() {
    eventBus.emit('route:clear');
    const autoStart = (config.features?.navigation?.startPointMode || 'auto') === 'auto';
    state.startPoint = autoStart ? (config.venue?.kioskLocation || null) : null;
    state.endPoint = null;
    state.selectedLocation = null;
    eventBus.emit('home:requestShow');
}

/* "Konumum" — focuses the camera on the kiosk's own coordinate, which
 * we treat as the user's start point (we don't have real geolocation in
 * a kiosk context). Restores the initial framing (zoom/bearing/pitch
 * from config.features.map) so any free-pan the user did is undone.
 * Doesn't touch state — a drawn route survives the focus change. */
function flyToKioskLocation() {
    const mapMod = featureLoader.getModule('map');
    const map = mapMod?.mapRenderer?.mainMap;
    if (!map) return;
    const m = config.features.map || {};
    if (!Array.isArray(m.center)) return;
    try {
        map.easeTo({
            center:  m.center,
            zoom:    typeof m.zoom    === 'number' ? m.zoom    : 17,
            bearing: typeof m.bearing === 'number' ? m.bearing : 0,
            pitch:   typeof m.pitch   === 'number' ? m.pitch   : 0,
            duration: 800,
        });
    } catch (e) {
        /* older maplibre may not support some props — silently ignore */
    }
}

function cycleLanguage() {
    const buttons = document.querySelectorAll('.lang-option');
    if (!buttons.length) return;
    let activeIdx = -1;
    buttons.forEach((b, i) => { if (b.classList.contains('active')) activeIdx = i; });
    const next = buttons[(activeIdx + 1) % buttons.length];
    next?.click();
}

/* ------------------------------------------------------------ */
/* mode wiring                                                  */
/* ------------------------------------------------------------ */

function setMode(mode) {
    if (!PORTRAIT_MODES.has(mode)) return;
    chromeMode = mode;
    const root = document.documentElement;
    PORTRAIT_MODES.forEach(m => root.classList.toggle(`kp-mode-${m}`, m === mode));
}

function wireEvents() {
    eventBus.on('app:ready', () => setMode('idle'));
    eventBus.on('home:show', () => setMode('idle'));

    eventBus.on('search:open',   () => setMode('search'));
    eventBus.on('search:opened', () => setMode('search'));
    eventBus.on('search:closed', () => {
        if (state.endPoint || state.selectedLocation) setMode('map');
        else if (state.currentView === 'map') setMode('map');
        else setMode('idle');
    });

    /* Search-tab is open with store-detail content. The user is reading
     * details inside the sheet — they haven't transitioned to the map
     * yet. Keep rail / floor selector hidden during this state. */
    eventBus.on('location:selected', ({ fromMap }) => {
        if (fromMap && state.currentView === 'map') return;
        setMode('detail');
    });
    eventBus.on('navigation:directToMap',    () => setMode('detail'));
    eventBus.on('map:locationClicked',       () => {
        if (state.currentView === 'map') return;
        setMode('detail');
    });
    eventBus.on('sidePanel:showPreviewMode', () => {
        if (state.currentView === 'map') return;
        setMode('detail');
    });

    /* User has crossed over to the map: route is drawn, side-panel
     * shows directions docked at top, but the map is the dominant
     * surface and the user can pan / change floors / go home. Surface
     * the rail and the floor selector. */
    eventBus.on('navigation:startRoute',     () => setMode('map'));
    eventBus.on('sidePanel:showRouteMode',   () => setMode('map'));
    eventBus.on('map:default',               () => setMode('map'));
    eventBus.on('map:explore',               () => setMode('map'));
    eventBus.on('map:deselected',            () => setMode('map'));

    eventBus.on('route:clear',  () => { if (chromeMode === 'detail') setMode('map'); });
    eventBus.on('idle:timeout', () => setMode('idle'));

    eventBus.on('portraitChrome:reapply', () => renderRail());
}

/* ------------------------------------------------------------ */
/* lifecycle                                                    */
/* ------------------------------------------------------------ */

export function init() {
    if (config.initialView !== 'kiosk-portrait') return;

    mount();
    renderRail();
    wireEvents();

    setMode('idle');
    console.log('🪧 portraitChrome mounted');
}

export function destroy() {
    railEl?.remove();
    railEl = null;
}
