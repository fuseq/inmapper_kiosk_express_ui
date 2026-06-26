/**
 * Bridges the assistant conversation to the app's existing routing pipeline.
 *
 * Coexist model: the assistant emits the same `route:draw` event the rest of
 * the app uses, then renders the resulting `describeSteps` as an in-chat stage
 * card with Previous / Next controls. Stepping re-uses `route:navStep`, so the
 * map highlight + floor sync are the existing ones — no new map code.
 *
 * The stage card is only injected for routes the assistant itself initiated
 * (`expecting`), leaving the normal mobile `ms-nav` flow untouched.
 */

import { eventBus } from '../../core/event-bus.js';
import { chat } from './chat.js';
import { speak } from './voice.js';

const STEP_SVG = {
    stepStart: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M10 22l2-7 2 7M8.5 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepEnd: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg>',
    stepStraight: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M8 9l4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepRight: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M15 8l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepLeft: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M9 8l-4 4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepElevator: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2"/><path d="M8 16v-4l2 2 2-2v4M14 8l2-2 2 2M14 16l2 2 2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepStairs: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4v-4h4v-4h4v-4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const T = {
    tr: {
        preparing: 'Rotanız hazırlanıyor…',
        ready: 'Rota hazır. Aşamalar arasında ilerleyebilirsiniz.',
        stage: (i, n) => `Aşama ${i} / ${n}`,
        prev: 'Önceki',
        next: 'Sonraki',
        arrived: 'Hedefe ulaştınız.',
        noSteps: 'Rota çizildi.',
    },
    en: {
        preparing: 'Preparing your route…',
        ready: 'Route ready. You can step through the stages.',
        stage: (i, n) => `Step ${i} / ${n}`,
        prev: 'Previous',
        next: 'Next',
        arrived: 'You have arrived.',
        noSteps: 'Route drawn.',
    },
};

let lang = 'tr';
let expecting = false;
let cardId = null;
let steps = [];
let stepIndex = 0;

function tt() { return T[lang] || T.tr; }

export function setLang(l) { lang = l === 'en' ? 'en' : 'tr'; }

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stageCardHtml() {
    const t = tt();
    const n = steps.length;
    const cur = steps[stepIndex] || {};
    const list = steps.map((s, i) => `
        <div class="asst-route-item ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}" data-action="stage-go" data-idx="${i}">
            <span class="asst-route-item-ic">${STEP_SVG[s.icon] || STEP_SVG.stepStraight}</span>
            <span class="asst-route-item-text">${escapeHtml(s.text)}</span>
        </div>`).join('');
    return `
        <div class="asst-route">
            <div class="asst-route-head">
                <span class="asst-route-head-ic">${STEP_SVG[cur.icon] || STEP_SVG.stepStraight}</span>
                <div>
                    <div class="asst-route-meta">${t.stage(stepIndex + 1, n)}${cur.floor ? ' · ' + escapeHtml(cur.floor) : ''}</div>
                    <div class="asst-route-head-text">${escapeHtml(cur.text || t.noSteps)}</div>
                </div>
            </div>
            <div class="asst-route-list">${list}</div>
            <div class="asst-route-ctrls">
                <button class="asst-route-btn" data-action="stage-prev" ${stepIndex === 0 ? 'disabled' : ''}>${t.prev}</button>
                <button class="asst-route-btn primary" data-action="stage-next" ${stepIndex >= n - 1 ? 'disabled' : ''}>${t.next}</button>
            </div>
        </div>`;
}

function renderCard() {
    if (cardId == null) {
        cardId = chat.addAssistant(tt().ready, stageCardHtml());
    } else {
        chat.update(cardId, stageCardHtml());
    }
    // Bring the active stage into view (its list scrolls; so does the chat).
    requestAnimationFrame(() => {
        const el = document.querySelector('.asst-route-item.active');
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
}

function emitNavStep() {
    eventBus.emit('route:navStep', { stepIndex });
}

/** Begin a route the assistant resolved. */
export function startRoute({ fromId, toId, startPoint }) {
    expecting = true;
    steps = [];
    stepIndex = 0;
    cardId = null;
    chat.addAssistant(tt().preparing);
    speak(tt().preparing, lang);
    eventBus.emit('route:draw', { fromId, toId, startPoint });
}

export function goTo(idx) {
    if (!steps.length) return;
    stepIndex = Math.max(0, Math.min(idx, steps.length - 1));
    renderCard();
    emitNavStep();
}

export function next() { goTo(stepIndex + 1); }
export function prev() { goTo(stepIndex - 1); }

export function isActive() { return cardId != null; }

export function init() {
    eventBus.on('route:result', (data) => {
        if (!expecting) return;
        expecting = false;
        steps = Array.isArray(data?.describeSteps) && data.describeSteps.length
            ? data.describeSteps
            : [{ icon: 'stepStraight', text: tt().noSteps }];
        stepIndex = 0;
        renderCard();
        const first = steps[0];
        if (first?.text) speak(first.text, lang);
    });

    eventBus.on('route:clear', () => {
        expecting = false;
        steps = [];
        stepIndex = 0;
        cardId = null;
    });
}
