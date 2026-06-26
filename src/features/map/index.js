import { eventBus } from '../../core/event-bus.js';
import { state, dataStore } from '../../core/state.js';
import { config } from '../../core/config.js';
import { mapRenderer } from './map-renderer.js';
import {
    applyNavStep,
    applyRouteResult,
    clearActiveRoute,
    displayRouteForNavStep,
    getActiveRoute,
    getRouteNavStepIndex,
    isInternalFloorSync,
    redrawActiveRouteIfAny,
} from './route-display.js';
import { findNearestUnitId } from './pathfinder.js';
import { fetchRouteFromApi, fetchDescribeFromApi, buildLocalRoute, resolveRoutePoint } from '../navigation/route-api.js';
import { isIslandLayout, isKioskView } from '../../app.js';
import { normalizeRoomFeatureId } from './unit-utils.js';

let routeRequestSeq = 0;

let hoveredFeatureId = null;

/* Feature id of a click that arrived before the locations dataset had
 * finished loading (Sheets / preview-asset fetch resolves async). We flush
 * it the moment `locations:loaded` fires so the very first tap on a unit
 * still opens its detail instead of silently doing nothing. */
let pendingSelectFid = null;

function findLocationByFeatureId(featureId) {
    if (!featureId) return null;
    const id = String(featureId);
    const base = normalizeRoomFeatureId(id);
    return dataStore.locations.find(l => {
        const lid = String(l.id);
        return lid === id || lid === base;
    });
}

/* Walls mode adds a transparent hit layer over room interiors so the open
 * floor is clickable too; in solid mode that layer is empty (no-op). */
const UNIT_LAYERS = ['rooms-3d', 'rooms-fill-hit'];

function clearUnitPointer(map) {
    map.getCanvas().style.cursor = '';
    if (hoveredFeatureId != null) {
        hoveredFeatureId = null;
        mapRenderer.clearHoverHighlight(map);
    }
}

function pickInteractableUnit(map, e) {
    if (mapRenderer.isPointerOverNonInteractiveFloor(map, e)) return null;
    let features = [];
    try {
        features = map.queryRenderedFeatures(e.point, { layers: UNIT_LAYERS });
    } catch (_) { /* layers not ready */ }
    for (const f of features) {
        if (mapRenderer.isInteractableUnitFeature(f)) return f;
    }
    return null;
}

function setupMapInteractions(map) {
    const interaction = config.features.map.interaction || {};
    const hoverEnabled = interaction.hover !== false;
    const clickEnabled = interaction.click !== false;

    if (hoverEnabled) {
        map.on('mousemove', (e) => {
            if (state.droppedPinMode) return;

            if (mapRenderer.isPointerOverNonInteractiveFloor(map, e)) {
                clearUnitPointer(map);
                return;
            }

            const top = pickInteractableUnit(map, e);
            if (!top) {
                clearUnitPointer(map);
                return;
            }

            const fid = top.properties?.id;
            if (!fid) {
                clearUnitPointer(map);
                return;
            }

            map.getCanvas().style.cursor = 'pointer';
            if (fid === hoveredFeatureId) return;
            hoveredFeatureId = fid;
            mapRenderer.setHoverHighlight(map, fid);
        });

        map.on('mouseleave', () => {
            if (state.droppedPinMode) return;
            clearUnitPointer(map);
        });
    }

    if (clickEnabled) {
        map.on('click', (e) => {
            if (mapRenderer.isPointerOverNonInteractiveFloor(map, e)) return;

            if (state.droppedPinMode) {
                handlePinDrop(map, e.lngLat);
                return;
            }

            const feature = pickInteractableUnit(map, e);
            if (feature) {
                const fid = feature.properties?.id;
                if (!fid) return;

                /* Disabled units render as inert flat floor and aren't tagged
                 * `__unit`, so they shouldn't reach here — but guard defensively
                 * so a disabled unit can never be selected/routed. */
                if (feature.properties?.disabled === true) return;

                /* Editor "Birimler" tab modu: tıklamalar normal seçim akışını
                 * tetiklemez (side panel/store detail açılmaz, fly-to yok).
                 * Sadece feature highlight + parent window'a item-clicked
                 * postMessage yollar. */
                if (state.itemEditorMode) {
                    mapRenderer.selectFeature(map, fid);
                    eventBus.emit('editor:itemClicked', { id: fid });
                    return;
                }

                /* Highlight first — even when the sheet has no row for this
                 * feature id the user should see which polygon was tapped. */
                mapRenderer.selectFeature(map, fid);

                const location = findLocationByFeatureId(fid);
                if (location) {
                    pendingSelectFid = null;
                    mapRenderer.flyToFeature(map, fid);
                    showPanelForMapSelection(location);
                } else {
                    /* Locations dataset isn't usable for this fid yet — either
                     * the Sheets fetch is still inflight or the row hasn't been
                     * matched to a feature id yet. Remember the tap and resolve
                     * it the next time `locations:loaded` fires so the very
                     * first click on a unit reliably opens its detail. */
                    pendingSelectFid = fid;
                }

                eventBus.emit('map:locationClicked', { locationId: fid, location: location || null });
                return;
            }

            // In item-editor mode, clicking the background just clears
            // the current selection and notifies the parent.
            if (state.itemEditorMode) {
                mapRenderer.selectFeature(map, null);
                eventBus.emit('editor:itemClicked', { id: null });
                return;
            }

            // On mobile, while a route is being configured / followed (directions,
            // navigation, assistant), a stray map tap must not wipe the picked
            // start/end and bounce back to the home grid.
            const inMobileRouteMode = config.initialView === 'mobile'
                && ['directions', 'navigation', 'assistant'].includes(state.mobileSheetMode);
            if (inMobileRouteMode) return;

            mapRenderer.selectFeature(map, null);

            if (state.currentView === 'map' && state.sidePanelMode === 'preview') {
                eventBus.emit('map:deselected');
            }
        });
    }
}

