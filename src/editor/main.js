/**
 * Config Editor bootstrap.
 *
 * Architecture:
 *   [editor UI]  ←postMessage→  [preview iframe running the kiosk app with ?preview=1]
 *
 *   - Imports the canonical defaults from src/core/config.js
 *   - Merges them with localStorage overrides (kiosk:configOverrides)
 *   - Renders the schema-driven form
 *   - On every change:
 *       * updates overrides in localStorage,
 *       * sends a postMessage to the preview (hot apply), or
 *       * queues a debounced reload if the path is cold.
 *   - When the user focuses a field:
 *       * auto-navigates the preview to the field's primaryScene,
 *       * highlights the relevant DOM elements.
 *   - Provides a scene switcher, device switcher, search, reset and export.
 */

import { config as defaultConfig } from '../core/config.js';
import { renderForm, applySearchFilter } from './form-renderer.js';
import { createBridge } from './bridge.js';
import { DEVICE_PRESETS, fitDeviceFrame, buildPreviewUrl } from './device-presets.js';
import { deepMerge, deepClone, setByPath } from './path-utils.js';
import { downloadConfigJs } from './exporter.js';
import { getScenesForDevice, getSceneById, defaultSceneForDevice } from './scenes.js';
import { storage } from './storage.js';
import { fetchSheetTab, pickTab } from '../core/sheets.js';
import { initMapBuilder } from './map-builder/index.js';
import { initCategories } from './categories/index.js';
import { initExportPanel } from './export-panel/index.js';
import { initItemsTab } from './items/index.js';

const OVERRIDES_KEY = 'kiosk:configOverrides';
const DEVICE_KEY    = 'kiosk:editorDevice';
const SCENE_KEY     = 'kiosk:editorScene';
const TAB_KEY       = 'kiosk:editorTab';
const VALID_TABS    = ['map', 'settings', 'items', 'categories', 'export'];

/* ============================================================
 * State
 * ============================================================ */

