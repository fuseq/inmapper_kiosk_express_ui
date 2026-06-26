import { config } from '../../core/config.js';
import { eventBus } from '../../core/event-bus.js';
import { dataStore } from '../../core/state.js';
import { loadCategoryMapping, getUniqueCategories } from './category-service.js';
import { fetchLocationsFromAPI, fetchLocationsFromSheets, mapAPILocationToApp } from './location-service.js';

export async function loadLocations() {
    try {
        let locs;
        if (config.venue.dataSource === 'sheets') {
            locs = await fetchLocationsFromSheets();
        } else {
            const apiData = await fetchLocationsFromAPI();
            locs = apiData.map(mapAPILocationToApp).filter(Boolean);
        }
        dataStore.locations = locs;
        console.log(`✅ Loaded ${locs.length} locations`);

        const cats = getUniqueCategories(locs);
        eventBus.emit('categories:updated', cats);
        eventBus.emit('locations:loaded', locs);
        return locs;
    } catch (error) {
        console.error('❌ Error loading locations:', error);
        dataStore.locations = [];
        return [];
    }
}

export async function init() {
    await loadCategoryMapping();
    eventBus.emit('categories:loaded', dataStore.categoryMapping);
    await loadLocations();
}

/* Force a fresh re-fetch of categories — used by the editor "Yenile"
 * action and the Birimler tab's pull-to-refresh affordance. Returns the
 * new mapping so callers can update local UI immediately. */
export async function reloadCategories() {
    const m = await loadCategoryMapping();
    eventBus.emit('categories:loaded', m);
    return m;
}

export function destroy() {
    dataStore.locations = [];
    dataStore.categoryMapping = null;
    dataStore.apiData = null;
    dataStore.lastFetch = null;
}

export { getCategoryDisplayInfo, getCategoryDisplayNames, getUniqueCategories } from './category-service.js';
export { getLocationDisplayName } from '../../core/utils.js';
