import { config } from '../../core/config.js';
import { dataStore } from '../../core/state.js';
import { fetchSheetTab, pickTab } from '../../core/sheets.js';

const DEFAULT_CATEGORY = {
    displayName: 'Diğer',
    icon: 'map-pin',
    description: '',
    color: '#cccccc',
};

const CACHE_KEY = 'kiosk:categoriesCache';

/* ── Sheet → category record ─────────────────────────────────────────
 *
 * Schema in the categories tab (case-sensitive headers):
 *
 *   Category          (required) → apiKey, e.g. "fashion"
 *   Color             (required) → "#E74C3C"
 *   DisplayName_TR    (optional) → falls back to Cat_TR / humanise(key)
 *   DisplayName_EN    (optional) → falls back to TR / humanise(key)
 *   Icon              (optional) → emoji; defaults to "🏷️"
 *   Order             (optional) → numeric sort order; default 999
 *
 * Extra columns are ignored — users may keep notes in extra cols.
 */
function rowToCategory(row) {
    const apiKey = (row.Category || row.category || row.key || '').trim();
    if (!apiKey) return null;
    const order = parseInt(row.Order || row.order || '', 10);
    return {
        apiKey,
        color:        (row.Color || row.color || '').trim() || '#cccccc',
        displayName:  (row.DisplayName_TR || row.displayName_TR || row.Cat_TR || row.cat_tr || row.DisplayName || row.displayName || humanise(apiKey)).trim(),
        displayName_en: (row.DisplayName_EN || row.displayName_EN || row.DisplayName || row.displayName || humanise(apiKey)).trim(),
        icon:         (row.Icon || row.icon || 'tag').trim(),
        description:  (row.Description || row.description || '').trim(),
        order:        Number.isFinite(order) ? order : 999,
    };
}

function humanise(key) {
    return String(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Pull the categories tab (when configured). Returns a normalised
 * `{categories, defaultCategory}` record or null if not configured /
 * fetch failed.
 */
export async function fetchCategoriesFromSheets() {
    const sheets = config.venue?.sheets;
    if (!sheets?.sheetId) return null;
    const tab = pickTab(sheets, 'categories');
    if (!tab) return null;

    const rows = await fetchSheetTab(sheets.sheetId, tab);
    const categories = rows.map(rowToCategory).filter(Boolean)
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    return {
        categories,
        defaultCategory: { ...DEFAULT_CATEGORY },
        source: 'sheets',
    };
}

/**
 * Resolution order:
 *
 *   1. Editor preview override          (window.__previewAssets.categories)
 *   2. Live Sheets `categories` tab     (when configured)
 *   3. Cached previous-run snapshot     (localStorage CACHE_KEY)
 *   4. Local JSON file                  (legacy `category-mapping.json`)
 *   5. Empty fallback
 *
 * The cache step is what keeps the kiosk usable when the network is
 * flaky — last successful fetch wins until a fresh one arrives.
 */
export async function loadCategoryMapping() {
    const override = window.__previewAssets?.categories;
    if (override && Array.isArray(override.categories)) {
        dataStore.categoryMapping = {
            ...override,
            defaultCategory: override.defaultCategory || { ...DEFAULT_CATEGORY },
            source: 'preview',
        };
        console.log('✅ Category mapping loaded from editor preview:', dataStore.categoryMapping.categories.length);
        return dataStore.categoryMapping;
    }

    if (config.venue?.dataSource === 'sheets') {
        try {
            const fromSheet = await fetchCategoriesFromSheets();
            if (fromSheet?.categories?.length) {
                dataStore.categoryMapping = fromSheet;
                writeCache(fromSheet);
                console.log('✅ Category mapping loaded from Sheets:', fromSheet.categories.length);
                return dataStore.categoryMapping;
            }
        } catch (e) {
            console.warn('[categories] sheet fetch failed, will fall back', e);
        }
    }

    const cached = readCache();
    if (cached?.categories?.length) {
        dataStore.categoryMapping = { ...cached, source: 'cache' };
        console.log('✅ Category mapping loaded from cache:', cached.categories.length);
        return dataStore.categoryMapping;
    }

    if (config.venue?.categoryMappingFile) {
        try {
            const response = await fetch(config.venue.categoryMappingFile);
            if (response.ok) {
                const json = await response.json();
                dataStore.categoryMapping = {
                    categories: Array.isArray(json.categories) ? json.categories : [],
                    defaultCategory: json.defaultCategory || { ...DEFAULT_CATEGORY },
                    source: 'file',
                };
                console.log('✅ Category mapping loaded from JSON:', dataStore.categoryMapping.categories.length);
                return dataStore.categoryMapping;
            }
        } catch (e) {
            console.warn('[categories] local JSON fetch failed', e);
        }
    }

    /* Last-ditch fallback: a tiny built-in palette so the runtime is
     * still usable when both Sheets and the legacy JSON are missing.
     * Mostly relevant for fresh setups where the user hasn't wired up
     * a categories source yet. */
    dataStore.categoryMapping = {
        categories: BUILT_IN_FALLBACK_CATEGORIES.slice(),
        defaultCategory: { ...DEFAULT_CATEGORY },
        source: 'built-in',
    };
    return dataStore.categoryMapping;
}

/* Generic categories the kiosk can fall back on when no source is
 * configured. Intentionally short — meant as a "the app still works"
 * safety net, not a full venue palette. */
const BUILT_IN_FALLBACK_CATEGORIES = [
    { apiKey: 'fashion',         color: '#E74C3C', icon: 'shirt',          displayName: 'Moda',           order: 10 },
    { apiKey: 'food',            color: '#F39C12', icon: 'utensils',       displayName: 'Yiyecek',         order: 20 },
    { apiKey: 'restaurant_cafe', color: '#C0392B', icon: 'coffee',         displayName: 'Restoran & Kafe', order: 21 },
    { apiKey: 'electronics',     color: '#3498DB', icon: 'smartphone',     displayName: 'Elektronik',     order: 30 },
    { apiKey: 'cosmetics_health',color: '#FF6FAE', icon: 'sparkles',       displayName: 'Kozmetik',       order: 40 },
    { apiKey: 'services',        color: '#7F8C8D', icon: 'wrench',         displayName: 'Hizmetler',       order: 50 },
    { apiKey: 'wc',              color: '#94a3b8', icon: 'toilet',         displayName: 'Tuvalet',         order: 90 },
    { apiKey: 'parking',         color: '#64748b', icon: 'parking-square', displayName: 'Otopark',         order: 91 },
    { apiKey: 'atm',             color: '#475569', icon: 'landmark',       displayName: 'ATM',             order: 92 },
];

function writeCache(mapping) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            categories: mapping.categories,
            defaultCategory: mapping.defaultCategory,
            cachedAt: Date.now(),
        }));
    } catch { /* localStorage full / disabled — non-fatal */ }
}

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