function isAutoStart() {
    return (config.features.navigation?.startPointMode || 'auto') === 'auto';
}

function handlePinDrop(map, lngLat) {
    const pinCfg = config.features.navigation?.droppedPin || {};
    const nearest = mapRenderer.findNearestNode(lngLat.lng, lngLat.lat);
    if (!nearest) {
        console.warn('DroppedPin: no path node found');
        return;
    }

    const clickCoord = [lngLat.lng, lngLat.lat];
    const snapCoord = pinCfg.snapToPath !== false ? nearest.coord : clickCoord;

    mapRenderer.dropPin(map, lngLat);

    state.droppedPinCoord = clickCoord;
    state.droppedPinNodeKey = nearest.nodeKey;
    state.droppedPinMode = false;
    mapRenderer.setPinMode(map, false);

    const pinLocation = {
        id: '__dropped_pin__',
        name: 'Bırakılan Nokta',
        isPinned: true,
        coord: snapCoord,
        clickCoord: clickCoord,
    };
    state.startPoint = pinLocation;
    eventBus.emit('routePoint:updated', { point: 'start', location: pinLocation });

    eventBus.emit('pin:dropped', { lngLat, snapCoord, nodeKey: nearest.nodeKey });

    if (state.endPoint?.id) {
        eventBus.emit('route:draw', {
            fromId: pinLocation.id,
            toId: state.endPoint.id,
            startPoint: pinLocation,
            pinLngLat: lngLat,
        });
    }
}

/* Shared between the API path and the local fallback: draw the route and
 * fan out the same events so both sources behave identically downstream. */
function emitRouteResult(route, rt, pinLngLat, { describeSteps = [], describeStages = [] } = {}) {
    if (pinLngLat && route.coordinates?.length >= 2) {
        mapRenderer.showSnapLine(mapRenderer.mainMap, pinLngLat, route.coordinates[0]);
    }

    eventBus.emit('route:result', {
        coordinates: route.coordinates,
        lineStrings: route.lineStrings,
        legs: route.legs,
        distance: route.distance,
        segments: route.segments || null,
        transitions: route.transitions || [],
        routeId: route.routeId,
        routeType: rt,
        describeSteps,
        describeStages,
    });

    applyRouteResult({ ...route, describeSteps, describeStages }, { navStepIndex: 0 });
    eventBus.emit('pin:routeDrawn', { route });
}

