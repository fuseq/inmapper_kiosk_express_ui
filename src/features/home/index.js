import { eventBus } from '../../core/event-bus.js';
import { state } from '../../core/state.js';
import { config } from '../../core/config.js';
import { getAvailableCategories } from '../data/category-service.js';
import { iconHTML, renderIcons } from '../../core/icon.js';
import { initSlideshow, show as showSlideshow, hide as hideSlideshow, startAutoPlay } from './mini-slideshow.js';

/* Home category cards are generated from the live (Sheets-backed) category
 * mapping — the static cards in index.html are only a pre-data placeholder.
 * `features.home.visibleCategories` is a KIOSK-ONLY whitelist: it narrows
 * these start-screen cards but never touches the mobile grid or the
 * web island/panel (they call getAvailableCategories() directly). */
function renderHomeCategoryCards() {
    const cardsContainer = document.querySelector('.home-category-cards');
    if (!cardsContainer) return;
    let cats = getAvailableCategories();
    if (!cats.length) return;     // data not loaded yet — keep placeholder

    const visible = config.features.home?.visibleCategories;
    if (Array.isArray(visible) && visible.length > 0) {
        const set = new Set(visible.map(String));
        cats = cats.filter(c => set.has(String(c.apiKey)));
        if (!cats.length) { cardsContainer.style.display = 'none'; return; }
    }

    cardsContainer.innerHTML = '';
    cats.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.dataset.category = cat.apiKey;
        card.innerHTML = `
            <div class="category-card-icon">${iconHTML(cat.icon, { size: 42 })}</div>
            <span class="category-card-label">${cat.displayName}</span>`;
        card.addEventListener('click', () => eventBus.emit('search:openWithCategory', cat.apiKey));
        cardsContainer.appendChild(card);
    });
    cardsContainer.style.display = '';
    renderIcons();
}

function showInitialHome() {
    state.currentView = 'initial';
    eventBus.emit('home:show');
    if (config.features.home.slideshow) showSlideshow();

    const home = document.getElementById('initialHome');
    if (home) {
        home.style.opacity = '1';
        home.style.visibility = 'visible';
        home.style.pointerEvents = 'auto';
        home.classList.remove('search-mode');
    }

    const searchTab = document.getElementById('searchTab');
    if (searchTab) {
        searchTab.classList.remove('open');
        // Other flows (map:explore, navigation:startRoute) set inline
        // opacity/visibility/pointer-events on the search tab to force
        // it out of the way. Clear them when returning to home so the
        // tab can fade back in normally on the next search.
        searchTab.style.opacity = '';
        searchTab.style.visibility = '';
        searchTab.style.pointerEvents = '';
        searchTab.style.transition = '';
    }

    const floorSel = document.getElementById('floorSelectorCompact');
    const mapFloorSel = document.getElementById('mapFloorSelectorCompact');
    if (floorSel) floorSel.style.display = 'none';
    if (mapFloorSel) mapFloorSel.style.display = 'none';

    const backBtn = document.getElementById('mapBackBtn');
    if (backBtn) backBtn.style.display = 'none';

    const sidePanel = document.getElementById('mapSidePanel');
    if (sidePanel) sidePanel.classList.add('hidden');

    const mapContainer = document.getElementById('mapContainer');
    if (mapContainer) mapContainer.classList.remove('panel-visible-left', 'panel-visible-right');

    if (config.features.home.slideshow) startAutoPlay();

    const mapPanel = document.getElementById('mapPanel');
    if (window.parent && window.parent !== window && searchTab && !searchTab.classList.contains('open') && mapPanel && !mapPanel.classList.contains('visible')) {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type: 'HIDE_ROUTE', data: {} }, '*');
        }
    }
}

export function init() {
    const homeConfig = config.features.home;

    if (homeConfig.slideshow) {
        initSlideshow();
    } else {
        const el = document.getElementById('homeMiniSlideshow');
        if (el) el.classList.add('hidden');
    }

    const searchTrigger = document.getElementById('homeSearchTrigger');
    if (searchTrigger) {
        if (homeConfig.searchBar === false) {
            searchTrigger.style.display = 'none';
        } else {
            searchTrigger.addEventListener('click', () => eventBus.emit('search:open'));
        }
    }

    const exploreBtn = document.getElementById('exploreMapBtn');
    if (exploreBtn) {
        if (homeConfig.exploreMapBtn === false) {
            exploreBtn.style.display = 'none';
        } else {
            exploreBtn.addEventListener('click', () => eventBus.emit('map:explore'));
        }
    }

    const cardsContainer = document.querySelector('.home-category-cards');
    if (homeConfig.categoryCards === false) {
        if (cardsContainer) cardsContainer.style.display = 'none';
    } else {
        // Placeholder cards (pre-data) should still respond to taps.
        document.querySelectorAll('.home-category-cards .category-card').forEach(card => {
            card.addEventListener('click', () => {
                const cat = card.dataset.category;
                if (cat) eventBus.emit('search:openWithCategory', cat);
            });
        });
        renderHomeCategoryCards();
        eventBus.on('locations:loaded', renderHomeCategoryCards);
        eventBus.on('categories:updated', renderHomeCategoryCards);
    }

    eventBus.on('idle:timeout', () => {
        if (config.initialView === 'web') return;
        showInitialHome();
    });
    eventBus.on('home:requestShow', showInitialHome);
    eventBus.on('search:open', hideSlideshow);
    eventBus.on('search:openWithCategory', hideSlideshow);
    eventBus.on('navigation:startRoute', hideSlideshow);
    eventBus.on('map:explore', hideSlideshow);

    if (config.initialView !== 'web') {
        showInitialHome();
    }
}

export function destroy() {}

export { showInitialHome };
