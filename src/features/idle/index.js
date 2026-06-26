import { eventBus } from '../../core/event-bus.js';
import { state, resetState } from '../../core/state.js';
import { config } from '../../core/config.js';

let idleTimer = null;
let timeout = 90000;

function onIdleTimeout() {
    resetState();
    const isAutoStart = (config.features.navigation?.startPointMode || 'auto') === 'auto';
    if (isAutoStart) state.startPoint = config.venue.kioskLocation;
    state.editingPoint = 'end';
    eventBus.emit('idle:timeout');
}

function resetTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(onIdleTimeout, timeout);
}

const _handler = () => resetTimer();

export function init(options = {}) {
    timeout = options.timeout || 90000;
    ['click', 'touchstart', 'mousemove'].forEach(evt => {
        document.addEventListener(evt, _handler);
    });
    resetTimer();
}

export function destroy() {
    clearTimeout(idleTimer);
    idleTimer = null;
    ['click', 'touchstart', 'mousemove'].forEach(evt => {
        document.removeEventListener(evt, _handler);
    });
}
