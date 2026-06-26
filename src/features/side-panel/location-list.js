import { state, dataStore } from '../../core/state.js';
import { eventBus } from '../../core/event-bus.js';
import { config } from '../../core/config.js';
import { getLocationDisplayName } from '../../core/utils.js';
import { iconHTML, renderIcons } from '../../core/icon.js';
import { refreshSidePanelCatsHint } from '../search/category-tabs.js';

function $$(id) { return document.getElementById(id); }

function loadLocations() {
    let filtered = dataStore.locations;

    if (state.sideListCategory !== 'all') {
        filtered = filtered.filter(l => l.apiCategories && l.apiCategories.includes(state.sideListCategory));
    }
    if (state.sideListFloor && state.sideListFloor !== 'all') {
        filtered = filtered.filter(l => String(l.floor) === String(state.sideListFloor));
    }
    if (state.sideListSearchQuery && state.sideListSearchQuery.trim()) {
        const q = state.sideListSearchQuery.toLowerCase();
        filtered = filtered.filter(l => l.name.toLowerCase().includes(q));
    }

    displayLocations(filtered);
}

/* Wire the panel search input → live list filtering (once). */
function bindSearchInput() {
    const input = $$('sidePanelSearchInput');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    let deb = null;
    input.addEventListener('input', () => {
        clearTimeout(deb);
        deb = setTimeout(() => {
            state.sideListSearchQuery = input.value.trim();
            loadLocations();
        }, 150);
    });
}

/* Ordered list of floors actually present in the data (upper floors first
 * per floorMap), prefixed with the "Tüm Katlar" option. */
function getFloorOptions() {
    const present = new Set();
    (dataStore.locations || []).forEach(l => { if (l.floor) present.add(String(l.floor)); });

    const floorMap = config.venue?.floorMap || {};
    const ordered = [];
    Object.entries(floorMap)
        .sort((a, b) => parseInt(b[0], 10) - parseInt(a[0], 10))
        .forEach(([, name]) => {
            const n = String(name);
            if (present.has(n)) { ordered.push(n); present.delete(n); }
        });
    [...present].forEach(f => ordered.push(f));

    return [{ value: 'all', label: 'Tüm Katlar' }, ...ordered.map(f => ({ value: f, label: f }))];
}

function closeFloorMenu() {
    const wrap = $$('sideListFloorWrap');
    const trigger = $$('sideListFloorTrigger');
    if (wrap) wrap.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onFloorOutsideClick, true);
}

function openFloorMenu() {
    const wrap = $$('sideListFloorWrap');
    const trigger = $$('sideListFloorTrigger');
    if (!wrap) return;
    wrap.classList.add('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onFloorOutsideClick, true);
}

function onFloorOutsideClick(e) {
    const wrap = $$('sideListFloorWrap');
    if (wrap && !wrap.contains(e.target)) closeFloorMenu();
}

function selectFloor(value, label) {
    state.sideListFloor = value;
    const labelEl = $$('sideListFloorLabel');
    if (labelEl) labelEl.textContent = label;
    const menu = $$('sideListFloorMenu');
    if (menu) {
        menu.querySelectorAll('.side-list-floor-option').forEach(o =>
            o.classList.toggle('active', o.dataset.value === value),
        );
    }
    closeFloorMenu();
    loadLocations();
}

/* Build the custom floor dropdown (native <select> popups can't be themed). */
function populateFloorSelect() {
    const trigger = $$('sideListFloorTrigger');
    const menu = $$('sideListFloorMenu');
    const labelEl = $$('sideListFloorLabel');
    if (!trigger || !menu) return;

    const options = getFloorOptions();
    const values = options.map(o => o.value);
    const cur = values.includes(state.sideListFloor) ? state.sideListFloor : 'all';
    state.sideListFloor = cur;

    const curLabel = options.find(o => o.value === cur)?.label || 'Tüm Katlar';
    if (labelEl) labelEl.textContent = curLabel;

    menu.innerHTML = options.map(o =>
        `<div class="side-list-floor-option ${o.value === cur ? 'active' : ''}" role="option" data-value="${o.value}">${o.label}</div>`,
    ).join('');

    menu.querySelectorAll('.side-list-floor-option').forEach(opt => {
        opt.addEventListener('click', () => selectFloor(opt.dataset.value, opt.textContent));
    });

    if (!trigger.dataset.bound) {
        trigger.dataset.bound = '1';
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const wrap = $$('sideListFloorWrap');
            if (wrap?.classList.contains('open')) closeFloorMenu();
            else openFloorMenu();
        });
    }
}

