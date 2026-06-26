import { config } from './config.js';
import { getInterfaceProfile } from './interface-profile.js';

const FEATURE_REGISTRY = {
    data:           () => import('../features/data/index.js'),
    map:            () => import('../features/map/index.js'),
    models3d:       () => import('../features/models-3d/index.js'),
    messaging:      () => import('../features/messaging/index.js'),
    clock:          () => import('../features/clock/index.js'),
    home:           () => import('../features/home/index.js'),
    search:         () => import('../features/search/index.js'),
    floorSelector:  () => import('../features/floor-selector/index.js'),
    keyboard:       () => import('../features/keyboard/index.js'),
    navigation:     () => import('../features/navigation/index.js'),
    sidePanel:      () => import('../features/side-panel/index.js'),
    storeDetail:    () => import('../features/store-detail/index.js'),
    idle:           () => import('../features/idle/index.js'),
    editMode:       () => import('../features/side-panel/edit-mode.js'),
    bottomSheet:    () => import('../features/bottom-sheet/index.js'),
    assistant:      () => import('../features/assistant/index.js'),
    portraitChrome: () => import('../features/portrait-chrome/index.js'),
};

/* Load order
 * ----------
 * Side-panel + store-detail register the `sidePanel:showPreviewMode` /
 * `location:selected` listeners that surface a unit's detail. They MUST
 * run before `map` so that the very first tap on a unit — which fires
 * those events from the map click handler — is not lost because the
 * subscribers were still mid-init. UI-only features (home/search/…)
 * follow; the heavy modules (map, models3d) come after the listeners are
 * wired. `portraitChrome` stays last — it needs the panel/search/map to
 * already exist before mounting its overlay slots.
 */
const LOAD_ORDER = [
    'data',
    'sidePanel', 'storeDetail',
    'home', 'search', 'navigation', 'floorSelector', 'keyboard',
    'map', 'models3d',
    'messaging', 'clock', 'idle',
    'portraitChrome',
];

const MOBILE_LOAD_ORDER = [
    'data', 'map', 'models3d', 'navigation',
    'floorSelector', 'bottomSheet', 'assistant', 'idle',
];

const MOBILE_SKIP = new Set(['home', 'search', 'keyboard', 'sidePanel', 'clock', 'storeDetail', 'editMode']);

const _loaded = new Map();

export const featureLoader = {
    async loadAll() {
        const isMobile = config.initialView === 'mobile';
        const order = isMobile ? MOBILE_LOAD_ORDER : LOAD_ORDER;
        const profile = getInterfaceProfile(config.initialView);

        for (const name of order) {
            if (isMobile && MOBILE_SKIP.has(name)) continue;

            /* Structural divergence: skip kiosk-only surfaces on interfaces
             * that don't have them. Web has no start/home screen and no
             * kiosk store-detail tab (it uses the inline island detail). */
            if (!isMobile) {
                if (name === 'home' && !profile.home) continue;
                if (name === 'storeDetail' && !profile.storeDetailTab) continue;
            }

            const featureConfig = config.features[name];
            if (name === 'bottomSheet') {
                await this.enable(name, { enabled: true });
                continue;
            }
            if (name === 'portraitChrome') {
                // View-driven feature — no config.features.portraitChrome
                // entry needed; the feature is a no-op in non-portrait
                // views. Always enable; init() decides whether to mount.
                await this.enable(name, { enabled: true });
                continue;
            }
            if (!featureConfig || !featureConfig.enabled) {
                console.log(`⏭️  Feature "${name}" is disabled, skipping`);
                continue;
            }

            await this.enable(name, featureConfig);
        }
        console.log(`✅ All features loaded (${_loaded.size}/${order.length})`);
    },

    async enable(name, options) {
        if (_loaded.has(name)) return;

        const loader = FEATURE_REGISTRY[name];
        if (!loader) {
            console.warn(`⚠️  Unknown feature: "${name}"`);
            return;
        }

        try {
            const mod = await loader();
            if (typeof mod.init === 'function') {
                await mod.init(options || config.features[name] || {});
            }
            _loaded.set(name, mod);
            console.log(`✅ Feature "${name}" initialized`);
        } catch (err) {
            console.error(`❌ Failed to init feature "${name}":`, err);
        }
    },

    async disable(name) {
        const mod = _loaded.get(name);
        if (!mod) return;

        try {
            if (typeof mod.destroy === 'function') {
                await mod.destroy();
            }
            _loaded.delete(name);
            console.log(`🔌 Feature "${name}" disabled`);
        } catch (err) {
            console.error(`❌ Failed to destroy feature "${name}":`, err);
        }
    },

    getModule(name) {
        return _loaded.get(name) || null;
    },

    isLoaded(name) {
        return _loaded.has(name);
    },
};
