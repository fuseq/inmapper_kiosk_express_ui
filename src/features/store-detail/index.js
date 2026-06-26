import { eventBus } from '../../core/event-bus.js';
import { state, dataStore } from '../../core/state.js';
import { getLocationDisplayName, formatPhoneNumber } from '../../core/utils.js';
import { config } from '../../core/config.js';
import { featureLoader } from '../../core/feature-loader.js';
import { iconHTML, renderIcons } from '../../core/icon.js';
import { buildRouteQrImageUrl } from '../navigation/qr-service.js';
import { getInterfaceProfile } from '../../core/interface-profile.js';
import { buildDetailSectionsHTML, wireDetailSections } from './detail-sections.js';

function setStoreDetailChrome(open) {
    const searchTab = document.getElementById('searchTab');
    const home = document.getElementById('initialHome');
    searchTab?.classList.toggle('store-detail-open', open);
    home?.classList.toggle('store-detail-open', open);
}

function showStoreDetail(location) {
    const searchContent = document.getElementById('searchContent');
    const detailContent = document.getElementById('storeDetailContent');
    if (!searchContent || !detailContent) return;

    searchContent.classList.add('hidden');
    detailContent.classList.remove('hidden');
    detailContent.classList.add('active');

    // The store-detail lives inside the search tab overlay. On kiosk the
    // tab is already open (user came in through the search flow); on web
    // the user clicks the map directly, so we must open the tab ourselves
    // — otherwise `storeDetailContent.active` is hidden behind
    // `.search-tab { transform: scaleY(0) }`.
    const searchTab = document.getElementById('searchTab');
    if (searchTab && !searchTab.classList.contains('open')) {
        searchTab.classList.add('open');
    }
    setStoreDetailChrome(true);

    const setT = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
    const setH = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };

    const logoEl = document.getElementById('storeLogoIcon');
    if (logoEl) {
        if (location.logo) {
            logoEl.innerHTML = `<img src="${location.logo}" alt="${getLocationDisplayName(location)}">`;
        } else {
            logoEl.innerHTML = iconHTML(location.icon || 'store', { size: 36 });
            renderIcons();
        }
    }

    setT('storeName', getLocationDisplayName(location));
    setT('storeFloor', location.floor);

    const hoursChip = document.getElementById('storeHoursChip');
    if (hoursChip) {
        if (location.hours) { hoursChip.textContent = location.hours; hoursChip.style.display = ''; }
        else { hoursChip.style.display = 'none'; }
    }

    const tagsEl = document.getElementById('storeTags');
    if (tagsEl) {
        tagsEl.innerHTML = (location.apiCategories || [location.type]).map(c =>
            `<span class="store-tag">${c}</span>`
        ).join('');
    }

    setT('storeDescription', location.description || 'Bu mağaza hakkında detaylı bilgi yakında eklenecektir.');

    // Unified collapsible sections (gallery / hours / details / categories /
    // recommendations). Supersede the legacy Description + Similar cards, which
    // we hide to avoid duplication.
    const sectionsHost = document.getElementById('storeDetailSections');
    if (sectionsHost) {
        sectionsHost.innerHTML = buildDetailSectionsHTML(location, {
            descriptionFallback: 'Bu mağaza hakkında detaylı bilgi yakında eklenecektir.',
        });
        renderIcons();
        wireDetailSections(sectionsHost, location, {
            onRelatedClick: (store) => {
                state.endPoint = store;
                eventBus.emit('location:selected', { location: store });
            },
        });
        const descCard = document.getElementById('storeDescriptionCard');
        const simCard = document.getElementById('storeSimilarCard');
        if (descCard) descCard.style.display = 'none';
        if (simCard) simCard.style.display = 'none';
    }

    const phoneBtn = document.getElementById('storePhoneBtn');
    const phoneNum = document.getElementById('storePhoneNumber');
    if (phoneBtn && phoneNum) {
        if (location.telephone) {
            phoneBtn.style.display = '';
            phoneNum.textContent = formatPhoneNumber(location.telephone);
        } else {
            phoneBtn.style.display = 'none';
        }
    }

    const qrEl = document.getElementById('storeQRCode');
    if (qrEl) {
        /* `state.endPoint` is set by the `location:selected` handler
         * (or the map-click fallback below) right before this runs, so
         * `buildRouteQrImageUrl` resolves to the same location we are
         * rendering here. */
        const src = buildRouteQrImageUrl(200);
        if (src) qrEl.src = src;
    }

    const mapMod = featureLoader.getModule('map');
    if (mapMod) {
        const { mapRenderer } = mapMod;
        const storeContainer = document.getElementById('storeFloorMapContainer');

        const zoomToLocation = () => {
            if (mapRenderer.storeMap) {
                mapRenderer.storeMap.resize();
                if (dataStore.locations.length > 0) {
                    mapRenderer.updateLabelsFromLocations(dataStore.locations, mapRenderer.storeMap);
                }
                mapRenderer.zoomToFeature(mapRenderer.storeMap, location.id);
            }
        };

        if (storeContainer && !mapRenderer.storeMap) {
            setTimeout(async () => {
                await mapRenderer.initStoreMap('storeFloorMapContainer');
                zoomToLocation();
            }, 100);
        } else {
            zoomToLocation();
        }
    }
}

