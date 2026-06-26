import { eventBus } from '../../core/event-bus.js';
import { state, dataStore } from '../../core/state.js';
import { config } from '../../core/config.js';
import { updateStoreInfo } from './store-preview.js';
import { showRouteInfoMode, generateQRCode, updateRoutePointsUI, editStartPoint, editEndPoint } from './route-info.js';
import { showList as showLocationList, hideList as hideLocationList } from './location-list.js';
import { toggleEditMode, exitEditMode } from './edit-mode.js';
import { featureLoader } from '../../core/feature-loader.js';
import { isIslandLayout } from '../../app.js';
import { initIslandContent } from './island-content.js';

function $$(id) { return document.getElementById(id); }

function showPreviewMode(location) {
    state.sidePanelMode = 'preview';
    state.isEditMode = false;
    exitEditMode();

    const detailView = $$('sideStoreDetailView');
    const listView = $$('sideLocationListView');
    const previewMode = $$('sideStorePreviewMode');
    const routeMode = $$('sideRouteInfoMode');

    if (location) {
        updateStoreInfo(location);
        if (detailView) detailView.classList.remove('hidden');
    } else {
        if (detailView) detailView.classList.add('hidden');
    }

    if (listView) listView.classList.add('hidden');
    if (previewMode) previewMode.classList.remove('hidden');
    if (routeMode) routeMode.classList.add('hidden');

    updateRoutePointsSummary();
}

function togglePanelSide() {
    state.panelSide = state.panelSide === 'left' ? 'right' : 'left';
    const panel = $$('mapSidePanel');
    const mapContainer = $$('mapContainer');

    const method = state.panelSide === 'right' ? 'add' : 'remove';
    if (panel) panel.classList[method]('panel-right');
    if (mapContainer) mapContainer.classList[method]('panel-right');
}

function isAutoStart() {
    return (config.features.navigation?.startPointMode || 'auto') === 'auto';
}

function isPinEnabled() {
    return config.features.navigation?.droppedPin?.enabled === true;
}

function updateRoutePointsSummary() {
    const card = $$('sideRoutePointsSummary');
    if (!card) return;

    if (isAutoStart()) {
        card.classList.add('hidden');
        return;
    }

    card.classList.remove('hidden');

    const startRow = $$('summaryStartRow');
    const endRow = $$('summaryEndRow');
    const startName = $$('summaryStartName');
    const endName = $$('summaryEndName');
    const startFloor = $$('summaryStartFloor');
    const endFloor = $$('summaryEndFloor');
    const pinBtn = $$('summaryDropPinBtn');

    if (startRow) {
        startRow.classList.remove('pending', 'selected', 'active-pick', 'pinned');
        if (state.editingPoint === 'start') {
            startRow.classList.add('active-pick');
            if (state.startPoint?.isPinned) startRow.classList.add('pinned');
            else if (state.startPoint) startRow.classList.add('selected');
        } else if (state.startPoint?.isPinned) {
            startRow.classList.add('pinned', 'selected');
        } else if (state.startPoint) {
            startRow.classList.add('selected');
        } else {
            startRow.classList.add('pending');
        }
    }
    if (startName) {
        startName.textContent = state.startPoint ? state.startPoint.name : 'Başlangıç noktası seçin';
    }
    if (startFloor) {
        startFloor.textContent = state.startPoint?.floor || '';
    }

    if (pinBtn) {
        const showPin = isPinEnabled() && !isAutoStart() && !state.startPoint?.isPinned;
        pinBtn.classList.toggle('hidden', !showPin);
    }

    if (endRow) {
        endRow.classList.remove('pending', 'selected', 'active-pick');
        if (state.editingPoint === 'end') {
            endRow.classList.add('active-pick');
            if (state.endPoint) endRow.classList.add('selected');
        } else if (state.endPoint) {
            endRow.classList.add('selected');
        } else {
            endRow.classList.add('pending');
        }
    }
    if (endName) {
        endName.textContent = state.endPoint ? state.endPoint.name : 'Hedef noktası seçin';
    }
    if (endFloor) {
        endFloor.textContent = state.endPoint?.floor || '';
    }
}

