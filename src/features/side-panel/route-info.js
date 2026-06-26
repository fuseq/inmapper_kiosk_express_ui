import { state, dataStore } from '../../core/state.js';
import { eventBus } from '../../core/event-bus.js';
import { formatPhoneNumber } from '../../core/utils.js';
import { getCategoryDisplayNames } from '../data/category-service.js';
import { config } from '../../core/config.js';
import { updateSimilarStores } from './store-preview.js';
import { showList as showLocationList } from './location-list.js';
import { iconHTML, renderIcons } from '../../core/icon.js';
import { buildRouteQrImageUrl } from '../navigation/qr-service.js';

let lastRouteData = null;
eventBus.on('route:result', (data) => { lastRouteData = data; updateTransitionsBlock(); });
eventBus.on('route:clear',  () => { lastRouteData = null; updateTransitionsBlock(); });

function updateTransitionsBlock() {
    const host = document.getElementById('sideRouteTransitions');
    if (!host) return;
    const list = lastRouteData?.transitions || [];
    if (!list.length) { host.innerHTML = ''; host.classList.add('hidden'); return; }
    host.classList.remove('hidden');
    host.innerHTML = list.map(t => {
        const targetName = config.venue?.floorMap?.[t.toFloor] || `${t.toFloor}. Kat`;
        const isElev = t.type === 'Elev';
        const verb = isElev ? 'Asansör' : 'Merdiven';
        return `<div class="side-route-transition">
            <span class="side-route-transition-ico">${isElev ? '↕' : '⌂'}</span>
            <span class="side-route-transition-text">
                ${verb} #${t.stack} ile <b>${targetName}</b>'a geçin
            </span>
        </div>`;
    }).join('');
}

const DESCRIPTIONS = {
    shopping: 'Modern moda ve stil tutkunları için geniş ürün yelpazesi ile hizmetinizdeyiz.',
    food: 'Lezzetli yemekler ve içeceklerle damak zevkinize hitap ediyoruz.',
    coffee: 'Taze kahve aroması ve samimi atmosferimizle mola vermeniz için ideal mekan.',
    entertainment: 'Eğlence ve dinlenme için mükemmel aktiviteler sunuyoruz.',
    wc: 'Temiz ve modern tuvalet hizmetleri misafirlerimizin kullanımına sunulmuştur.',
    atm: 'Çeşitli hizmetlerimizle size yardımcı olmaktan mutluluk duyarız.',
    parking: 'Güvenli ve geniş otopark alanımız müşterilerimizin hizmetindedir.',
};

function $$(id) { return document.getElementById(id); }

export function generateQRCode() {
    const qrUrl = buildRouteQrImageUrl(300);
    if (!qrUrl) return;
    const qrEl = $$('sidePanelQRCode');
    if (qrEl) qrEl.src = qrUrl;
}

export function showRouteInfoMode({ skipRouteDraw = false } = {}) {
    state.sidePanelMode = 'route';
    const location = state.endPoint;
    if (!location) return;

    const logoEl = $$('sideRouteStoreLogo');
    if (logoEl) {
        if (location.logo) {
            logoEl.innerHTML = `<img src="${location.logo}" alt="${location.name}">`;
        } else {
            logoEl.innerHTML = iconHTML(location.icon || 'store', { size: 36 });
            renderIcons();
        }
    }

    const nameEl = $$('sideRouteStoreName');
    if (nameEl) nameEl.textContent = location.name;

    const floorEl = $$('sideRouteStoreFloor');
    if (floorEl) floorEl.textContent = `${location.floor}`;

    const hoursEl = $$('sideRouteStoreHours');
    if (hoursEl) {
        const span = hoursEl.querySelector('span');
        if (span) span.textContent = location.hours || 'Mon-Sun • 10:00-22:00';
    }

    const tagsEl = $$('sideRouteStoreTags');
    if (tagsEl) {
        const names = getCategoryDisplayNames(location.apiCategories);
        tagsEl.innerHTML = names.map(t => `<span class="side-store-tag">${t}</span>`).join('');
    }

    const descEl = $$('sideRouteStoreDescription');
    if (descEl) descEl.textContent = location.description || DESCRIPTIONS[location.type] || 'Detaylı bilgi için lütfen ziyaret edin.';

    const phoneNum = $$('sideRoutePhoneNumber');
    const phoneCard = $$('sideRoutePhoneCard');
    if (phoneNum && phoneCard) {
        if (location.telephone) { phoneNum.textContent = formatPhoneNumber(location.telephone); phoneCard.style.display = 'flex'; }
        else phoneCard.style.display = 'none';
    }

    updateSimilarStores(location, $$('sideRouteSimilarStores'), true);
    updateRoutePointsUI();
    generateQRCode();

    const previewMode = $$('sideStorePreviewMode');
    const routeMode = $$('sideRouteInfoMode');
    if (previewMode) previewMode.classList.add('hidden');
    if (routeMode) routeMode.classList.remove('hidden');

    if (!skipRouteDraw && state.startPoint && state.endPoint) {
        eventBus.emit('route:draw', {
            fromId: state.startPoint.id,
            toId: state.endPoint.id,
            startPoint: state.startPoint,
        });
    }
}

function isAutoStart() {
    return (config.features.navigation?.startPointMode || 'auto') === 'auto';
}

export function updateRoutePointsUI() {
    const startName = $$('sidePanelStartName');
    const endName = $$('sidePanelEndName');
    const startFloor = $$('sidePanelStartFloor');
    const endFloor = $$('sidePanelEndFloor');
    const startCard = $$('sideRouteStartCard');
    const routePinBtn = $$('routeDropPinBtn');

    if (startName) {
        startName.textContent = state.startPoint
            ? state.startPoint.name
            : 'Başlangıç seçin';
    }
    if (startFloor) {
        if (state.startPoint?.isPinned) {
            startFloor.textContent = 'Haritadan seçildi';
        } else {
            startFloor.textContent = state.startPoint?.floor || '';
        }
    }
    if (endName) {
        endName.textContent = state.endPoint
            ? state.endPoint.name
            : 'Hedef seçin';
    }
    if (endFloor) {
        endFloor.textContent = state.endPoint?.floor || '';
    }

    if (startCard) {
        startCard.classList.toggle('disabled', isAutoStart());
        startCard.classList.toggle('editable', !isAutoStart());
    }

    const pinEnabled = config.features.navigation?.droppedPin?.enabled === true;
    if (routePinBtn) {
        const showPin = pinEnabled && !isAutoStart() && !state.startPoint?.isPinned;
        routePinBtn.classList.toggle('hidden', !showPin);
    }
}

export function editStartPoint() {
    if (isAutoStart()) return;
    state.editingPoint = 'start';

    const startCard = $$('sideRouteStartCard');
    const endCard = $$('sideRouteEndCard');
    if (startCard) startCard.classList.add('active');
    if (endCard) endCard.classList.remove('active');

    showLocationList();
}

export function editEndPoint() {
    state.editingPoint = 'end';

    const startCard = $$('sideRouteStartCard');
    const endCard = $$('sideRouteEndCard');
    if (startCard) startCard.classList.remove('active');
    if (endCard) endCard.classList.add('active');

    showLocationList();
}

export function swapRoutePoints() {
    if (!state.startPoint || !state.endPoint) return;
    if (isAutoStart()) return;

    const tmp = state.startPoint;
    state.startPoint = state.endPoint;
    state.endPoint = tmp;

    updateRoutePointsUI();
    generateQRCode();
}
