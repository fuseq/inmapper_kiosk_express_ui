/**
 * Multi-floor route display. One floor shown at a time; the active describe
 * stage is highlighted bright while the rest of that floor's route is dimmed.
 *
 * Highlight geometry comes from describe-API stages mapped to WGS84 legs via
 * `connection_ids` (see route-stages.js) — never from SVG-pixel path points.
 */

import { eventBus } from '../../core/event-bus.js';
import { config } from '../../core/config.js';
import { state } from '../../core/state.js';
import { refreshFloorUi } from '../floor-selector/index.js';
import {
    floorKeyForNavStep,
    highlightForNavStep,
    isStageFloorChange,
} from '../navigation/route-stages.js';
import { isRouteDebugEnabled } from '../navigation/route-debug.js';
import { mapRenderer } from './map-renderer.js';
import { slicePathForNavStep } from './route-path-utils.js';

let activeRoute = null;
let navStepIndex = 0;
let lastOverviewFloor = null;
let syncingFloorInternally = false;

/** True while a nav-step-driven floor change is emitting `floor:changed`, so
 *  the map's floor:changed handler can skip its redundant route redraw. */
export function isInternalFloorSync() {
    return syncingFloorInternally;
}

export function getActiveRoute() {
    return activeRoute;
}

export function isRouteNavigationActive() {
    return !!activeRoute;
}

export function getRouteNavStepIndex() {
    return navStepIndex;
}

export function setActiveRoute(route) {
    activeRoute = route || null;
    state.routeNavigationActive = !!activeRoute;
    if (!activeRoute) {
        navStepIndex = 0;
        lastOverviewFloor = null;
    }
}

export function clearActiveRoute() {
    activeRoute = null;
    state.routeNavigationActive = false;
    navStepIndex = 0;
    lastOverviewFloor = null;
}

export function isFloorChangeStep(step) {
    if (step?.action && isStageFloorChange(step)) return true;
    if (!step) return false;
    if (step.icon === 'stepElevator') return true;
    const t = String(step.text || step.description || '').toLowerCase();
    return /katına geç|kata geç|kat geçiş|floor change|merdiven ile|asansör ile/i.test(t);
}

function floorDisplayName(floorKey, route) {
    const seg = route?.segments?.find(s => String(s.floor) === String(floorKey));
    if (seg?.floorLabel) return seg.floorLabel;
    const stage = route?.describeStages?.find(s => String(s.floorKey) === String(floorKey));
    if (stage?.floor) return stage.floor;
    return config.venue?.floorMap?.[String(floorKey)] || String(floorKey);
}

export function syncMapFloor(floorKey, route = activeRoute) {
    const fk = String(floorKey);
    const n = parseInt(fk, 10);
    const floorId = Number.isFinite(n) ? n : fk;
    const displayName = floorDisplayName(fk, route);

    refreshFloorUi(floorId, displayName);

    if (String(state.currentFloor) === String(floorId)) return;

    state.currentFloor = floorId;
    eventBus.emit('floor:changed', { floorId, displayName });
}

function resolveStepHighlight(route, stepIndex) {
    const fromStage = highlightForNavStep(route, stepIndex);
    if (fromStage && (fromStage.active.length || fromStage.muted.length)) {
        return fromStage;
    }

    const floorKey = String(floorKeyForNavStep(route, stepIndex));
    const { active, muted } = slicePathForNavStep(route, stepIndex, floorKey);
    return { active, muted, floorKey };
}

export function displayRouteForNavStep(stepIndex, route = activeRoute) {
    if (!mapRenderer.mainMap) return;

    navStepIndex = stepIndex;

    if (!route) {
        mapRenderer.clearRoute(mapRenderer.mainMap);
        return;
    }

    const { active, muted, floorKey } = resolveStepHighlight(route, stepIndex);

    if (isRouteDebugEnabled()) {
        const stage = route.describeStages?.[stepIndex];
        console.debug(
            `[route-step] #${stepIndex} floor=${floorKey}`,
            `active=${active[0]?.length || 0}pts muted=${muted.length}`,
            stage ? `| ${stage.action}: ${stage.description}` : '',
        );
    }

    syncingFloorInternally = true;
    try {
        syncMapFloor(floorKey, route);
    } finally {
        syncingFloorInternally = false;
    }

    if (!active.length && !muted.length) {
        mapRenderer.clearRoute(mapRenderer.mainMap);
        return;
    }

    mapRenderer.drawRouteStepHighlight(muted, active);

    // Step 0 (or a fresh floor) → overview of the whole leg-set on that floor.
    // Subsequent steps → camera follows the active leg so the user sees the
    // segment they're stepping through.
    const isFloorChange = lastOverviewFloor !== floorKey;
    if (stepIndex === 0 || isFloorChange) {
        const fitLines = [...active, ...muted].filter(c => c?.length >= 2);
        if (fitLines.length) {
            mapRenderer.fitRouteOverview(mapRenderer.mainMap, null, fitLines);
        }
        lastOverviewFloor = floorKey;
    } else {
        const activeLines = active.filter(c => c?.length >= 2);
        if (activeLines.length) {
            mapRenderer.fitRouteOverview(mapRenderer.mainMap, null, activeLines);
        }
    }
}

export function applyRouteResult(route, { navStepIndex: step = 0 } = {}) {
    setActiveRoute(route);
    displayRouteForNavStep(step, route);
}

export function applyNavStep(stepIndex) {
    if (!activeRoute) return;
    displayRouteForNavStep(stepIndex, activeRoute);
}

export function redrawActiveRouteIfAny() {
    if (!activeRoute || !mapRenderer.mainMap) return;
    displayRouteForNavStep(navStepIndex, activeRoute);
}
