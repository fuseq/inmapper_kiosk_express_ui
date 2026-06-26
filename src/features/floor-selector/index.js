import { eventBus } from '../../core/event-bus.js';
import { state, dataStore } from '../../core/state.js';
import { config } from '../../core/config.js';
import { mapRenderer } from '../map/map-renderer.js';

let floors = [];

function getFloorDisplayName(floorKey) {
    return config.venue.floorMap?.[floorKey] || floorKey;
}

/**
 * The set of floors the venue actually contains is the union of:
 *   1. `config.venue.floorMap` keys (manually curated names)
 *   2. floors discovered in API/locations data (`loc.floor`)
 *   3. floors present in the GeoJSON (`feature.properties.floor`)
 *
 * The third source matters for venues whose location list is partial or
 * still loading — we still want the floor selector populated as soon as
 * the map has rendered.
 */
function collectFloorKeys() {
    const set = new Set();
    const floorMap = config.venue?.floorMap || {};
    Object.keys(floorMap).forEach(k => set.add(String(k)));
    if (Array.isArray(dataStore.apiData)) {
        dataStore.apiData.forEach(loc => {
            // Prefer `floorKey` ('0', '1', …) over the human-readable
            // `floor` ('Zemin Kat'). Otherwise the dropdown ends up with
            // duplicate rows: one for '0' (resolved via floorMap → 'Zemin
            // Kat') and one for the literal 'Zemin Kat' string that has
            // no floorMap entry and falls back to itself.
            const fk = (loc.floorKey ?? loc.floor ?? '').toString();
            if (fk !== '') set.add(fk);
        });
    }
    const gj = mapRenderer.geojsonData;
    if (gj?.features) {
        for (const f of gj.features) {
            const fk = f.properties?.floor;
            if (fk != null && fk !== '') set.add(String(fk));
        }
    }
    return Array.from(set).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
}

/**
 * Each instance of the floor selector lives at a different DOM tree:
 *   - `floorSelectorCompact`     — search page header
 *   - `mapFloorSelectorCompact`  — map view (bottom-right floating)
 *
 * The search instance uses `floor-dropdown-item` styling; the map
 * instance has its own `map-floor-dropdown-item` class because of
 * layout differences.
 */
const SELECTOR_INSTANCES = [
    {
        rootId: 'floorSelectorCompact',
        dropdownId: 'floorDropdown',
        itemClass: 'floor-dropdown-item',
        labelClass: 'floor-label',
    },
    {
        rootId: 'mapFloorSelectorCompact',
        dropdownId: 'mapFloorDropdown',
        itemClass: 'map-floor-dropdown-item',
        labelClass: 'map-floor-label',
    },
];

function updateFloorDropdown(dropdownId, itemClass, labelClass, floorKeys) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const inst = SELECTOR_INSTANCES.find(s => s.dropdownId === dropdownId);
    const rootId = inst?.rootId;
    dropdown.innerHTML = '';

    const allItem = document.createElement('div');
    allItem.className = itemClass;
    allItem.dataset.floor = 'all';
    if (state.currentFloor === null || state.currentFloor === undefined) allItem.classList.add('active');

    const allLabel = document.createElement('span');
    allLabel.className = labelClass;
    allLabel.textContent = 'Tüm Katlar';
    allItem.addEventListener('click', (e) => { e.stopPropagation(); changeFloor(null); closeDropdownById(rootId); });
    allItem.appendChild(allLabel);
    dropdown.appendChild(allItem);

    floorKeys.forEach(fk => {
        const item = document.createElement('div');
        item.className = itemClass;
        item.dataset.floor = fk;
        if (state.currentFloor !== null && fk === String(state.currentFloor)) item.classList.add('active');

        const lbl = document.createElement('span');
        lbl.className = labelClass;
        lbl.textContent = getFloorDisplayName(fk);
        item.addEventListener('click', (e) => { e.stopPropagation(); changeFloor(parseFloorKey(fk)); closeDropdownById(rootId); });
        item.appendChild(lbl);
        dropdown.appendChild(item);
    });
}

function parseFloorKey(fk) {
    const n = parseInt(fk, 10);
    return Number.isFinite(n) ? n : fk;
}

export function changeFloor(floorId) {
    state.currentFloor = floorId;
    const displayName = floorId !== null && floorId !== undefined
        ? getFloorDisplayName(String(floorId))
        : 'Tüm Katlar';
    refreshFloorUi(floorId, displayName);
    eventBus.emit('floor:changed', { floorId, displayName });
}