async function requestRoute({ fromId, toId, startPoint, routeType, pinLngLat }) {
    if (!mapRenderer.mainMap) return;

    const seq = ++routeRequestSeq;
    let start = resolveRoutePoint(startPoint) || resolveRoutePoint(fromId);
    const end = resolveRoutePoint(toId) || resolveRoutePoint(state.endPoint);

    if (startPoint?.isPinned) {
        const cc = startPoint.clickCoord || state.droppedPinCoord;
        const floor = state.currentFloor != null ? String(state.currentFloor) : null;
        const nearest = cc ? findNearestUnitId(cc[0], cc[1], floor) : null;
        if (nearest?.unitId) {
            start = resolveRoutePoint(nearest.unitId);
        }
    }

    if (!start || !end) {
        console.warn('Route: başlangıç veya hedef eksik');
        eventBus.emit('route:error', { message: 'Başlangıç veya hedef seçilmedi' });
        return;
    }

    const rt = routeType || state.routeType || 'shortest';

    try {
        eventBus.emit('route:loading', { loading: true });
        const geojson = mapRenderer.geojsonData;
        if (!geojson?.features?.length) {
            throw new Error('Harita verisi henüz yüklenmedi');
        }
        const route = await fetchRouteFromApi({
            startPoint: start,
            endPoint: end,
            routeType: rt,
            geojson,
        });
        if (seq !== routeRequestSeq) return;

        let describeSteps = [];
        let describeStages = [];
        /* Tarif motoru seçimi (editörde ayarlanır):
         *   'metric' → metrik tarif motoru (route-engine) kullanılır; backend
         *              insan-tarif API'si çağrılmaz. (Metrik adım üretiminin
         *              kiosk runtime'a tam bağlanması ayrı entegrasyon adımı.)
         *   'ml'     → backend describe API'sinden insan-tarifli adımlar alınır. */
        const descEngine = config.venue?.routing?.descriptionEngine || 'ml';
        if (descEngine !== 'metric') {
            try {
                const described = await fetchDescribeFromApi({ routeId: route.routeId, routeType: rt });
                describeSteps = described.steps;
                describeStages = described.stages || [];
            } catch (err) {
                console.warn('Describe API:', err.message);
            }
        }

        emitRouteResult(route, rt, pinLngLat, { describeSteps, describeStages });
    } catch (err) {
        console.error('Route API:', err);
        if (typeof window !== 'undefined' && window.__lastRouteDebugReport) {
            console.info(
                '[route-debug] Detay rapor hazır → copy(JSON.stringify(window.__lastRouteDebugReport, null, 2))',
            );
        }

        /* Endpoint unreachable / errored → fall back to the in-browser
         * pathfinder so navigation still works offline. Disable with
         * config.venue.routing.fallbackToLocal = false. */
        if (config.venue?.routing?.fallbackToLocal !== false) {
            try {
                const local = buildLocalRoute({ startPoint: start, endPoint: end, routeType: rt });
                if (seq !== routeRequestSeq) return;
                console.warn('[route] API başarısız; tarayıcı içi pathfinder fallback kullanıldı');
                emitRouteResult(local, rt, pinLngLat, { describeSteps: [], describeStages: [] });
                return;
            } catch (localErr) {
                console.error('Local route fallback:', localErr);
            }
        }

        eventBus.emit('route:error', { message: err.message || String(err) });
    } finally {
        if (seq === routeRequestSeq) {
            eventBus.emit('route:loading', { loading: false });
        }
    }
}

function showPanelForMapSelection(location) {
    const isMobile = config.initialView === 'mobile';

    if (state.editingPoint === 'start' && !isAutoStart()) {
        state.startPoint = location;
        eventBus.emit('routePoint:updated', { point: 'start', location });
        return;
    }

    state.selectedLocation = location;
    state.endPoint = location;
    if (!state.startPoint && isAutoStart()) {
        state.startPoint = config.venue.kioskLocation;
    }

    eventBus.emit('routePoint:updated', { point: 'end', location });

    if (isMobile) return;

    const panel = document.getElementById('mapSidePanel');
    const mapContainer = document.getElementById('mapContainer');
    const kioskMapBrowse = isKioskView() && isIslandLayout() && state.currentView === 'map';

    if (panel && panel.classList.contains('hidden') && !kioskMapBrowse) {
        panel.classList.remove('hidden');
        if (!isIslandLayout() && mapContainer) {
            const cls = state.panelSide === 'right' ? 'panel-visible-right' : 'panel-visible-left';
            mapContainer.classList.add(cls);
        }
        setTimeout(() => mapRenderer.mainMap?.resize(), 50);
    }

    /* Always tag map-originated picks; store-detail skips the search-tab
     * sheet when `fromMap && currentView === 'map'`. Island / panel use
     * `sidePanel:showPreviewMode` + `map:locationClicked`. */
    if (config.features.storeDetail?.enabled) {
        eventBus.emit('location:selected', { locationId: location.id, fromMap: true });
    }
    eventBus.emit('sidePanel:showPreviewMode', location);
}

