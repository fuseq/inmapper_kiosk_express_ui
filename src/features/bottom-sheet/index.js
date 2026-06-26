import { eventBus } from '../../core/event-bus.js';
import { config } from '../../core/config.js';
import { state } from '../../core/state.js';
import { initMobileSearch } from './mobile-search.js';
import { sheetContent } from './sheet-content.js';

const SNAP_PEEK_RATIO = 0.40;   // home / navigation peek
const SNAP_HALF_RATIO = 0.55;   // directions
const SNAP_FULL_RATIO = 0.95;   // search list + detail expanded (near full screen)
const VELOCITY_THRESHOLD = 0.4;
const MIN_DRAG = 8;

let sheetEl = null;
let contentEl = null;
let snapPoints = [];
let currentSnap = 0;
let sheetHeight = 0;
let dragState = null;

function getSnapPoints() {
    const vh = window.innerHeight;
    return [
        Math.round(vh * SNAP_PEEK_RATIO),
        Math.round(vh * SNAP_HALF_RATIO),
        Math.round(vh * SNAP_FULL_RATIO),
    ];
}

/** Measure mobile detail peek: header through hours divider (`.ms-detail-peek`). */
function measureDetailPeekHeight() {
    const peek = contentEl?.querySelector('[data-ms-detail-peek]');
    if (!peek || !sheetEl) return null;

    const handle = sheetEl.querySelector('.mobile-sheet-handle-area');
    const header = document.getElementById('mobileSheetHeader');
    let h = 0;
    if (handle) h += handle.offsetHeight;
    if (header?.offsetHeight) h += header.offsetHeight;
    h += peek.offsetHeight;

    const padBottom = parseFloat(getComputedStyle(contentEl).paddingBottom) || 0;
    h += padBottom;

    return Math.max(120, Math.min(Math.round(h), window.innerHeight * 0.95));
}

function snapDetailPeek(animate = true) {
    const measured = measureDetailPeekHeight();
    if (measured == null) {
        snapTo(0, animate);
        return;
    }
    // Detail mode: peek (measured) + full screen — drag up or expand hours → full.
    const full = Math.round(window.innerHeight * SNAP_FULL_RATIO);
    snapPoints = [measured, full];
    currentSnap = 0;
    setSheetHeight(measured, animate);
    eventBus.emit('sheet:snapped', { level: 0, height: measured, detailPeek: true });
}

function snapFull(animate = true) {
    const full = Math.round(window.innerHeight * SNAP_FULL_RATIO);
    if (snapPoints.length === 2) {
        snapPoints[1] = full;
        currentSnap = 1;
        setSheetHeight(full, animate);
        eventBus.emit('sheet:snapped', { level: 1, height: full, detailFull: true });
        return;
    }
    snapPoints = getSnapPoints();
    snapTo(snapPoints.length - 1, animate);
}

function setSheetHeight(h, animate = true) {
    sheetEl.classList.remove('auto-fit');
    sheetHeight = Math.max(60, Math.min(h, window.innerHeight * 0.95));
    if (animate) {
        sheetEl.classList.remove('dragging');
    } else {
        sheetEl.classList.add('dragging');
    }
    sheetEl.style.height = `${sheetHeight}px`;
}

function snapTo(index, animate = true) {
    currentSnap = Math.max(0, Math.min(index, snapPoints.length - 1));
    setSheetHeight(snapPoints[currentSnap], animate);
    eventBus.emit('sheet:snapped', { level: currentSnap, height: snapPoints[currentSnap] });
}

function findNearestSnap(h, velocity) {
    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
        const dir = velocity < 0 ? 1 : -1;
        const next = currentSnap + dir;
        if (next >= 0 && next < snapPoints.length) return next;
    }
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < snapPoints.length; i++) {
        const d = Math.abs(snapPoints[i] - h);
        if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
}

function eventY(e) {
    if (e.touches && e.touches.length) return e.touches[0].clientY;
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientY;
    return e.clientY;
}

function onDragStart(e) {
    // Mouse: only the primary button starts a drag.
    if (e.type === 'mousedown' && e.button !== 0) return;

    // Dragging the grab handle always resizes; dragging elsewhere defers to
    // content scrolling when the list is scrolled at the full snap.
    const fromHandle = !!(e.currentTarget && e.currentTarget.classList
        && e.currentTarget.classList.contains('mobile-sheet-handle-area'));
    if (!fromHandle && contentEl.scrollTop > 0 && currentSnap === 2) return;

    const y = eventY(e);
    dragState = {
        startY: y,
        startH: sheetHeight,
        lastY: y,
        lastT: Date.now(),
        velocity: 0,
        moved: false,
        fromHandle,
    };
}

function onDragMove(e) {
    if (!dragState) return;
    const y = eventY(e);
    const dy = dragState.startY - y;

    if (!dragState.moved && Math.abs(dy) < MIN_DRAG) return;
    if (!dragState.moved && !dragState.fromHandle && contentEl.scrollTop > 0 && dy > 0) {
        dragState = null;
        return;
    }

    dragState.moved = true;
    if (e.cancelable) e.preventDefault();

    const now = Date.now();
    const dt = Math.max(1, now - dragState.lastT);
    dragState.velocity = (y - dragState.lastY) / dt;
    dragState.lastY = y;
    dragState.lastT = now;

    setSheetHeight(dragState.startH + dy, false);
}