function hideStoreDetail() {
    const searchContent = document.getElementById('searchContent');
    const detailContent = document.getElementById('storeDetailContent');
    if (searchContent) searchContent.classList.remove('hidden');
    if (detailContent) { detailContent.classList.add('hidden'); detailContent.classList.remove('active'); }
    setStoreDetailChrome(false);

    // In web mode we auto-opened the search tab when the detail appeared —
    // close it again so the map returns to an uncluttered state.
    if (config.initialView === 'web') {
        const searchTab = document.getElementById('searchTab');
        if (searchTab) searchTab.classList.remove('open');
    }
}

export function init() {
    eventBus.on('location:selected', ({ locationId, fromMap }) => {
        const location = dataStore.locations.find(l => String(l.id) === String(locationId));
        if (!location) return;

        state.selectedLocation = location;
        state.endPoint = location;

        const display = document.getElementById('endPointDisplay');
        if (display) display.textContent = location.name;

        const isAuto = (config.features.navigation?.startPointMode || 'auto') === 'auto';
        if (!state.startPoint && isAuto) state.startPoint = config.venue.kioskLocation;

        eventBus.emit('routePoint:updated', { point: 'end', location });

        if (fromMap && state.currentView === 'map') return;

        /* The kiosk store-detail tab is a kiosk-only surface. On interfaces
         * without it (web) the inline island detail handles selection, so
         * never open the tab here even if this feature was loaded. */
        if (!getInterfaceProfile(config.initialView).storeDetailTab) return;

        showStoreDetail(location);
    });

    eventBus.on('storeDetail:hide', hideStoreDetail);

    const backBtn = document.getElementById('storeMapBackBtn');
    if (backBtn) backBtn.addEventListener('click', hideStoreDetail);

    const headingBtn = document.getElementById('startHeadingBtn');
    if (headingBtn) {
        headingBtn.addEventListener('click', () => {
            // Make sure state is populated before anyone acts on the event.
            // If the store-detail was opened via a direct click on the map
            // we may not have gone through the regular `location:selected`
            // flow that sets state.endPoint.
            if (!state.endPoint && state.selectedLocation) {
                state.endPoint = state.selectedLocation;
            }
            const isAuto = (config.features.navigation?.startPointMode || 'auto') === 'auto';
            if (!state.startPoint && isAuto) {
                state.startPoint = config.venue?.kioskLocation || null;
            }
            eventBus.emit('navigation:startRoute');
        });
    }

    const routeSwitch = document.getElementById('storeRouteSwitch');
    if (routeSwitch) renderRouteSwitch(routeSwitch);
}

/* Build the route-type switch from `config.features.navigation.routeTypes`
 * (defaults to a 3-way: En Kısa / Asansörlü / Engelsiz). Replaces the
 * static 2-button + slider HTML in index.html with a pill bar where the
 * selected option carries an `.active` class — same pattern as the
 * island. Kept here (not authored at HTML time) so adding/removing
 * options stays a config-only change. */
const ROUTE_SWITCH_ICONS = {
    stepStraight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M8 9l4-4 4 4"/></svg>',
    stepRight:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M19 12l-7-7M19 12l-7 7"/></svg>',
    stepElevator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 16v-4l2 2 2-2v4M14 8l2-2 2 2M14 16l2 2 2-2"/></svg>',
    stepStairs:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4v-4h4v-4h4v-4h4"/></svg>',
};

function renderRouteSwitch(root) {
    const types = config.features?.navigation?.routeTypes || [
        { key: 'shortest',    label: 'En Kısa',   icon: 'stepStraight' },
        { key: 'least_turns', label: 'Az Dönüş', icon: 'stepRight' },
    ];
    const active = state.routeType || 'shortest';

    root.classList.remove('accessible');
    root.classList.add('rsw-pill');
    root.innerHTML = types.map(rt => `
        <button class="route-switch-btn ${rt.key === active ? 'active' : ''}" data-type="${rt.key}">
            ${ROUTE_SWITCH_ICONS[rt.icon] || ''}
            <span class="route-label">${rt.label}</span>
        </button>
    `).join('');

    root.querySelectorAll('.route-switch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            if (type === state.routeType) return;
            state.routeType = type;
            root.querySelectorAll('.route-switch-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.type === type)
            );
            eventBus.emit('route:typeChanged', type);
        });
    });
}

export function destroy() {}

export { showStoreDetail, hideStoreDetail };
