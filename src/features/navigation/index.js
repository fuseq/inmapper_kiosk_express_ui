import { eventBus } from '../../core/event-bus.js';
import { state } from '../../core/state.js';
import { config } from '../../core/config.js';
import { getLocationDisplayName } from '../../core/utils.js';
import { getInterfaceProfile } from '../../core/interface-profile.js';
import { showQRCode, hideQRCode } from './qr-service.js';
import { isKioskView } from '../../app.js';

function formatRoutePointLabel(point, fallback) {
    if (!point) return fallback;
    if (point.isPinned) return 'Haritadan seçildi';
    return getLocationDisplayName(point);
}

function swapRoutePoints() {
    if (isAutoStart()) return;
    if (!state.startPoint || !state.endPoint) return;

    const tmp = state.startPoint;
    state.startPoint = state.endPoint;
    state.endPoint = tmp;

    const startDisplay = document.getElementById('startPointDisplay');
    const endDisplay = document.getElementById('endPointDisplay');
    if (startDisplay) startDisplay.textContent = formatRoutePointLabel(state.startPoint, 'Başlangıç seçin');
    if (endDisplay) endDisplay.textContent = formatRoutePointLabel(state.endPoint, 'Hedef seçin');

    document.getElementById('startPointSelector')?.classList.toggle('has-value', !!state.startPoint);
    document.getElementById('endPointSelector')?.classList.toggle('has-value', !!state.endPoint);

    eventBus.emit('route:draw', {
        fromId: state.startPoint.id,
        toId: state.endPoint.id,
        startPoint: state.startPoint,
        routeType: state.routeType,
    });
}

function selectEditingPoint(point) {
    state.editingPoint = point;
    const startSel = document.getElementById('startPointSelector');
    const endSel = document.getElementById('endPointSelector');
    if (point === 'start') {
        if (startSel) startSel.classList.add('active');
        if (endSel) endSel.classList.remove('active');
    } else {
        if (endSel) endSel.classList.add('active');
        if (startSel) startSel.classList.remove('active');
    }
}

function changeRouteType(type) {
    state.routeType = type;
    const normalBtn = document.getElementById('routeTypeNormal');
    const accessBtn = document.getElementById('routeTypeAccessible');
    if (normalBtn) normalBtn.classList.toggle('active', type === 'shortest' || type === 'normal');
    if (accessBtn) accessBtn.classList.toggle('active', type === 'accessible');
}

function isAutoStart() {
    return (config.features.navigation.startPointMode || 'auto') === 'auto';
}

/* Kiosk-only "you must pick a start point first" UX: a permanently visible
 * nav card with start/end selectors. Only those interfaces (`profile.navbar`)
 * may default `editingPoint='start'`; everywhere else (web/mobile) clicks
 * write to `end` so the first map tap opens detail instead of being eaten
 * as a start-point write. */
function hasStartFirstUi() {
    return !!getInterfaceProfile(config.initialView).navbar;
}

function applyStartPointUI() {
    const startSel = document.getElementById('startPointSelector');
    const startLabel = document.getElementById('startPointLabel');
    const startDisplay = document.getElementById('startPointDisplay');

    if (isAutoStart()) {
        state.startPoint = config.venue.kioskLocation;
        if (startSel) { startSel.classList.add('disabled'); startSel.classList.add('has-value'); startSel.disabled = true; }
        if (startLabel) startLabel.textContent = isKioskView() ? 'NEREDEN? (Kiosk)' : 'NEREDEN?';
        if (startDisplay) startDisplay.textContent = config.venue.kioskLocation.name;
    } else {
        state.startPoint = null;
        if (startSel) { startSel.classList.remove('disabled'); startSel.classList.remove('has-value'); startSel.disabled = false; }
        if (startLabel) startLabel.textContent = 'NEREDEN?';
        if (startDisplay) startDisplay.textContent = 'Başlangıç seçin';
    }
}

export function init() {
    const startSel = document.getElementById('startPointSelector');
    const endSel = document.getElementById('endPointSelector');
    if (startSel) startSel.addEventListener('click', () => {
        if (!isAutoStart()) selectEditingPoint('start');
    });
    if (endSel) endSel.addEventListener('click', () => selectEditingPoint('end'));

    const swapBtn = document.getElementById('routePointsSwapBtn');
    if (swapBtn) swapBtn.addEventListener('click', swapRoutePoints);

    const normalBtn = document.getElementById('routeTypeNormal');
    const accessBtn = document.getElementById('routeTypeAccessible');
    if (normalBtn) normalBtn.addEventListener('click', () => changeRouteType('shortest'));
    if (accessBtn) accessBtn.addEventListener('click', () => changeRouteType('accessible'));

    const qrCloseBtn = document.getElementById('qrModalClose');
    if (qrCloseBtn) qrCloseBtn.addEventListener('click', hideQRCode);

    const qrBtn = document.getElementById('showQRBtn');
    if (qrBtn) qrBtn.addEventListener('click', showQRCode);

    applyStartPointUI();

    if (isAutoStart() || !hasStartFirstUi()) {
        state.editingPoint = 'end';
        if (endSel) endSel.classList.add('active');
    } else {
        state.editingPoint = 'start';
        if (startSel) startSel.classList.add('active');
    }

    eventBus.on('routePoint:updated', ({ point, location }) => {
        if (point === 'start') {
            const startDisplay = document.getElementById('startPointDisplay');
            if (startDisplay) startDisplay.textContent = location.name;
            document.getElementById('startPointSelector')?.classList.add('has-value');
            state.editingPoint = 'end';
            selectEditingPoint('end');
        } else {
            const endDisplay = document.getElementById('endPointDisplay');
            if (endDisplay) endDisplay.textContent = location.name;
            document.getElementById('endPointSelector')?.classList.add('has-value');
        }
    });

    eventBus.on('idle:timeout', () => {
        hideQRCode();
        applyStartPointUI();
        if (isAutoStart() || !hasStartFirstUi()) {
            state.editingPoint = 'end';
        } else {
            state.editingPoint = 'start';
        }
        const endDisplay = document.getElementById('endPointDisplay');
        if (endDisplay) endDisplay.textContent = 'Hedef seçin';
        document.getElementById('endPointSelector')?.classList.remove('has-value');
        const routeSwitch = document.getElementById('storeRouteSwitch');
        if (routeSwitch) routeSwitch.classList.remove('accessible');
    });
}

export function destroy() {}

export { isAutoStart, showQRCode, hideQRCode };
