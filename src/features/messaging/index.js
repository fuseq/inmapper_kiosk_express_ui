import { eventBus } from '../../core/event-bus.js';

let _messageHandler = null;

export function sendToParent(type, data = {}) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type, data }, '*');
    }
}

function handleMessage(event) {
    const { type, data } = event.data || {};
    if (!type) return;

    switch (type) {
        case 'INIT':
            sendToParent('ROUTE_READY', {});
            break;
        case 'ACTIVATE':
            break;
        case 'UPDATE_MINI_SLIDER':
            eventBus.emit('messaging:miniSliderUpdate', data);
            break;
        default:
            break;
    }
    eventBus.emit('parent:message', { type, data });
}

export function init() {
    _messageHandler = handleMessage;
    window.addEventListener('message', _messageHandler);

    const mapBackBtn = document.getElementById('mapBackBtn');
    if (mapBackBtn) {
        mapBackBtn.addEventListener('click', () => {
            sendToParent('BACK_TO_HOME');
        });
    }

    eventBus.on('idle:timeout', () => {
        sendToParent('SHOW_LANDING');
    });

    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'NAVIGATION_READY' }, '*');
    }
}

export function destroy() {
    if (_messageHandler) {
        window.removeEventListener('message', _messageHandler);
        _messageHandler = null;
    }
}
