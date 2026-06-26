import { state } from '../../core/state.js';
import { eventBus } from '../../core/event-bus.js';
import { getCategoryDisplayInfo } from '../data/category-service.js';
import { iconHTML, renderIcons } from '../../core/icon.js';

/* Compact icon + label chip for the side panel category filter. */
function buildSideChip(apiKey, label, icon, active, onClick) {
    const btn = document.createElement('button');
    btn.className = 'side-list-category-tab' + (active ? ' active' : '');
    btn.dataset.category = apiKey;
    btn.innerHTML = `<span class="side-cat-chip-ico">${iconHTML(icon, { size: 16 })}</span><span class="side-cat-chip-label">${label}</span>`;
    btn.addEventListener('click', onClick);
    return btn;
}

export function updateCategoryTabs(apiKeys, filterQuery = '') {
    const container = document.querySelector('.category-tabs-wrapper');
    if (!container) return;

    let filtered = apiKeys;
    if (filterQuery && filterQuery.trim()) {
        const q = filterQuery.toLowerCase();
        filtered = apiKeys.filter(key => {
            const info = getCategoryDisplayInfo(key);
            return info.label.toLowerCase().includes(q) || key.toLowerCase().includes(q);
        });
    }

    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'category-tab' + (state.selectedCategory === 'all' ? ' active' : '');
    allBtn.dataset.category = 'all';
    allBtn.textContent = 'Tümü';
    allBtn.addEventListener('click', () => selectCategory('all'));
    container.appendChild(allBtn);

    filtered.forEach(apiKey => {
        const info = getCategoryDisplayInfo(apiKey);
        const btn = document.createElement('button');
        btn.className = 'category-tab' + (state.selectedCategory === apiKey ? ' active' : '');
        btn.dataset.category = apiKey;
        btn.textContent = info.label;
        btn.addEventListener('click', () => selectCategory(apiKey));
        container.appendChild(btn);
    });
}

export function updateSidePanelCategoryTabs(apiKeys) {
    const container = document.querySelector('.side-list-category-tabs');
    if (!container) return;

    container.innerHTML = '';

    container.appendChild(buildSideChip('all', 'Tümü', 'layout-grid', state.sideListCategory === 'all', () => {
        state.sideListCategory = 'all';
        eventBus.emit('search:filter');
    }));

    apiKeys.forEach(apiKey => {
        const info = getCategoryDisplayInfo(apiKey);
        container.appendChild(buildSideChip(
            apiKey, info.label, info.icon, state.sideListCategory === apiKey,
            () => { state.sideListCategory = apiKey; eventBus.emit('search:filter'); },
        ));
    });

    renderIcons();
    refreshSidePanelCatsHint();
}

/* Toggle the "more below" fade/chevron on the category chip area, and keep
 * it in sync while the user scrolls. Safe to call repeatedly. */
export function refreshSidePanelCatsHint() {
    const tabs = document.querySelector('.side-list-category-tabs');
    const wrap = document.querySelector('.side-list-cats');
    if (!tabs || !wrap) return;

    const sync = () => {
        const more = tabs.scrollHeight - tabs.clientHeight - tabs.scrollTop > 4;
        wrap.classList.toggle('scrollable', more);
    };
    sync();

    if (!tabs.dataset.hintBound) {
        tabs.dataset.hintBound = '1';
        tabs.addEventListener('scroll', sync, { passive: true });
    }
}

function selectCategory(apiKey) {
    state.selectedCategory = apiKey;
    const tabs = document.querySelectorAll('.category-tabs-wrapper .category-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === apiKey);
    });
    eventBus.emit('category:changed', apiKey);
}
