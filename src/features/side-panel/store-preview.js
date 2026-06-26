import { state, dataStore } from '../../core/state.js';
import { eventBus } from '../../core/event-bus.js';
import { formatPhoneNumber, getLocationDisplayName } from '../../core/utils.js';
import { getCategoryDisplayNames } from '../data/category-service.js';
import { iconHTML, renderIcons } from '../../core/icon.js';
import { buildDetailSectionsHTML, wireDetailSections } from '../store-detail/detail-sections.js';

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

export function updateStoreInfo(location) {
    if (!location) return;

    const logo = $$('sidePanelStoreLogo');
    if (logo) {
        if (location.logo) {
            logo.innerHTML = `<img src="${location.logo}" alt="${location.name}">`;
        } else {
            logo.innerHTML = iconHTML(location.icon || 'store', { size: 36 });
            renderIcons();
        }
    }

    const nameEl = $$('sidePanelStoreName');
    if (nameEl) nameEl.textContent = location.name;

    const floorEl = $$('sidePanelStoreFloor');
    if (floorEl) floorEl.textContent = `${location.floor}`;

    const hoursEl = $$('sidePanelStoreHours');
    if (hoursEl) {
        const span = hoursEl.querySelector('span');
        if (span) span.textContent = location.hours || 'Mon-Sun • 10:00-22:00';
    }

    const tagsEl = $$('sidePanelStoreTags');
    if (tagsEl) {
        const names = getCategoryDisplayNames(location.apiCategories);
        tagsEl.innerHTML = names.map(t =>
            `<span class="side-store-tag">${t}<button class="side-store-tag-remove hidden" data-tag="${t}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></span>`
        ).join('');
        state.selectedCategories = [...names];
    }

    const descEl = $$('sidePanelStoreDescription');
    if (descEl) descEl.textContent = location.description || DESCRIPTIONS[location.type] || 'Detaylı bilgi için lütfen ziyaret edin.';

    const phoneNum = $$('sidePanelPhoneNumber');
    const phoneCard = $$('sidePanelPhoneCard');
    if (phoneNum && phoneCard) {
        if (location.telephone) { phoneNum.textContent = formatPhoneNumber(location.telephone); phoneCard.style.display = 'flex'; }
        else phoneCard.style.display = 'none';
    }

    // Unified collapsible sections (gallery / hours / details / categories /
    // recommendations). When present they supersede the legacy description +
    // similar-store blocks, which we hide to avoid duplication.
    const sectionsHost = $$('sidePanelDetailSections');
    if (sectionsHost) {
        sectionsHost.innerHTML = buildDetailSectionsHTML(location, {
            descriptionFallback: DESCRIPTIONS[location.type] || 'Detaylı bilgi için lütfen ziyaret edin.',
        });
        renderIcons();
        wireDetailSections(sectionsHost, location, {
            onRelatedClick: (store) => {
                state.endPoint = store;
                state.selectedLocation = store;
                const placeholder = $$('sidePanelSearchPlaceholder');
                if (placeholder) placeholder.textContent = store.name;
                eventBus.emit('sidePanel:showPreviewMode', store);
            },
        });
        const root = $$('sideStoreDetailView');
        root?.querySelector('.side-description-card')?.style.setProperty('display', 'none');
        root?.querySelector('.side-similar-stores')?.style.setProperty('display', 'none');
    } else {
        updateSimilarStores(location, $$('sidePanelSimilarStores'), false);
    }
}

export function updateSimilarStores(location, container, isRouteMode) {
    if (!container) return;
    const similar = dataStore.locations.filter(l => l.id !== location.id && l.type === location.type).slice(0, 3);

    if (similar.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:12px;color:var(--t-70);"><p style="margin:0;font-size:clamp(10px,0.85vw,13px);">Benzer mağaza bulunamadı</p></div>';
        return;
    }

    container.innerHTML = similar.map(s => s.logo
        ? `<div class="side-similar-item" data-store-id="${s.id}"><img src="${s.logo}" alt="${s.name}" class="side-similar-logo-img"></div>`
        : `<div class="side-similar-item" data-store-id="${s.id}"><div class="side-similar-name-only"><span class="side-similar-store-name">${s.name}</span></div></div>`
    ).join('');

    container.querySelectorAll('.side-similar-item[data-store-id]').forEach(item => {
        item.addEventListener('click', () => {
            const store = dataStore.locations.find(l => String(l.id) === String(item.dataset.storeId));
            if (!store) return;
            state.endPoint = store;
            state.selectedLocation = store;
            const placeholder = $$('sidePanelSearchPlaceholder');
            if (placeholder) placeholder.textContent = store.name;
            if (isRouteMode) {
                eventBus.emit('sidePanel:showRouteMode');
            } else {
                eventBus.emit('sidePanel:showPreviewMode', store);
            }
        });
    });
}
