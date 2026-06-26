import { keyboardLayouts } from './layouts.js';

const BACKSPACE_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M21 4H9L3 12L9 20H21C21.5523 20 22 19.5523 22 19V5C22 4.44772 21.5523 4 21 4Z" stroke="currentColor" stroke-width="2"/>
    <path d="M17 9L11 15M11 9L17 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export function renderInlineKeyboard(language, container) {
    if (!container) return;

    const layout = keyboardLayouts[language];
    if (!layout) return;

    const isRTL = layout.rtl || false;
    const hasDualKeys = layout.hasDualKeys || false;

    let html = '';

    html += '<div class="keyboard-row numbers-row">';
    ['&', '.'].forEach(ch => {
        html += `<button class="inline-key special-char-key" data-key="${ch}">${ch}</button>`;
    });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach(n => {
        html += `<button class="inline-key number-key" data-key="${n}">${n}</button>`;
    });
    ['-', '/'].forEach(ch => {
        html += `<button class="inline-key special-char-key" data-key="${ch}">${ch}</button>`;
    });
    html += '</div>';

    layout.letters.forEach(row => {
        html += `<div class="keyboard-row ${isRTL ? 'rtl' : ''}">`;
        row.forEach(key => {
            if (hasDualKeys && key.main) {
                html += `<button class="inline-key chinese-key" data-key="${key.main}">
                    <span class="key-main">${key.main}</span>
                    <span class="key-sub">${key.sub}</span>
                </button>`;
            } else {
                html += `<button class="inline-key" data-key="${key}">${key}</button>`;
            }
        });
        html += '</div>';
    });

    html += `<div class="keyboard-row">`;
    html += `<button class="inline-key special" data-key="Backspace">${BACKSPACE_SVG}</button>`;
    html += `<button class="inline-key space-key" data-key="Space">Space</button>`;
    html += `</div>`;

    container.innerHTML = html;
}

export function attachKeyListeners(container, onKeyPress) {
    if (!container) return;
    const keys = container.querySelectorAll('.inline-key, .keyboard-lang-btn');
    keys.forEach(key => {
        key.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onKeyPress(key.dataset.key);
        });
    });
}