function onDragEnd() {
    if (!dragState || !dragState.moved) {
        dragState = null;
        return;
    }
    const idx = findNearestSnap(sheetHeight, dragState.velocity);
    snapTo(idx, true);
    dragState = null;
}

function bindGestures() {
    sheetEl.addEventListener('touchstart', onDragStart, { passive: true });
    sheetEl.addEventListener('touchmove', onDragMove, { passive: false });
    sheetEl.addEventListener('touchend', onDragEnd, { passive: true });
    sheetEl.addEventListener('touchcancel', onDragEnd, { passive: true });

    // Mouse (desktop + editor preview): drag the grab handle to expand/collapse.
    const handle = sheetEl.querySelector('.mobile-sheet-handle-area');
    if (handle) handle.addEventListener('mousedown', onDragStart);
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
}

function onResize() {
    const mode = sheetContent.getMode();
    if (mode === 'detail') {
        if (currentSnap >= 1) snapFull(false);
        else snapDetailPeek(false);
        return;
    }
    snapPoints = getSnapPoints();
    snapTo(currentSnap < 0 ? 0 : currentSnap, false);
}

export function snapSheet(level) {
    if (level === 'fit') {
        snapToFit();
    } else if (level === 'detail-peek') {
        snapDetailPeek(true);
    } else if (level === 'full') {
        snapFull(true);
    } else {
        snapTo(level, true);
    }
}

function snapToFit() {
    sheetEl.classList.add('auto-fit');
    sheetEl.style.height = '';
    currentSnap = -1;
    requestAnimationFrame(() => {
        sheetHeight = sheetEl.offsetHeight;
    });
}

export function resetSnapPoints() {
    snapPoints = getSnapPoints();
}

export function getSheetLevel() {
    return currentSnap;
}

export async function init() {
    sheetEl = document.getElementById('mobileBottomSheet');
    contentEl = document.getElementById('mobileSheetContent');
    if (!sheetEl || !contentEl) {
        console.warn('Bottom sheet DOM not found');
        return;
    }

    snapPoints = getSnapPoints();
    bindGestures();
    window.addEventListener('resize', onResize);

    sheetContent.init(contentEl);
    initMobileSearch();

    // Map interaction -> bottom sheet
    eventBus.on('map:locationClicked', ({ location }) => {
        if (!location) return;
        const mode = sheetContent.getMode();
        // While a route is drawn, tapping a unit shows its detail but keeps the
        // route on the map — closing the detail returns to the route screen.
        if (state.routeNavigationActive) {
            state.selectedLocation = location;
            sheetContent.setMode('detail', { location });
            return;
        }
        // No active route: don't disrupt route setup or the open assistant panel.
        if (mode === 'directions' || mode === 'navigation' || mode === 'assistant') return;
        state.selectedLocation = location;
        state.endPoint = location;
        sheetContent.setMode('detail', { location });
    });

    eventBus.on('map:deselected', () => {
        // Don't tear down an in-progress route (directions/nav/assistant).
        const mode = sheetContent.getMode();
        if (mode === 'directions' || mode === 'navigation' || mode === 'assistant') return;
        // Tapping empty map while viewing a unit over a live route returns to
        // the route screen rather than resetting to home.
        if (mode === 'detail' && state.routeNavigationActive && state.mobileRouteScreen) {
            const back = state.mobileRouteScreen;
            sheetContent.setMode(back);
            if (back === 'assistant') snapTo(1, true);
            else snapToFit();
            return;
        }
        state.selectedLocation = null;
        state.endPoint = null;
        sheetContent.setMode('home');
        snapPoints = getSnapPoints();
        snapTo(0, true);
    });

    eventBus.on('pin:dropped', () => {
        sheetContent.refreshRoute();
    });

    eventBus.on('pin:routeDrawn', () => {
        // The assistant shows route stages in its own chat panel — don't yank
        // the user into the classic ms-nav card when a route is drawn there.
        if (sheetContent.getMode() === 'assistant') return;
        sheetContent.setMode('navigation');
        snapToFit();
    });

    eventBus.on('route:finished', () => {
        sheetContent.setMode('home');
        snapTo(0, true);
    });

    eventBus.on('idle:timeout', () => {
        const mode = sheetContent.getMode();
        // Keep an active route on screen (classic nav card or assistant chat).
        if ((mode === 'navigation' || mode === 'assistant') && state.routeNavigationActive) return;
        sheetContent.setMode('home');
        snapTo(0, true);
    });

    // Initial state: home with peek
    snapTo(0, false);
    console.log('📱 Bottom sheet initialized');
}

export function destroy() {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    if (sheetEl) {
        sheetEl.removeEventListener('touchstart', onDragStart);
        sheetEl.removeEventListener('touchmove', onDragMove);
        sheetEl.removeEventListener('touchend', onDragEnd);
        sheetEl.removeEventListener('touchcancel', onDragEnd);
        const handle = sheetEl.querySelector('.mobile-sheet-handle-area');
        if (handle) handle.removeEventListener('mousedown', onDragStart);
    }
}