export async function init() {
    await mapRenderer.initMainMap('floorMapContainer');

    if (mapRenderer.mainMap && dataStore.locations.length > 0) {
        mapRenderer.updateLabelsFromLocations(dataStore.locations);
        mapRenderer.applyLocationsToRooms(dataStore.locations);
    }

    if (mapRenderer.mainMap) {
        setupMapInteractions(mapRenderer.mainMap);
    }

    const onLocationsAvailable = (locations) => {
        if (mapRenderer.geojsonLoaded) {
            mapRenderer.updateLabelsFromLocations(locations);
            mapRenderer.applyLocationsToRooms(locations);
        }

        /* Flush a tap that landed before the dataset was usable. */
        if (pendingSelectFid != null) {
            const fid = pendingSelectFid;
            const location = findLocationByFeatureId(fid);
            if (location && mapRenderer.mainMap) {
                pendingSelectFid = null;
                mapRenderer.selectFeature(mapRenderer.mainMap, fid);
                mapRenderer.flyToFeature(mapRenderer.mainMap, fid);
                showPanelForMapSelection(location);
            }
        }
    };
    eventBus.on('locations:loaded', onLocationsAvailable);
    eventBus.on('data:locations', onLocationsAvailable);

    /* Triggered by category-service when the categories list changes —
     * either because the editor preview swapped them in or because the
     * Sheets fetch returned a new revision. */
    eventBus.on('categories:loaded', () => {
        mapRenderer.refreshRoomColors();
    });

    eventBus.on('location:selected', ({ locationId, fromMap }) => {
        if (!fromMap && mapRenderer.mainMap) {
            mapRenderer.selectFeature(mapRenderer.mainMap, locationId);
            mapRenderer.flyToFeature(mapRenderer.mainMap, locationId);
        }
    });

    eventBus.on('storeDetail:hide', () => {
        if (mapRenderer.mainMap) {
            mapRenderer.selectFeature(mapRenderer.mainMap, null);
        }
    });

    eventBus.on('map:deselected', () => {
        state.selectedLocation = null;
        state.endPoint = null;

        // Clear the highlight on the map too — otherwise closing the detail
        // (island X / back) leaves the unit stuck in its selected color.
        if (mapRenderer.mainMap) {
            mapRenderer.selectFeature(mapRenderer.mainMap, null);
            mapRenderer.clearHoverHighlight(mapRenderer.mainMap);
        }

        if (config.initialView !== 'mobile') {
            eventBus.emit('sidePanel:showLocationList');
        }
    });

    eventBus.on('idle:timeout', () => {
        if (state.routeNavigationActive) return;
        if (mapRenderer.mainMap) {
            mapRenderer.selectFeature(mapRenderer.mainMap, null);
            mapRenderer.clearHoverHighlight(mapRenderer.mainMap);
            mapRenderer.clearPin(mapRenderer.mainMap);
        }
        state.droppedPinMode = false;
        state.droppedPinCoord = null;
        state.droppedPinNodeKey = null;
        hoveredFeatureId = null;
    });

    eventBus.on('pin:activate', () => {
        if (!mapRenderer.mainMap) return;
        state.droppedPinMode = true;
        mapRenderer.setPinMode(mapRenderer.mainMap, true);
    });

    eventBus.on('pin:cancel', () => {
        if (!mapRenderer.mainMap) return;
        state.droppedPinMode = false;
        mapRenderer.setPinMode(mapRenderer.mainMap, false);
    });

    eventBus.on('pin:clear', () => {
        if (!mapRenderer.mainMap) return;
        mapRenderer.clearPin(mapRenderer.mainMap);
        state.droppedPinCoord = null;
        state.droppedPinNodeKey = null;
    });

    eventBus.on('route:draw', (payload) => {
        requestRoute(payload || {});
    });

    eventBus.on('route:typeChanged', (type) => {
        state.routeType = type;
        const sp = state.startPoint;
        const ep = state.endPoint;
        if (!sp || !ep) return;
        requestRoute({
            fromId: sp.id,
            toId: ep.id,
            startPoint: sp,
            routeType: type,
        });
    });

    eventBus.on('route:clear', () => {
        routeRequestSeq += 1;
        clearActiveRoute();
        if (mapRenderer.mainMap) {
            mapRenderer.clearRoute(mapRenderer.mainMap);
            mapRenderer.clearPin(mapRenderer.mainMap);
            mapRenderer.selectFeature(mapRenderer.mainMap, null);
        }
        state.droppedPinMode = false;
        state.droppedPinCoord = null;
        state.droppedPinNodeKey = null;
    });

    eventBus.on('route:navStep', ({ stepIndex }) => {
        if (stepIndex == null) return;
        applyNavStep(stepIndex);
    });

    eventBus.on('floor:changed', ({ floorId }) => {
        const route = getActiveRoute();
        if (!route || floorId == null) return;
        // Skip redraw triggered by our own nav-step floor sync (avoids
        // re-entrant double draw); only respond to manual floor switches.
        if (isInternalFloorSync()) return;
        displayRouteForNavStep(getRouteNavStepIndex(), route);
    });

    eventBus.on('map:ready', () => {
        redrawActiveRouteIfAny();
    });

    eventBus.emit('map:ready', { mainMap: mapRenderer.mainMap });
}

export function destroy() {
    mapRenderer.destroy();
}

export { mapRenderer };