function activatePinMode() {
    if (!isPinEnabled()) return;
    state.editingPoint = 'start';
    eventBus.emit('pin:activate');
    updateRoutePointsSummary();
}

function transitionToMapView() {
    if (!state.startPoint && isAutoStart()) state.startPoint = config.venue.kioskLocation;

    const slideshow = document.getElementById('homeMiniSlideshow');
    if (slideshow) slideshow.classList.add('hidden');

    const home = $$('initialHome');
    const searchTab = $$('searchTab');
    const panel = $$('mapSidePanel');
    const mapContainer = $$('mapContainer');
    const mapFloorSel = $$('mapFloorSelectorCompact');
    const detailContent = $$('storeDetailContent');
    const searchContent = $$('searchContent');

    if (!home || !searchTab) return;

    // Immediately collapse the search tab and any store detail overlay so
    // the map behind becomes the foreground. Using opacity + pointer-events
    // here is more reliable than relying solely on the `.closing` CSS
    // transition, which occasionally leaves the overlay stuck on top.
    searchTab.classList.add('closing');
    searchTab.classList.remove('open');
    searchTab.style.transition = 'opacity 0.25s ease, transform 0.3s ease';
    searchTab.style.opacity = '0';
    searchTab.style.pointerEvents = 'none';

    if (detailContent) {
        detailContent.classList.add('hidden');
        detailContent.classList.remove('active');
    }
    if (searchContent) searchContent.classList.remove('hidden');

    setTimeout(() => {
        home.style.transition = 'none';
        home.style.opacity = '0';
        home.style.visibility = 'hidden';
        home.style.pointerEvents = 'none';
        home.classList.remove('search-mode', 'animating');
        searchTab.classList.remove('closing');
        searchTab.style.visibility = 'hidden';

        showPreviewMode(state.endPoint || null);

        const placeholder = $$('sidePanelSearchPlaceholder');
        if (placeholder) placeholder.textContent = state.endPoint ? state.endPoint.name : 'Nereye gitmek istersiniz?';

        if (!isAutoStart() && !state.endPoint) {
            setTimeout(() => showLocationList(), 50);
        }

        if (panel) panel.classList.remove('hidden');
        if (!isIslandLayout() && mapContainer) {
            const cls = state.panelSide === 'right' ? 'panel-visible-right' : 'panel-visible-left';
            mapContainer.classList.add(cls);
        }

        state.currentView = 'map';
        if (mapFloorSel) mapFloorSel.style.display = 'flex';

        const mapMod = featureLoader.getModule('map');
        if (mapMod) {
            const { mapRenderer } = mapMod;
            if (mapRenderer.mainMap) {
                setTimeout(() => { mapRenderer.mainMap.resize(); mapRenderer.fitToAll(mapRenderer.mainMap); }, 100);
            }
        }
    }, 350);
}

function openPanel() {
    if (isIslandLayout()) return;
    const panel = $$('mapSidePanel');
    const mapContainer = $$('mapContainer');
    if (panel) panel.classList.add('expanded');
    if (mapContainer) mapContainer.classList.add('panel-expanded');
}

function closePanel() {
    if (isIslandLayout()) return;
    const panel = $$('mapSidePanel');
    const mapContainer = $$('mapContainer');
    if (panel) panel.classList.remove('expanded');
    if (mapContainer) mapContainer.classList.remove('panel-expanded');
}

