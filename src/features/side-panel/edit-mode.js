import { state } from '../../core/state.js';
import { formatPhoneNumber } from '../../core/utils.js';
import { getCategoryDisplayNames } from '../data/category-service.js';

function $$(id) { return document.getElementById(id); }

export function enterEditMode() {
    const location = state.endPoint;
    if (!location) return;
    state.isEditMode = true;

    const editBtn = $$('sidePanelEditBtn');
    if (editBtn) { const span = editBtn.querySelector('span'); if (span) span.textContent = 'İptal'; }

    const similar = $$('sidePanelSimilarStoresSection');
    if (similar) similar.classList.add('hidden');

    const drawBtn = $$('sideDrawRouteBtn');
    const submitBtn = $$('sideSubmitEditBtn');
    if (drawBtn) drawBtn.classList.add('hidden');
    if (submitBtn) submitBtn.classList.remove('hidden');

    const nameEl = $$('sidePanelStoreName');
    const nameInput = $$('sidePanelStoreNameInput');
    if (nameEl) nameEl.classList.add('hidden');
    if (nameInput) { nameInput.classList.remove('hidden'); nameInput.value = location.name || ''; }

    const descEl = $$('sidePanelStoreDescription');
    const descInput = $$('sidePanelStoreDescriptionInput');
    if (descEl) descEl.classList.add('hidden');
    if (descInput) { descInput.classList.remove('hidden'); descInput.value = location.description || ''; }

    const phoneNum = $$('sidePanelPhoneNumber');
    const phoneInput = $$('sidePanelPhoneNumberInput');
    if (phoneNum) phoneNum.classList.add('hidden');
    if (phoneInput) { phoneInput.classList.remove('hidden'); phoneInput.value = formatPhoneNumber(location.telephone) || ''; }

    document.querySelectorAll('.side-store-tag-remove').forEach(b => b.classList.remove('hidden'));

    const catCard = $$('sideCategorySelectionCard');
    if (catCard) catCard.classList.remove('hidden');
}

export function exitEditMode() {
    state.isEditMode = false;

    if (state.endPoint) {
        const names = getCategoryDisplayNames(state.endPoint.apiCategories);
        state.selectedCategories = [...names];
        const tagsEl = $$('sidePanelStoreTags');
        if (tagsEl) {
            tagsEl.innerHTML = names.map(t =>
                `<span class="side-store-tag">${t}<button class="side-store-tag-remove hidden" data-tag="${t}"><svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></span>`
            ).join('');
        }
    }

    const editBtn = $$('sidePanelEditBtn');
    if (editBtn) { const span = editBtn.querySelector('span'); if (span) span.textContent = 'Düzenle'; }

    const similar = $$('sidePanelSimilarStoresSection');
    if (similar) similar.classList.remove('hidden');

    const drawBtn = $$('sideDrawRouteBtn');
    const submitBtn = $$('sideSubmitEditBtn');
    if (drawBtn) drawBtn.classList.remove('hidden');
    if (submitBtn) submitBtn.classList.add('hidden');

    const nameEl = $$('sidePanelStoreName');
    const nameInput = $$('sidePanelStoreNameInput');
    if (nameEl) nameEl.classList.remove('hidden');
    if (nameInput) nameInput.classList.add('hidden');

    const descEl = $$('sidePanelStoreDescription');
    const descInput = $$('sidePanelStoreDescriptionInput');
    if (descEl) descEl.classList.remove('hidden');
    if (descInput) descInput.classList.add('hidden');

    const phoneNum = $$('sidePanelPhoneNumber');
    const phoneInput = $$('sidePanelPhoneNumberInput');
    if (phoneNum) phoneNum.classList.remove('hidden');
    if (phoneInput) phoneInput.classList.add('hidden');

    document.querySelectorAll('.side-store-tag-remove').forEach(b => b.classList.add('hidden'));

    const catCard = $$('sideCategorySelectionCard');
    if (catCard) catCard.classList.add('hidden');
}

export function toggleEditMode() {
    if (!state.endPoint) return;
    if (state.isEditMode) exitEditMode();
    else enterEditMode();
}

export function init() {}
export function destroy() {}
