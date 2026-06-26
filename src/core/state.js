import { eventBus } from './event-bus.js';

const _state = {
    currentView: 'initial',
    searchQuery: '',
    sidePanelSearchQuery: '',
    sideListSearchQuery: '',
    sideListCategory: 'all',
    sideListFloor: 'all',
    selectedCategory: 'all',
    selectedLocation: null,
    startPoint: null,
    endPoint: null,
    /* Which routing endpoint a map / list pick currently writes to. Defaults
     * to 'end' because the dominant interaction on every interface is
     * "select a destination / look at a unit"; map clicks land here. It only
     * flips to 'start' when the user explicitly enters a start-edit session
     * (kiosk-manual nav card, island directions pin button, etc.). Without
     * this default the first web map click is consumed as a start-point
     * write and detail never opens. */
    editingPoint: 'end',
    currentFloor: null,
    keyboardLanguage: 'tr',
    keyboardMode: 'letters',
    routeType: 'shortest',
    routeNavigationActive: false,
    /* Current mobile bottom-sheet mode (home|search|detail|directions|
     * navigation|assistant). Mirrored here so non-sheet modules (e.g. the
     * map click handler) can tell when a route is being configured and
     * avoid resetting the sheet. */
    mobileSheetMode: 'home',
    /* The active mobile route screen ('navigation' | 'assistant') while a route
     * is drawn. Lets the unit-detail view (opened by tapping a unit over a live
     * route) return to the right route screen instead of resetting home. */
    mobileRouteScreen: null,
    panelSide: 'right',
    sidePanelMode: 'preview',
    isEditMode: false,
    hasPendingEditChanges: false,
    selectedCategories: [],
    droppedPinMode: false,
    droppedPinCoord: null,
    droppedPinNodeKey: null,

    /* Editor "Birimler" tab özel modu. true iken harita tıklamaları
     * normal flow yerine parent window'a postMessage olarak yönlenir;
     * tüm chrome (home, search, side panel, back button) gizlidir.
     * Sadece runtime tarafında ?preview=1 ile çalışırken set edilir. */
    itemEditorMode: false,
};

const _data = {
    locations: [],
    floors: [],
    categoryMapping: null,
    apiData: null,
    lastFetch: null,
};

export const state = new Proxy(_state, {
    set(target, prop, value) {
        const old = target[prop];
        target[prop] = value;
        if (old !== value) {
            eventBus.emit(`state:${prop}`, { value, old });
        }
        return true;
    },
});

export const dataStore = {
    get locations() { return _data.locations; },
    set locations(v) {
        _data.locations = v;
        eventBus.emit('data:locations', v);
    },

    get floors() { return _data.floors; },
    set floors(v) {
        _data.floors = v;
        eventBus.emit('data:floors', v);
    },

    get categoryMapping() { return _data.categoryMapping; },
    set categoryMapping(v) {
        _data.categoryMapping = v;
        eventBus.emit('data:categoryMapping', v);
    },

    get apiData() { return _data.apiData; },
    set apiData(v) { _data.apiData = v; },

    get lastFetch() { return _data.lastFetch; },
    set lastFetch(v) { _data.lastFetch = v; },
};

export function resetState() {
    Object.assign(state, {
        currentView: 'initial',
        searchQuery: '',
        sidePanelSearchQuery: '',
        sideListSearchQuery: '',
        sideListCategory: 'all',
        sideListFloor: 'all',
        selectedCategory: 'all',
        selectedLocation: null,
        startPoint: null,
        endPoint: null,
        editingPoint: 'end',
        currentFloor: null,
        keyboardLanguage: 'tr',
        keyboardMode: 'letters',
        routeType: 'shortest',
        sidePanelMode: 'preview',
        isEditMode: false,
        hasPendingEditChanges: false,
        selectedCategories: [],
        droppedPinMode: false,
        droppedPinCoord: null,
        droppedPinNodeKey: null,
        itemEditorMode: false,
    });
}
