import { eventBus } from '../../core/event-bus.js';
import { state, dataStore } from '../../core/state.js';
import { config } from '../../core/config.js';
import { getLocationDisplayName } from '../../core/utils.js';
import { updateCategoryTabs, updateSidePanelCategoryTabs } from './category-tabs.js';
import { getUniqueCategories } from '../data/category-service.js';
import { iconHTML, renderIcons } from '../../core/icon.js';

function loadAllLocations() {
    let filtered = dataStore.locations;
    if (state.selectedCategory !== 'all') {
        filtered = filtered.filter(l => l.apiCategories && l.apiCategories.includes(state.selectedCategory));
    }
    if (state.currentFloor !== undefined && state.currentFloor !== null) {
        filtered = filtered.filter(l => l.floorKey === state.currentFloor.toString());
    }
    displayLocations(filtered);
}

function searchLocations(query) {
    let results = dataStore.locations;
    const cats = getUniqueCategories(dataStore.locations);

    if (query && query.trim()) {
        const q = query.toLowerCase();
        results = results.filter(l => l.name.toLowerCase().includes(q) || (l.subtitle && l.subtitle.toLowerCase().includes(q)));
        updateCategoryTabs(cats, query);
    } else {
        updateCategoryTabs(cats);
    }

    if (state.selectedCategory !== 'all') {
        results = results.filter(l => l.apiCategories && l.apiCategories.includes(state.selectedCategory));
    }
    if (state.currentFloor !== undefined && state.currentFloor !== null) {
        results = results.filter(l => l.floorKey === state.currentFloor.toString());
    }
    displayLocations(results);
}

function displayLocations(list) {
    const container = document.getElementById('tabResults');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary);"><div style="font-size:48px;margin-bottom:16px;">🔍</div><p style="font-size:16px;">Sonuç bulunamadı</p></div>';
        return;
    }

    container.innerHTML = list.map(loc => `
        <div class="location-item" data-id="${loc.id}">
            <div class="location-icon-wrapper">${loc.logo ? `<img src="${loc.logo}" alt="${getLocationDisplayName(loc)}">` : iconHTML(loc.icon, { size: 22 })}</div>
            <div class="location-info">
                <div class="location-name">${getLocationDisplayName(loc)}</div>
                <div class="location-details">${loc.category} • ${loc.floor}</div>
            </div>
            <svg class="location-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
    `).join('');
    renderIcons();

    container.querySelectorAll('.location-item').forEach(item => {
        item.addEventListener('click', () => {
            const loc = dataStore.locations.find(l => String(l.id) === String(item.dataset.id));
            if (!loc) return;

            if (state.editingPoint === 'start') {
                state.startPoint = loc;
                eventBus.emit('routePoint:updated', { point: 'start', location: loc });
            } else if (config.features.storeDetail?.enabled) {
                eventBus.emit('location:selected', { locationId: item.dataset.id, fromMap: false });
            } else {
                state.selectedLocation = loc;
                state.endPoint = loc;
                const isAuto = (config.features.navigation?.startPointMode || 'auto') === 'auto';
                if (!state.startPoint && isAuto) state.startPoint = config.venue.kioskLocation;
                eventBus.emit('routePoint:updated', { point: 'end', location: loc });
                eventBus.emit('navigation:directToMap', { locationId: item.dataset.id });
            }
        });
    });
}

function showSearchTab() {
    state.currentView = 'search';
    eventBus.emit('home:hideSlideshow');

    /* If the user reaches the trigger while the store-detail surface is
     * showing inside the search-tab, we want to fall back to the
     * regular search list — not stay stuck on the detail card. Emitting
     * `storeDetail:hide` is a no-op when the detail isn't currently
     * mounted, so it's safe to call unconditionally. */
    eventBus.emit('storeDetail:hide');
    state.selectedLocation = null;

    state.currentFloor = null;
    const floorName = document.getElementById('currentFloorName');
    if (floorName) floorName.textContent = 'Tüm Katlar';

    const floorSel = document.getElementById('floorSelectorCompact');
    const mapFloorSel = document.getElementById('mapFloorSelectorCompact');
    if (floorSel) floorSel.style.display = 'flex';
    if (mapFloorSel) mapFloorSel.style.display = 'none';

    const home = document.getElementById('initialHome');
    const searchTab = document.getElementById('searchTab');
    if (!home || !searchTab) return;

    home.classList.add('animating');
    setTimeout(() => { if (home) home.classList.add('search-mode'); }, 50);
    setTimeout(() => {
        // Clear any inline styles left over from a previous
        // transitionToMapView() so the tab can animate back in.
        searchTab.style.transition = '';
        searchTab.style.opacity = '';
        searchTab.style.visibility = '';
        searchTab.style.pointerEvents = '';
        searchTab.classList.add('open');
        loadAllLocations();
        eventBus.emit('search:opened');
        setTimeout(() => { if (home) home.classList.remove('animating'); }, 700);
    }, 100);
}

function hideSearchTab() {
    const home = document.getElementById('initialHome');
    const searchTab = document.getElementById('searchTab');
    if (!home || !searchTab) return;

    eventBus.emit('storeDetail:hide');
    searchTab.classList.remove('open');
    setTimeout(() => {
        home.classList.remove('search-mode');
        setTimeout(() => {
            home.classList.remove('animating');
            if (!state.selectedLocation) state.currentView = 'initial';
            eventBus.emit('search:closed');
        }, 700);
    }, 600);
}

function clearSearch() {
    state.searchQuery = '';
    const input = document.getElementById('tabSearchInput');
    const clearBtn = document.getElementById('tabClearBtn');
    if (input) input.value = '';
    if (clearBtn) clearBtn.classList.remove('visible');
    const cats = getUniqueCategories(dataStore.locations);
    updateCategoryTabs(cats);
    searchLocations('');
    eventBus.emit('search:cleared');
}

export function init() {
    eventBus.on('search:open', showSearchTab);
    eventBus.on('search:openWithCategory', (cat) => {
        showSearchTab();
        state.selectedCategory = cat;
        loadAllLocations();
    });

    eventBus.on('keyboard:input', ({ query }) => searchLocations(query));
    eventBus.on('category:changed', () => searchLocations(state.searchQuery));
    eventBus.on('floor:changed', () => {
        if (state.currentView === 'search') loadAllLocations();
    });

    eventBus.on('categories:updated', (cats) => {
        updateCategoryTabs(cats);
        updateSidePanelCategoryTabs(cats);
    });

    /* `data` feature loads FIRST (see feature-loader.js LOAD_ORDER) and
     * its init() awaits both the category mapping fetch and the
     * locations fetch — so by the time we get here, `categories:updated`
     * has already fired and our listener above won't replay it. Without
     * this immediate sync the kiosk search-tab keeps showing the
     * hardcoded default chips from index.html (Alışveriş / Yeme-İçme /
     * Kafe …) instead of the venue's actual categories. Side-panel
     * (web) and bottom-sheet (mobile) don't hit this race because they
     * re-read dataStore on every render. */
    const cats = getUniqueCategories(dataStore.locations || []);
    updateCategoryTabs(cats);
    updateSidePanelCategoryTabs(cats);

    const tabBackBtn = document.getElementById('tabBackBtn');
    if (tabBackBtn) tabBackBtn.addEventListener('click', hideSearchTab);

    const clearBtn = document.getElementById('tabClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', clearSearch);

    eventBus.on('idle:timeout', () => {
        state.searchQuery = '';
        state.selectedCategory = 'all';
    });
}

export function destroy() {}

export { loadAllLocations, searchLocations, showSearchTab, hideSearchTab };