function loadOverrides() {
    try {
        const raw = localStorage.getItem(OVERRIDES_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveOverrides(overrides) {
    try { localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides)); } catch {}
}

function buildMergedConfig() {
    const merged = deepClone(defaultConfig);
    deepMerge(merged, loadOverrides());
    return merged;
}

const initialTab = (() => {
    const fromHash = (location.hash || '').replace(/^#/, '');
    if (VALID_TABS.includes(fromHash)) return fromHash;
    const stored = localStorage.getItem(TAB_KEY);
    if (VALID_TABS.includes(stored)) return stored;
    return 'map';
})();

const state = {
    config: buildMergedConfig(),
    overrides: loadOverrides(),
    device: localStorage.getItem(DEVICE_KEY) || 'web',
    scene: localStorage.getItem(SCENE_KEY) || null,
    activeTab: initialTab,
    pendingReloadPaths: new Set(),
    reloadTimer: null,
    focusedPath: null,
};

/* ============================================================
 * DOM refs
 * ============================================================ */

const $form        = document.getElementById('edForm');
const $search      = document.getElementById('edSearch');
const $status      = document.getElementById('edStatus');
const $reloadPill  = document.getElementById('edReloadPill');
const $previewUrl  = document.getElementById('edPreviewUrl');
const $iframe      = document.getElementById('edPreviewFrame');
const $stage       = document.getElementById('edPreviewStage');
const $frame       = document.getElementById('edDeviceFrame');
const $resetBtn    = document.getElementById('edResetBtn');
const $reloadBtn   = document.getElementById('edReloadBtn');
const $deviceBtns  = [...document.querySelectorAll('.ed-device-btn')];
const $sceneBar    = document.getElementById('edSceneBar');
const $sceneHint   = document.getElementById('edSceneHint');
const $tabBtns     = [...document.querySelectorAll('.ed-tab')];
const $tabPanels   = [...document.querySelectorAll('.ed-tab-panel')];
const $storageBtn   = document.getElementById('edStorageBtn');
const $storageLabel = document.getElementById('edStorageLabel');

/* ============================================================
 * Bridge
 * ============================================================ */

const bridge = createBridge($iframe);
bridge.on((evt) => {
    if (evt.type === 'ready') {
        setStatus('Önizleme hazır', 'saved');
        // Re-apply the current scene after a reload.
        const sceneId = currentSceneId();
        if (sceneId) goToScene(sceneId, { silent: true });
    } else if (evt.type === 'applied') {
        setStatus('Uygulandı', 'saved');
    } else if (evt.type === 'reloadRequired') {
        queueReload(evt.data?.paths || []);
    } else if (evt.type === 'highlight:missed') {
        // Silently ignore — selectors simply didn't match in this scene.
    }
});

/* ============================================================
 * Scene management
 * ============================================================ */

function currentSceneId() {
    const allowed = getScenesForDevice(state.device).map(s => s.id);
    if (state.scene && allowed.includes(state.scene)) return state.scene;
    return defaultSceneForDevice(state.device);
}

function renderSceneBar() {
    $sceneBar.innerHTML = '';
    const scenes = getScenesForDevice(state.device);
    const active = currentSceneId();

    for (const s of scenes) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ed-scene-btn' + (s.id === active ? ' is-active' : '');
        btn.dataset.sceneId = s.id;
        btn.textContent = s.label;
        btn.title = s.description || '';
        btn.addEventListener('click', () => goToScene(s.id));
        $sceneBar.appendChild(btn);
    }

    const active_ = getSceneById(active);
    if ($sceneHint) $sceneHint.textContent = active_?.description || '';
}

function goToScene(sceneId, { silent = false } = {}) {
    const scene = getSceneById(sceneId);
    if (!scene) return;
    if (!scene.device.includes?.(state.device) && scene.device !== 'all') return;

    state.scene = sceneId;
    localStorage.setItem(SCENE_KEY, sceneId);

    $sceneBar.querySelectorAll('.ed-scene-btn').forEach(b => {
        b.classList.toggle('is-active', b.dataset.sceneId === sceneId);
    });
    if ($sceneHint) $sceneHint.textContent = scene.description || '';

    bridge.goToScene(sceneId, scene.commands);
    if (!silent) setStatus(`Sahne: ${scene.label}`, 'saved');
}

/* ============================================================
 * Form & change handling
 * ============================================================ */

function handleChange(path, value, field) {
    setByPath(state.config, path, value);
    setByPath(state.overrides, path, value);
    saveOverrides(state.overrides);

    if (field.requiresReload) {
        queueReload([path]);
        return;
    }

    bridge.setMany([{
        path,
        value,
        meta: {
            reapply: field.reapply,
            requiresReload: field.requiresReload,
        },
    }]);

    // <select> fields defer their scene jump to here (focus-time navigation
    // would dismiss the open native dropdown). Jump now so the edited
    // component is visible in the preview.
    if (field.type === 'select' && field.primaryScene
            && currentSceneId() !== field.primaryScene) {
        const scene = getSceneById(field.primaryScene);
        if (scene && (scene.device.includes?.(state.device) || scene.device === 'all')) {
            goToScene(field.primaryScene, { silent: true });
        }
    }

    setStatus('Uygulandı', 'saved');
}

function handleFieldFocus(path, field) {
    state.focusedPath = path;

    // Native <select> dropdowns are dismissed if we drive the preview (scene
    // navigation / highlight messages) while they're open. Skip focus-time
    // preview work for selects — they handle it on change (handleChange).
    if (field.type === 'select') return;

    // Move preview into the field's primary scene, if it differs.
    if (field.primaryScene) {
        const scene = getSceneById(field.primaryScene);
        if (scene && (scene.device.includes?.(state.device) || scene.device === 'all')) {
            if (currentSceneId() !== field.primaryScene) {
                goToScene(field.primaryScene, { silent: true });
            }
        }
    }

    // Highlight affected components after the scene has had a moment
    // to settle. If the field has no selectors, clear any previous.
    const selectors = field.selectors || [];
    if (!selectors.length) {
        bridge.clearHighlight();
        return;
    }

    const delay = field.primaryScene ? 600 : 40;
    setTimeout(() => {
        if (state.focusedPath !== path) return;     // user moved on
        bridge.highlight(selectors, field.label);
    }, delay);
}

function handleFieldBlur(path) {
    if (state.focusedPath === path) state.focusedPath = null;
    // Don't clear immediately — let the user see the highlight until
    // they focus another field. The preview-bridge also auto-clears
    // after a few seconds.
}

/* Category palette for schema fields (e.g. "Görünür Kategori Kartları").
 * IDB mirror first (kept fresh by the Kategoriler tab); falls back to a
 * direct Sheets read so the picker works before that tab was ever opened. */
let categoriesCache = null;
async function getEditorCategories() {
    if (categoriesCache) return categoriesCache;
    try {
        const local = await storage.getCategories();
        if (local?.categories?.length) {
            categoriesCache = local.categories;
            return categoriesCache;
        }
    } catch { /* IDB unavailable — try sheets */ }

    try {
        const sheets = state.config?.venue?.sheets;
        const tab = pickTab(sheets, 'categories');
        if (sheets?.sheetId && tab) {
            const rows = await fetchSheetTab(sheets.sheetId, tab);
            const cats = rows.map(r => ({
                apiKey:      (r.Category || r.category || '').trim(),
                displayName: (r.DisplayName_TR || r.displayName_TR || r.DisplayName || r.Category || '').trim(),
                color:       (r.Color || r.color || '').trim() || '#cccccc',
            })).filter(c => c.apiKey);
            if (cats.length) {
                categoriesCache = cats;
                return categoriesCache;
            }
        }
    } catch (e) {
        console.warn('[editor] categories fetch for picker failed', e);
    }
    return [];
}

function render() {
    renderForm($form, {
        config: state.config,
        onChange: handleChange,
        onFocus: handleFieldFocus,
        onBlur: handleFieldBlur,
        onJumpToScene: (sceneId) => goToScene(sceneId),
        getCategories: getEditorCategories,
    });
}

/* ============================================================
 * Reload management (cold path)
 * ============================================================ */

function queueReload(paths) {
    paths.forEach(p => state.pendingReloadPaths.add(p));
    $reloadPill.hidden = false;
    if (state.reloadTimer) clearTimeout(state.reloadTimer);
    state.reloadTimer = setTimeout(() => doReload(), 450);
    setStatus('Yeniden yükleniyor…', 'dirty');
}

function doReload() {
    state.pendingReloadPaths.clear();
    $reloadPill.hidden = true;
    const url = buildPreviewUrl(state.device);
    $previewUrl.textContent = url;

    // Same-URL reload is unreliable across browsers; force it explicitly.
    try {
        if ($iframe.contentWindow && $iframe.src.endsWith(url)) {
            $iframe.contentWindow.location.reload();
            return;
        }
    } catch { /* fall through */ }

    $iframe.src = url;
}

/* ============================================================
 * Device switching
 * ============================================================ */

function setDevice(device) {
    if (!DEVICE_PRESETS[device]) return;
    state.device = device;
    localStorage.setItem(DEVICE_KEY, device);

    $deviceBtns.forEach(b => b.classList.toggle('is-active', b.dataset.device === device));
    $frame.dataset.device = device;

    // Keep the current scene only if it's allowed on the new device.
    const allowed = getScenesForDevice(device).map(s => s.id);
    if (!state.scene || !allowed.includes(state.scene)) {
        state.scene = defaultSceneForDevice(device);
        localStorage.setItem(SCENE_KEY, state.scene);
    }

    renderSceneBar();

    const url = buildPreviewUrl(device);
    $iframe.src = url;
    $previewUrl.textContent = url;

    requestAnimationFrame(() => fitDeviceFrame($stage, $frame, device));
}

$deviceBtns.forEach(btn => {
    btn.addEventListener('click', () => setDevice(btn.dataset.device));
});

window.addEventListener('resize', () => {
    fitDeviceFrame($stage, $frame, state.device);
});

/* ============================================================
 * Toolbar: reset / export / manual reload
 * ============================================================ */

$resetBtn.addEventListener('click', async () => {
    if (!confirm('Tüm config düzenlemeleri ve harita projesi (svg, geojson, ikonlar, kategoriler) silinecek. Devam edilsin mi?')) return;
    state.overrides = {};
    saveOverrides(state.overrides);
    state.config = buildMergedConfig();
    try { await storage.clearAll(); } catch (e) { console.warn('storage.clearAll failed', e); }
    render();
    refreshStorageLabel();
    queueReload(['reset']);
    setStatus('Sıfırlandı', 'saved');
});

$reloadBtn.addEventListener('click', () => doReload());

/* ============================================================
 * Tab switching
 * ============================================================ */

const tabHandlers = {
    map: null,
    items: null,
    categories: null,
    export: null,
};

function setActiveTab(tab) {
    if (!VALID_TABS.includes(tab)) tab = 'map';
    state.activeTab = tab;
    localStorage.setItem(TAB_KEY, tab);
    if (location.hash.replace(/^#/, '') !== tab) {
        history.replaceState(null, '', '#' + tab);
    }

    $tabBtns.forEach(b => {
        const on = b.dataset.tab === tab;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $tabPanels.forEach(p => {
        p.classList.toggle('is-active', p.dataset.tab === tab);
    });

    if (tab === 'settings') {
        // Iframe layout depends on the stage size, which is 0 while hidden.
        requestAnimationFrame(() => fitDeviceFrame($stage, $frame, state.device));
    }
    if (tab === 'map')         tabHandlers.map?.activate?.();
    if (tab === 'items')       tabHandlers.items?.activate?.();
    if (tab === 'categories')  tabHandlers.categories?.activate?.();
    if (tab === 'export')      tabHandlers.export?.activate?.();
}

$tabBtns.forEach(btn => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
});
window.addEventListener('hashchange', () => {
    const t = (location.hash || '').replace(/^#/, '');
    if (VALID_TABS.includes(t) && t !== state.activeTab) setActiveTab(t);
});

/* ============================================================
 * Storage status pill
 * ============================================================ */

async function refreshStorageLabel() {
    try {
        const info = await storage.summary();
        if (info.hasGeojson || info.iconCount || info.hasCategories) {
            const parts = [];
            if (info.featureCount) parts.push(`${info.featureCount} feature`);
            if (info.iconCount)    parts.push(`${info.iconCount} ikon`);
            $storageLabel.textContent = parts.length ? parts.join(' · ') : 'Yüklendi';
            $storageBtn.classList.add('is-loaded');
            $storageBtn.classList.remove('is-empty');
        } else {
            $storageLabel.textContent = 'Boş';
            $storageBtn.classList.add('is-empty');
            $storageBtn.classList.remove('is-loaded');
        }
    } catch (e) {
        $storageLabel.textContent = '—';
    }
}

$storageBtn.addEventListener('click', () => setActiveTab('map'));

/* ============================================================
 * Search
 * ============================================================ */

$search.addEventListener('input', () => applySearchFilter($form, $search.value));

/* ============================================================
 * Status helper
 * ============================================================ */

let statusTimer = null;
function setStatus(text, variant) {
    $status.textContent = text;
    $status.classList.remove('is-dirty', 'is-saved');
    if (variant) $status.classList.add('is-' + variant);
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
        $status.textContent = 'Hazır';
        $status.classList.remove('is-dirty', 'is-saved');
    }, 2500);
}

/* ============================================================
 * Boot
 * ============================================================ */

render();
setDevice(state.device);
setStatus('Hazır');

// Storage-driven sub-features. They take a small `host` API that lets them
// trigger preview reloads / status updates without owning the bridge.
const featureHost = {
    reload:    (paths) => queueReload(paths || ['external']),
    setStatus,
    bridge,
    getConfig: () => state.config,
    getOverrides: () => state.overrides,
    setOverride: (path, value) => {
        setByPath(state.config, path, value);
        setByPath(state.overrides, path, value);
        saveOverrides(state.overrides);
        render();
    },
    onStorageChange: () => { categoriesCache = null; refreshStorageLabel(); },
};

tabHandlers.map        = initMapBuilder(document.getElementById('edMapBuilder'), featureHost);
tabHandlers.items      = initItemsTab(document.getElementById('edItems'), featureHost);
tabHandlers.categories = initCategories(document.getElementById('edCategories'), featureHost);
tabHandlers.export     = initExportPanel(document.getElementById('edExport'),    featureHost, {
    downloadConfigJs: () => downloadConfigJs(state.config),
});

setActiveTab(state.activeTab);
refreshStorageLabel();
