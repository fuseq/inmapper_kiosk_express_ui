import { config } from '../../core/config.js';
import { dataStore } from '../../core/state.js';
import { getCategoryDisplayInfo } from './category-service.js';
import { fetchSheetTab, pickTab } from '../../core/sheets.js';
import { parseImages, parseRelated, parseStructuredHours } from './location-fields.js';

export async function fetchLocationsFromAPI() {
    const now = Date.now();
    if (dataStore.apiData && dataStore.lastFetch && (now - dataStore.lastFetch < config.venue.cacheDuration)) {
        return dataStore.apiData;
    }

    const response = await fetch(config.venue.api.baseUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    console.log(`✅ Fetched ${data.length} locations from API`);
    dataStore.apiData = data;
    dataStore.lastFetch = now;
    return data;
}

export async function fetchLocationsFromSheets() {
    const now = Date.now();
    if (dataStore.apiData && dataStore.lastFetch && (now - dataStore.lastFetch < config.venue.cacheDuration)) {
        return dataStore.apiData;
    }

    const sheets = config.venue.sheets;
    const tab = pickTab(sheets, 'list', 'gid');
    if (!sheets?.sheetId || !tab) throw new Error('venue.sheets: sheetId/tabs.list missing');

    const rows = await fetchSheetTab(sheets.sheetId, tab);
    console.log(`✅ Fetched ${rows.length} rows from "${tab}"`);

    const localPatches = readLocalPatches();
    const mapped = rows.map(row => mapSheetLocationToApp(row, localPatches)).filter(Boolean);
    dataStore.apiData = mapped;
    dataStore.lastFetch = now;
    return mapped;
}

/* Pull pending local edits saved by the editor (in `kv:itemEdits`).
 * They live in IndexedDB but the runtime needs them synchronously, so
 * the editor mirrors the map into localStorage on every change. */
function readLocalPatches() {
    try {
        const raw = localStorage.getItem('kiosk:itemEdits');
        if (!raw) return {};
        const obj = JSON.parse(raw);
        return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
}

function mapSheetLocationToApp(row, patches = {}) {
    const id = (row.ID || row.id || '').trim();
    if (!id) return null;
    // Apply any local pending patch on top of the sheet row.
    const patched = patches[id] ? { ...row, ...patches[id].patch } : row;
    if (!patched.Title) return null;

    const rawCategories = (patched.Category || 'other')
        .split(',').map(c => c.trim()).filter(c => c.length > 0);

    /* The sheet's first category is the canonical "primary" — but we
     * keep a short hard-coded preference list so legacy keys (7de7/food/
     * shop) still map predictably. New venues: the first entry wins. */
    const primaryCategory = patches[id]?.primaryCategory
        || (rawCategories.includes('7de7') ? '7de7'
            : rawCategories.includes('food') ? 'food'
            : rawCategories.includes('shop') ? 'shop'
            : rawCategories[0]);

    const categoryInfo = getCategoryDisplayInfo(primaryCategory);
    let type = primaryCategory;
    let icon = categoryInfo.icon;
    let category = categoryInfo.label;

    const titleLower = patched.Title.toLowerCase();
    if (titleLower.includes('tuvalet') || titleLower.includes('wc')) {
        type = 'wc'; icon = 'toilet'; category = 'Tuvalet';
    } else if (titleLower.includes('otopark') || titleLower.includes('carpark')) {
        type = 'parking'; icon = 'parking-square'; category = 'Otopark';
    } else if (titleLower.includes('atm')) {
        type = 'atm'; icon = 'landmark'; category = 'ATM';
    }

    const floorMap = config.venue.floorMap;
    const floorKey = (patched.Floor || '0').toString();
    const floor = floorMap[floorKey] || floorKey;

    const hoursRaw = patched.Hours || '';
    return {
        id, name: patched.Title, subtitle: patched.Subtitle || '',
        category, floor, floorKey, type, icon,
        hours: hoursRaw,
        hoursStructured: parseStructuredHours(hoursRaw),
        telephone: patched.Phone || patched.Telephone || null,
        description: patched.Description || null,
        web: patched.Web || null,
        logo: patched.Logo || null,
        logoName: patched.LogoName || null,
        images: parseImages(patched.Images),
        related: parseRelated(patched.Related),
        xID: patched.xID || null,
        apiCategories: rawCategories,
        primaryCategory,
        _hasLocalPatch: !!patches[id],
    };
}

export function mapAPILocationToApp(apiLocation) {
    if (!apiLocation.title || !apiLocation.category) return null;

    const apiCategories = apiLocation.category
        .split(',').map(c => c.trim()).filter(c => c.length > 0);

    const primaryCategory = apiCategories[0];
    const categoryInfo = getCategoryDisplayInfo(primaryCategory);
    let type = primaryCategory;
    let icon = categoryInfo.icon;
    let category = categoryInfo.label;

    const tl = apiLocation.title.toLowerCase();
    if (tl.includes('tuvalet') || tl.includes('wc')) {
        type = 'wc'; icon = 'toilet'; category = 'Tuvalet';
    } else if (tl.includes('otopark') || tl.includes('carpark')) {
        type = 'parking'; icon = 'parking-square'; category = 'Otopark';
    } else if (tl.includes('atm')) {
        type = 'atm'; icon = 'landmark'; category = 'ATM';
    } else if (primaryCategory === 'restaurant_cafe') {
        if (tl.includes('coffee') || tl.includes('kahve') || tl.includes('starbucks') || tl.includes('café')) {
            type = 'coffee'; icon = 'coffee'; category = 'Kafe';
        }
    }

    const floorMap = config.venue.floorMap;
    const floorKey = apiLocation.floor.toString();
    const floor = floorMap[floorKey] || floorKey;

    let hours = 'Mon-Sun • 10:00-22:00';
    if (type === 'wc' || type === 'parking' || type === 'atm') {
        hours = 'Every Day • Open 24 Hours';
    }

    return {
        id: apiLocation.id, name: apiLocation.title, subtitle: apiLocation.subtitle,
        category, floor, floorKey, type, icon, hours,
        hoursStructured: parseStructuredHours(apiLocation.hours),
        telephone: apiLocation.telephone !== '-' ? apiLocation.telephone : null,
        web: apiLocation.web || null, logo: apiLocation.logo || null,
        images: parseImages(apiLocation.images),
        related: parseRelated(apiLocation.related),
        apiCategories,
        primaryCategory,
    };
}