function displayLocations(list) {
    const container = $$('sideListResults');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = '<div class="side-list-no-results"><div class="side-list-no-results-icon">🔍</div><p class="side-list-no-results-text">Sonuç bulunamadı</p></div>';
        return;
    }

    container.innerHTML = list.map(loc => `
        <div class="side-list-location-item" data-id="${loc.id}">
            <div class="side-list-location-icon">${loc.logo ? `<img src="${loc.logo}" alt="${getLocationDisplayName(loc)}" style="width:100%;height:100%;object-fit:contain;">` : iconHTML(loc.icon || 'map-pin', { size: 22 })}</div>
            <div class="side-list-location-info">
                <div class="side-list-location-name">${getLocationDisplayName(loc)}</div>
                <div class="side-list-location-details">${loc.category} • ${loc.floor}</div>
            </div>
            <svg class="side-list-location-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
    `).join('');
    renderIcons();

    container.querySelectorAll('.side-list-location-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const loc = dataStore.locations.find(l => String(l.id) === String(item.dataset.id));
            if (!loc) return;

            if (state.editingPoint === 'start') {
                state.startPoint = loc;
                state.editingPoint = 'end';
                eventBus.emit('routePoint:updated', { point: 'start', location: loc });

                container.querySelectorAll('.side-list-location-item.selected-start')
                    .forEach(el => el.classList.remove('selected-start'));
                item.classList.add('selected-start');

                const searchInput = $$('sidePanelSearchInput');
                if (searchInput) {
                    searchInput.placeholder = 'Hedef ara...';
                    searchInput.value = '';
                }
                state.sideListSearchQuery = '';
                loadLocations();
            } else {
                state.selectedLocation = loc;
                state.endPoint = loc;
                eventBus.emit('routePoint:updated', { point: 'end', location: loc });
                hideList();
                const ph = $$('sidePanelSearchPlaceholder');
                if (ph) ph.textContent = loc.name;
                eventBus.emit('sidePanel:showPreviewMode', loc);
            }
        });
    });
}

export function showList() {
    const detailView = $$('sideStoreDetailView');
    const routeMode = $$('sideRouteInfoMode');
    const previewMode = $$('sideStorePreviewMode');
    const listView = $$('sideLocationListView');
    const searchInput = $$('sidePanelSearchInput');
    const searchPlaceholder = $$('sidePanelSearchPlaceholder');

    if (detailView) detailView.classList.add('hidden');
    if (routeMode) routeMode.classList.add('hidden');
    if (previewMode) previewMode.classList.remove('hidden');
    if (listView) listView.classList.remove('hidden');
    if (searchInput) { searchInput.style.display = 'block'; searchInput.focus(); }
    if (searchPlaceholder) searchPlaceholder.style.display = 'none';

    bindSearchInput();
    const floorWrap = $$('sideListFloorWrap');
    if (floorWrap) floorWrap.classList.remove('hidden');

    const isManual = (config.features.navigation?.startPointMode || 'auto') === 'manual';
    if (isManual && searchInput) {
        if (state.editingPoint === 'start') {
            searchInput.placeholder = 'Başlangıç noktası ara...';
        } else {
            searchInput.placeholder = 'Hedef ara...';
        }
    }

    populateFloorSelect();
    setTimeout(loadLocations, 0);
    requestAnimationFrame(refreshSidePanelCatsHint);
}

export function hideList() {
    const listView = $$('sideLocationListView');
    const searchInput = $$('sidePanelSearchInput');
    const searchPlaceholder = $$('sidePanelSearchPlaceholder');

    if (listView) listView.classList.add('hidden');

    if (state.sidePanelMode === 'route') {
        const routeMode = $$('sideRouteInfoMode');
        const previewMode = $$('sideStorePreviewMode');
        if (routeMode) routeMode.classList.remove('hidden');
        if (previewMode) previewMode.classList.add('hidden');
    } else {
        const previewMode = $$('sideStorePreviewMode');
        const detailView = $$('sideStoreDetailView');
        if (previewMode) previewMode.classList.remove('hidden');
        if (detailView) {
            if (state.endPoint) {
                detailView.classList.remove('hidden');
            } else {
                detailView.classList.add('hidden');
            }
        }
    }

    if (searchInput) { searchInput.style.display = 'none'; searchInput.value = ''; }
    if (searchPlaceholder) searchPlaceholder.style.display = 'block';

    closeFloorMenu();
    const floorWrap = $$('sideListFloorWrap');
    if (floorWrap) floorWrap.classList.add('hidden');

    state.sideListSearchQuery = '';
    state.sideListCategory = 'all';
    state.sideListFloor = 'all';
}

eventBus.on('search:filter', () => {
    const tabs = document.querySelectorAll('.side-list-category-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === state.sideListCategory);
    });
    loadLocations();
});

export { loadLocations };
