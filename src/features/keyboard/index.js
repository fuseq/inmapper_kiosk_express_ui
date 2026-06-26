import { eventBus } from '../../core/event-bus.js';
import { state } from '../../core/state.js';
import { renderInlineKeyboard, attachKeyListeners } from './inline-keyboard.js';

const PLACEHOLDERS = {
    tr: 'Nereye gitmek istersiniz?',
    en: 'Where would you like to go?',
    zh: '您想去哪里？',
    ar: 'أين تريد أن تذهب؟',
};

function getPlaceholderText() {
    return PLACEHOLDERS[state.keyboardLanguage] || PLACEHOLDERS.tr;
}

function updatePlaceholder() {
    const el = document.getElementById('searchPlaceholder');
    if (!el) return;

    const isRTL = state.keyboardLanguage === 'ar';
    el.style.direction = isRTL ? 'rtl' : 'ltr';
    el.style.textAlign = isRTL ? 'right' : 'left';
    el.style.unicodeBidi = 'embed';

    if (state.searchQuery) {
        el.textContent = state.searchQuery;
        el.style.color = 'var(--theme-text)';
        el.style.opacity = '';
    } else {
        el.textContent = getPlaceholderText();
        el.style.color = 'var(--theme-text)';
        el.style.opacity = '0.7';
    }
}

function handleInlineKeyPress(key) {
    if (key === 'Backspace') {
        state.searchQuery = state.searchQuery.slice(0, -1);
    } else if (key && key.startsWith('LANG_')) {
        changeLanguage(key.replace('LANG_', ''));
        return;
    } else if (key === 'Space') {
        state.searchQuery += ' ';
    } else {
        const lang = state.keyboardLanguage;
        if (lang === 'ar' || lang === 'zh' || /\d/.test(key)) {
            state.searchQuery += key;
        } else {
            state.searchQuery += key.toLowerCase();
        }
    }

    updatePlaceholder();
    eventBus.emit('keyboard:input', { query: state.searchQuery });
}

function renderKeyboard() {
    const container = document.querySelector('.inline-keyboard');
    renderInlineKeyboard(state.keyboardLanguage, container);
    attachKeyListeners(container, handleInlineKeyPress);
}

function changeLanguage(lang) {
    state.keyboardLanguage = lang;
    state.keyboardMode = 'letters';
    updatePlaceholder();
    renderKeyboard();
}

function showFullscreenKeyboard() {
    const kb = document.getElementById('keyboard');
    if (kb) kb.classList.remove('hidden');
    const display = document.getElementById('keyboardDisplay');
    if (display) display.value = state.searchQuery;
}

function hideFullscreenKeyboard() {
    const kb = document.getElementById('keyboard');
    if (kb) kb.classList.add('hidden');
}

export function init() {
    renderKeyboard();

    eventBus.on('search:opened', renderKeyboard);
    eventBus.on('search:cleared', () => {
        state.searchQuery = '';
        updatePlaceholder();
    });
    eventBus.on('idle:timeout', () => {
        state.keyboardLanguage = 'tr';
        state.keyboardMode = 'letters';
        hideFullscreenKeyboard();
        renderKeyboard();
        updatePlaceholder();
    });
}

export function destroy() {
    hideFullscreenKeyboard();
}

export { renderKeyboard, changeLanguage, showFullscreenKeyboard, hideFullscreenKeyboard, getPlaceholderText };