/** Update compact + map floor labels and dropdown active state. */
export function refreshFloorUi(floorId, displayName) {
    const name = displayName != null
        ? displayName
        : (floorId != null ? getFloorDisplayName(String(floorId)) : 'Tüm Katlar');

    ['currentFloorName', 'mapCurrentFloorName'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = name;
    });

    SELECTOR_INSTANCES.forEach(({ dropdownId, itemClass }) => {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        dropdown.querySelectorAll(`.${itemClass}`).forEach(item => {
            const fk = item.dataset.floor;
            const active = fk === 'all'
                ? (floorId == null || floorId === undefined)
                : String(fk) === String(floorId);
            item.classList.toggle('active', active);
        });
    });
}

function closeDropdownById(rootId) {
    if (!rootId) return;
    const el = document.getElementById(rootId);
    if (el) el.classList.remove('open');
}

function closeAllDropdowns() {
    SELECTOR_INSTANCES.forEach(s => closeDropdownById(s.rootId));
}

function toggleDropdownById(rootId) {
    if (!rootId) return;
    const el = document.getElementById(rootId);
    if (el) el.classList.toggle('open');
}

function updateDropdowns() {
    const uniqueFloors = collectFloorKeys();
    const singleFloor = uniqueFloors.length <= 1;

    /* Visibility ownership:
     *
     * Whether the selector is *positionally* visible (home vs search vs
     * map view) is owned by the view modules (prepareDirectMapView, the
     * search/home/side-panel handlers …). Each of those flips the inline
     * `display` style as the user moves between views. The single-floor
     * "no point in showing it" decision is owned here.
     *
     * We only manipulate the `.hidden` class — `.hidden { display:none
     * !important }` cleanly overrides the view modules' inline style
     * when there's only one floor, and removing it restores their
     * choice when multi-floor reappears. We deliberately do NOT touch
     * `el.style.display` because that would clobber, for example,
     * `.map-floor-selector-compact`'s `display:none` CSS default which
     * the view modules toggle to `flex` on map entry. */
    SELECTOR_INSTANCES.forEach(({ rootId }) => {
        const el = document.getElementById(rootId);
        if (!el) return;
        if (singleFloor) el.classList.add('hidden');
        else             el.classList.remove('hidden');
    });

    if (uniqueFloors.length === 0) return;

    floors = uniqueFloors.map(fk => ({
        id: parseFloorKey(fk),
        name: getFloorDisplayName(fk),
        number: fk,
    }));
    dataStore.floors = floors;

    SELECTOR_INSTANCES.forEach(({ dropdownId, itemClass, labelClass }) => {
        updateFloorDropdown(dropdownId, itemClass, labelClass, uniqueFloors);
    });
}

function goNext() {
    if (floors.length === 0) return;
    const idx = floors.findIndex(f => String(f.id) === String(state.currentFloor));
    if (idx > 0) changeFloor(floors[idx - 1].id);
}

function goPrev() {
    if (floors.length === 0) return;
    const idx = floors.findIndex(f => String(f.id) === String(state.currentFloor));
    if (idx < floors.length - 1) changeFloor(floors[idx + 1].id);
}

function getDefaultFloor() {
    const cfg = config.venue?.defaultFloor;
    if (cfg !== undefined && cfg !== null && String(cfg) !== '') return parseFloorKey(String(cfg));
    const keys = Object.keys(config.venue?.floorMap || {});
    if (keys.length) return parseFloorKey(keys[0]);
    return 0;
}

export function init() {
    eventBus.on('locations:loaded', updateDropdowns);
    eventBus.on('geojson:loaded', updateDropdowns);

    /**
     * Wire all three selector instances. The display button opens its
     * own dropdown; the up/down arrows are shared semantics.
     */
    const wireInstance = (rootId, upId, downId, displayId) => {
        const up = document.getElementById(upId);
        const down = document.getElementById(downId);
        const display = document.getElementById(displayId);
        if (up) up.addEventListener('click', goNext);
        if (down) down.addEventListener('click', goPrev);
        if (display) display.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close every other dropdown first so the user only ever
            // sees one open menu at a time.
            SELECTOR_INSTANCES.forEach(s => {
                if (s.rootId !== rootId) closeDropdownById(s.rootId);
            });
            toggleDropdownById(rootId);
        });
    };
    wireInstance('floorSelectorCompact',    'floorUpBtn',    'floorDownBtn',    'floorDisplayBtn');
    wireInstance('mapFloorSelectorCompact', 'mapFloorUpBtn', 'mapFloorDownBtn', 'mapFloorDisplayBtn');

    document.addEventListener('click', () => { closeAllDropdowns(); });

    eventBus.on('idle:timeout', () => {
        if (state.routeNavigationActive) return;
        changeFloor(getDefaultFloor());
    });

    changeFloor(getDefaultFloor());
    updateDropdowns();

    const mapFloorSelector = document.getElementById('mapFloorSelectorCompact');
    if (mapFloorSelector && config.initialView === 'mobile') {
        mapFloorSelector.classList.add('hidden');
    }
}

export function destroy() {
    floors = [];
}