export function init() {
    if (isIslandLayout()) {
        const panel = $$('mapSidePanel');
        if (panel) initIslandContent(panel);
        return;
    }

    eventBus.on('navigation:startRoute', () => {
        transitionToMapView();
        setTimeout(() => showRouteInfoMode(), 1200);
    });

    eventBus.on('navigation:directToMap', (payload) => {
        transitionToMapView();
        if (payload?.locationId) {
            const delay = 300 + 650 + 150;
            setTimeout(() => {
                eventBus.emit('location:selected', { locationId: payload.locationId });
            }, delay);
        }
    });

    eventBus.on('sidePanel:showPreviewMode', (location) => showPreviewMode(location));
    eventBus.on('sidePanel:showRouteMode', () => showRouteInfoMode());
    eventBus.on('sidePanel:showLocationList', () => {
        updateRoutePointsSummary();
        showLocationList();
    });

    /* "Harita — Varsayılan" — the canonical map view used when the user
     * is just browsing the map. Side panel + floor selector visible,
     * back button hidden. This is what web boots into and what the
     * editor's "Harita — Varsayılan" scene drives. */
    eventBus.on('map:default', () => {
        if (!state.startPoint && isAutoStart()) state.startPoint = config.venue.kioskLocation;

        const home = $$('initialHome');
        const slideshow = document.getElementById('homeMiniSlideshow');
        const panel = $$('mapSidePanel');
        const mapContainer = $$('mapContainer');
        const mapFloorSel = $$('mapFloorSelectorCompact');
        const searchTab = $$('searchTab');
        const backBtn = $$('mapBackBtn');

        if (home) {
            home.style.opacity = '0';
            home.style.visibility = 'hidden';
            home.style.pointerEvents = 'none';
        }
        if (slideshow) slideshow.classList.add('hidden');
        if (searchTab) {
            searchTab.classList.remove('open');
            searchTab.style.opacity = '';
            searchTab.style.visibility = '';
            searchTab.style.pointerEvents = '';
        }

        // Side panel visible — that's the whole point of "default".
        if (panel) panel.classList.remove('hidden');
        if (!isIslandLayout() && mapContainer) {
            const cls = state.panelSide === 'right' ? 'panel-visible-right' : 'panel-visible-left';
            mapContainer.classList.remove('panel-visible-left', 'panel-visible-right');
            mapContainer.classList.add(cls);
        }
        if (mapFloorSel) {
            mapFloorSel.classList.remove('hidden');
            mapFloorSel.style.display = 'flex';
        }

        // Default view never shows the back button; that's a kiosk-only
        // affordance for the explore mode (where the panel is hidden).
        if (backBtn) backBtn.style.display = 'none';

        state.currentView = 'map';

        // Surface the location list by default unless something is
        // already pinned (e.g. arriving here from a route flow).
        if (!state.endPoint) showLocationList();

        const mapMod = featureLoader.getModule('map');
        if (mapMod?.mapRenderer?.mainMap) {
            const { mapRenderer } = mapMod;
            setTimeout(() => { mapRenderer.mainMap.resize(); mapRenderer.fitToAll(mapRenderer.mainMap); }, 100);
        }
    });

    /* "Kiosk — Haritayı Keşfet" — kiosk-only minimal explore view. Side
     * panel hidden, only floor selector + back button visible. Lives on
     * the kiosk home screen as a way for users to browse the map without
     * picking a destination first. NOT a normal-flow screen. */
    eventBus.on('map:explore', () => {
        if (!state.startPoint && isAutoStart()) state.startPoint = config.venue.kioskLocation;

        const home = $$('initialHome');
        const slideshow = document.getElementById('homeMiniSlideshow');
        const panel = $$('mapSidePanel');
        const mapContainer = $$('mapContainer');
        const mapFloorSel = $$('mapFloorSelectorCompact');
        const searchTab = $$('searchTab');

        if (home) {
            home.style.opacity = '0';
            home.style.visibility = 'hidden';
            home.style.pointerEvents = 'none';
        }
        if (slideshow) slideshow.classList.add('hidden');
        if (searchTab) searchTab.classList.remove('open');

        if (panel) panel.classList.add('hidden');
        if (!isIslandLayout() && mapContainer) {
            mapContainer.classList.remove('panel-visible-left', 'panel-visible-right');
        }
        if (mapFloorSel) {
            mapFloorSel.classList.remove('hidden');
            mapFloorSel.style.display = 'flex';
        }

        const backBtn = $$('mapBackBtn');
        if (backBtn) backBtn.style.display = 'flex';

        state.currentView = 'map';

        const mapMod = featureLoader.getModule('map');
        if (mapMod) {
            const { mapRenderer } = mapMod;
            if (mapRenderer.mainMap) {
                setTimeout(() => { mapRenderer.mainMap.resize(); mapRenderer.fitToAll(mapRenderer.mainMap); }, 100);
            }
        }
    });

    const expandBtn = $$('sidePanelExpandBtn');
    if (expandBtn) expandBtn.addEventListener('click', openPanel);

    const closeBtn = $$('sidePanelCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    const searchPlaceholder = $$('sidePanelSearchPlaceholder');
    if (searchPlaceholder) searchPlaceholder.addEventListener('click', showLocationList);

    // Open the list when the search bar itself is clicked (not only the
    // placeholder text). Guarded so clicking it while already open — i.e.
    // while typing — doesn't re-trigger and steal focus.
    const searchBar = $$('sidePanelSearchBar');
    if (searchBar) {
        searchBar.addEventListener('click', () => {
            const listView = $$('sideLocationListView');
            if (listView && listView.classList.contains('hidden')) showLocationList();
        });
    }

    const drawRouteBtn = $$('sideDrawRouteBtn');
    if (drawRouteBtn) drawRouteBtn.addEventListener('click', () => showRouteInfoMode());

    const startCard = $$('sideRouteStartCard');
    if (startCard) startCard.addEventListener('click', editStartPoint);

    const endCard = $$('sideRouteEndCard');
    if (endCard) endCard.addEventListener('click', editEndPoint);

    eventBus.on('routePoint:updated', ({ point, location }) => {
        if (point === 'start') {
            const startName = $$('sidePanelStartName');
            const startFloor = $$('sidePanelStartFloor');
            if (startName) startName.textContent = location.name;
            if (startFloor) startFloor.textContent = location.floor;
            state.editingPoint = 'end';
        } else if (point === 'end') {
            const endName = $$('sidePanelEndName');
            const endFloor = $$('sidePanelEndFloor');
            if (endName) endName.textContent = location.name;
            if (endFloor) endFloor.textContent = location.floor;
        }
        updateRoutePointsSummary();
        updateRoutePointsUI();
    });

    const summaryStartRow = $$('summaryStartRow');
    if (summaryStartRow) {
        summaryStartRow.addEventListener('click', () => {
            if (isAutoStart()) return;
            state.editingPoint = 'start';
            updateRoutePointsSummary();
            showLocationList();
        });
    }

    const summaryEndRow = $$('summaryEndRow');
    if (summaryEndRow) {
        summaryEndRow.addEventListener('click', () => {
            state.editingPoint = 'end';
            updateRoutePointsSummary();
            showLocationList();
        });
    }

    updateRoutePointsSummary();

    const summaryPinBtn = $$('summaryDropPinBtn');
    if (summaryPinBtn) {
        summaryPinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            activatePinMode();
        });
    }

    const routePinBtn = $$('routeDropPinBtn');
    if (routePinBtn) {
        routePinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            activatePinMode();
        });
    }

    eventBus.on('pin:dropped', () => {
        updateRoutePointsSummary();
        updateRoutePointsUI();
    });

    eventBus.on('pin:routeDrawn', () => {
        showRouteInfoMode({ skipRouteDraw: true });
    });

    const editBtn = $$('sidePanelEditBtn');
    if (editBtn) editBtn.addEventListener('click', toggleEditMode);

    const backBtn = $$('mapBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            eventBus.emit('home:requestShow');
        });
    }

    eventBus.on('idle:timeout', () => {
        const panel = $$('mapSidePanel');
        const mapContainer = $$('mapContainer');
        if (panel) panel.classList.add('hidden');
        if (!isIslandLayout()) {
            if (panel) panel.classList.add('panel-right');
            if (mapContainer) {
                mapContainer.classList.add('panel-right');
                mapContainer.classList.remove('panel-visible-left', 'panel-visible-right');
            }
        }
        hideLocationList();
        updateRoutePointsSummary();
    });
}

export function destroy() {}

export { showPreviewMode, showRouteInfoMode, transitionToMapView, generateQRCode, updateRoutePointsSummary };