/** Clear the local snapshot. Used by the editor when the user wants to
 *  force a fresh sheet pull. */
export function clearCategoriesCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch {}
}

export function getCategoryDisplayInfo(apiCategory) {
    const mapping = dataStore.categoryMapping;
    if (!mapping) {
        return { label: apiCategory, icon: 'map-pin', description: '' };
    }
    const cat = mapping.categories.find(c => c.apiKey === apiCategory);
    if (cat) {
        return { label: cat.displayName, icon: cat.icon, description: cat.description };
    }
    return {
        label: mapping.defaultCategory.displayName,
        icon: mapping.defaultCategory.icon,
        description: mapping.defaultCategory.description,
    };
}

export function getCategoryDisplayNames(apiCategories) {
    if (!Array.isArray(apiCategories)) return [];
    return apiCategories.map(cat => getCategoryDisplayInfo(cat).label);
}

export function getUniqueCategories(locations) {
    const cats = new Set();
    locations.forEach(loc => {
        if (loc.apiCategories && Array.isArray(loc.apiCategories)) {
            loc.apiCategories.forEach(c => cats.add(c));
        }
    });
    return Array.from(cats).sort();
}

/**
 * Returns only the category mapping entries that are actually used by the
 * currently loaded locations (venue-scoped). Preserves mapping order.
 */
export function getAvailableCategories() {
    const mapping = dataStore.categoryMapping;
    if (!mapping?.categories) return [];
    const locations = Array.isArray(dataStore.locations) ? dataStore.locations : [];
    if (locations.length === 0) return mapping.categories;

    const usedKeys = new Set();
    locations.forEach(loc => {
        (loc.apiCategories || []).forEach(k => usedKeys.add(k));
    });

    return mapping.categories.filter(c => usedKeys.has(c.apiKey));
}
