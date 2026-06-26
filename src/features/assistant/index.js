/**
 * Mobile assistant feature.
 *
 * A conversational, voice-capable panel that lives inside the mobile bottom
 * sheet (a dedicated `assistant` mode in sheet-content). It resolves a
 * destination (and, when needed, a start point) from natural language using
 * the live venue dataset, then drives the existing routing pipeline and shows
 * the route stages in-chat (see route-flow.js).
 *
 * Coexists with the classic `ms-nav` flow — it never replaces it.
 */

import { config } from '../../core/config.js';
import { state, dataStore } from '../../core/state.js';
import { eventBus } from '../../core/event-bus.js';
import { getLocationDisplayName } from '../../core/utils.js';
import { chat } from './chat.js';
import { withDative } from './suffix.js';
import * as nlp from './nlp.js';
import * as voice from './voice.js';
import * as routeFlow from './route-flow.js';

const SVG = {
    mic: '<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="2"/><path d="M5 11a7 7 0 0014 0M12 18v3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

const T = {
    tr: {
        placeholder: 'Bir mağaza veya yön sorun…',
        welcome: 'Merhaba! Size nasıl yardımcı olabilirim? Bir mağaza adı söyleyin, sizi oraya yönlendireyim.',
        greet: 'Merhaba! Nereye gitmek istersiniz?',
        notFound: 'Üzgünüm, bunu bulamadım. Başka bir şekilde söyler misiniz?',
        didYouMean: 'Şunu mu demek istediniz?',
        askStart: (d) => `${d} gidiyoruz, harika seçim! Şu an neredesiniz? Başlangıç noktanızı seçin:`,
        starting: (d) => `Harika! ${d} rotanız çiziliyor.`,
        catFound: (c) => `${c} kategorisinde şunları buldum. Hangisine gidelim?`,
        facFound: (f) => `En yakın ${f} seçeneklerini buldum. Hangisine gidelim?`,
        nothingHere: 'Şu an gösterebileceğim bir sonuç yok.',
        floorAll: 'Kat',
    },
    en: {
        placeholder: 'Ask for a store or directions…',
        welcome: 'Hi! How can I help? Tell me a store name and I will guide you there.',
        greet: 'Hello! Where would you like to go?',
        notFound: 'Sorry, I could not find that. Could you rephrase?',
        didYouMean: 'Did you mean?',
        askStart: (d) => `${d}, great choice. Where are you now? Pick your start point:`,
        starting: (d) => `Great! Drawing your route to ${d}.`,
        catFound: (c) => `Here is what I found in ${c}. Which one?`,
        facFound: (f) => `I found the nearest ${f} options. Which one?`,
        nothingHere: 'I have no results to show right now.',
        floorAll: 'Floor',
    },
};

let lang = 'tr';
let panelEl = null;
let historyEl = null;
let inputEl = null;
let micBtn = null;
let welcomeId = null;

const convo = { mode: 'idle', destination: null, startLocation: null };

function t() { return T[lang] || T.tr; }

function isAutoStart() {
    return (config.features.navigation?.startPointMode || 'auto') === 'auto';
}

function locById(id) {
    return (dataStore.locations || []).find(l => String(l.id) === String(id)) || null;
}

function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function say(text, { speak: doSpeak = true } = {}, html = null) {
    chat.addAssistant(text, html);
    if (doSpeak) voice.speak(text, lang);
}

/* ── location chip lists ─────────────────────────────────────────────── */
function chipListHtml(locs, purpose) {
    const items = locs.slice(0, 40).map(l => {
        const name = getLocationDisplayName(l);
        return `<button class="asst-chip" data-loc-id="${escapeHtml(l.id)}" data-purpose="${purpose}">${escapeHtml(name)}</button>`;
    }).join('');
    return `<div class="asst-chip-list">${items}</div>`;
}

function startOptionsHtml(excludeId) {
    const locs = (dataStore.locations || []).filter(l => String(l.id) !== String(excludeId));
    const groups = new Map();
    const floorKeyOf = new Map();
    for (const l of locs) {
        const key = l.floor || (lang === 'en' ? 'Floor' : 'Kat');
        if (!groups.has(key)) { groups.set(key, []); floorKeyOf.set(key, parseInt(l.floorKey, 10)); }
        groups.get(key).push(l);
    }
    const ordered = [...groups.keys()].sort((a, b) => {
        const ka = floorKeyOf.get(a); const kb = floorKeyOf.get(b);
        if (Number.isFinite(ka) && Number.isFinite(kb)) return ka - kb;
        return String(a).localeCompare(String(b));
    });
    let html = '<div class="asst-loc-scroll">';
    for (const key of ordered) {
        html += `<div class="asst-loc-group"><div class="asst-loc-group-head">${escapeHtml(key)}</div>`;
        html += groups.get(key).map(l =>
            `<button class="asst-chip wide" data-loc-id="${escapeHtml(l.id)}" data-purpose="start">${escapeHtml(getLocationDisplayName(l))}</button>`,
        ).join('');
        html += '</div>';
    }
    html += '</div>';
    return html;
}

/* ── conversation steps ──────────────────────────────────────────────── */
/** Destination name with correct Turkish dative ("Zara'ya") for spoken/written
 *  phrasing; falls back to the plain display name in English. */
function destPhrase(loc) {
    return lang === 'tr' ? withDative(loc.name || getLocationDisplayName(loc)) : getLocationDisplayName(loc);
}

function chooseDestination(loc) {
    convo.destination = loc;
    // Mirror the manual flow: register the destination and fly the map to it.
    state.selectedLocation = loc;
    state.endPoint = loc;
    eventBus.emit('routePoint:updated', { point: 'end', location: loc });
    eventBus.emit('location:selected', { locationId: loc.id, fromMap: false });

    if (isAutoStart()) {
        convo.startLocation = config.venue.kioskLocation;
        drawRoute();
        return;
    }
    convo.mode = 'awaiting_start';
    const ask = t().askStart(destPhrase(loc));
    say(ask, { speak: true }, `${escapeHtml(ask)}${startOptionsHtml(loc.id)}`);
}

function setStart(loc) {
    convo.startLocation = loc;
    state.startPoint = loc;
    eventBus.emit('routePoint:updated', { point: 'start', location: loc });
    // Like the normal flow: picking the start draws the route immediately.
    drawRoute();
}

function drawRoute() {
    const start = convo.startLocation;
    const dest = convo.destination;
    if (!start || !dest) return;
    state.startPoint = start;
    state.endPoint = dest;
    say(t().starting(destPhrase(dest)));
    routeFlow.startRoute({ fromId: start.id, toId: dest.id, startPoint: start });
    convo.mode = 'idle';
    convo.destination = null;
    convo.startLocation = null;
}

function resetConvo() {
    convo.mode = 'idle';
    convo.destination = null;
    convo.startLocation = null;
}

/* ── main text processing ────────────────────────────────────────────── */
function process(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    chat.addUser(clean);

    if (convo.mode === 'awaiting_start') {
        const unit = nlp.findLocationInText(clean);
        if (unit) return setStart(unit);
        const sugg = nlp.suggestLocations(clean, 3);
        if (sugg.length) return say(t().didYouMean, { speak: false }, `${escapeHtml(t().didYouMean)}${chipListHtml(sugg, 'start')}`);
        return say(lang === 'en' ? 'Pick a start point from the list above.' : 'Lütfen yukarıdaki listeden başlangıç noktanızı seçin.');
    }

    // Fresh intent.
    const intent = nlp.detectIntent(clean);
    if (intent === 'greet') return say(t().greet);

    const facility = nlp.detectFacility(clean);
    if (facility) {
        const locs = nlp.findFacilities(facility.type);
        if (locs.length) {
            const label = facility.label[lang] || facility.label.tr;
            return say(t().facFound(label), { speak: true }, `${escapeHtml(t().facFound(label))}${chipListHtml(locs, 'dest')}`);
        }
    }

    const category = nlp.detectCategory(clean);
    if (category) {
        const locs = nlp.filterByCategory(category.keys);
        if (locs.length) {
            const label = category.label[lang] || category.label.tr;
            return say(t().catFound(label), { speak: true }, `${escapeHtml(t().catFound(label))}${chipListHtml(locs, 'dest')}`);
        }
    }

    const unit = nlp.findLocationInText(clean);
    if (unit) return chooseDestination(unit);

    const sugg = nlp.suggestLocations(clean, 3);
    if (sugg.length) {
        return say(t().didYouMean, { speak: false }, `${escapeHtml(t().didYouMean)}${chipListHtml(sugg, 'dest')}`);
    }
    return say(t().notFound);
}

/* ── chip / action delegation ────────────────────────────────────────── */
function onPanelClick(e) {
    const chip = e.target.closest('[data-loc-id]');
    if (chip) {
        const loc = locById(chip.dataset.locId);
        if (!loc) return;
        const name = getLocationDisplayName(loc);
        chat.addUser(name);
        if (chip.dataset.purpose === 'start') setStart(loc);
        else chooseDestination(loc);
        return;
    }

    const sugg = e.target.closest('[data-suggestion]');
    if (sugg) { process(sugg.dataset.suggestion); return; }

    const action = e.target.closest('[data-action]');
    if (!action) return;
    switch (action.dataset.action) {
        case 'stage-next': routeFlow.next(); break;
        case 'stage-prev': routeFlow.prev(); break;
        case 'stage-go': routeFlow.goTo(parseInt(action.dataset.idx, 10)); break;
    }
}

/* ── voice ───────────────────────────────────────────────────────────── */
function setListening(on) {
    const box = panelEl?.querySelector('.asst-input-box');
    if (box) box.classList.toggle('listening', on);
    if (micBtn) micBtn.classList.toggle('listening', on);
}

function toggleMic() {
    if (voice.isListening()) { voice.stopListening(); return; }
    voice.startListening({
        lang,
        onState: (s) => setListening(s === 'start'),
        onError: () => setListening(false),
        onResult: (transcript) => { if (inputEl) inputEl.value = ''; process(transcript); },
    });
}

/* ── suggestions / welcome ───────────────────────────────────────────── */
function suggestionList() {
    const fromCfg = config.features.assistant?.suggestions;
    if (Array.isArray(fromCfg) && fromCfg.length) return fromCfg;
    return lang === 'en'
        ? ['Where is the restroom?', 'I want to eat', 'Take me to the entrance']
        : ['Tuvalet nerede?', 'Yemek yemek istiyorum', 'Beni girişe götür'];
}

function renderSuggestions() {
    const box = panelEl?.querySelector('#asstSuggestions');
    if (!box) return;
    const chips = suggestionList()
        .map(s => `<button class="asst-suggestion" data-suggestion="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
        .join('');
    // Duplicated set → seamless left-to-right marquee (CSS animation).
    box.innerHTML = `<div class="asst-suggestions-track">${chips}${chips}</div>`;
}

/* ── public API ──────────────────────────────────────────────────────── */
function buildPanel(container) {
    container.innerHTML = `
        <div class="asst-panel">
            <div class="asst-history" id="asstHistory"></div>
            <div class="asst-suggestions" id="asstSuggestions"></div>
            <div class="asst-input-row">
                <button class="asst-lang" id="asstLang" type="button" aria-label="Dil">${lang.toUpperCase()}</button>
                <div class="asst-input-box">
                    <input type="text" id="asstInput" autocomplete="off" placeholder="${t().placeholder}">
                    <div class="asst-wave" aria-hidden="true">
                        <span></span><span></span><span></span><span></span><span></span>
                    </div>
                </div>
                ${voice.isRecognitionSupported() ? `<button class="asst-mic" id="asstMic" type="button" aria-label="Sesle sor">${SVG.mic}</button>` : ''}
                <button class="asst-send" id="asstSend" type="button" aria-label="Gönder">${SVG.send}</button>
            </div>
        </div>`;

    panelEl = container.querySelector('.asst-panel');
    historyEl = container.querySelector('#asstHistory');
    inputEl = container.querySelector('#asstInput');
    micBtn = container.querySelector('#asstMic');

    chat.bind(historyEl);
    renderSuggestions();

    panelEl.addEventListener('click', onPanelClick);

    const sendBtn = container.querySelector('#asstSend');
    const submit = () => {
        const v = inputEl.value.trim();
        if (!v) return;
        inputEl.value = '';
        process(v);
    };
    sendBtn.addEventListener('click', submit);
    inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

    if (micBtn) micBtn.addEventListener('click', toggleMic);

    const langBtn = container.querySelector('#asstLang');
    langBtn.addEventListener('click', () => {
        lang = lang === 'tr' ? 'en' : 'tr';
        routeFlow.setLang(lang);
        langBtn.textContent = lang.toUpperCase();
        if (inputEl) inputEl.placeholder = t().placeholder;
        renderSuggestions();
        // Keep the opening greeting in sync with the selected language.
        if (welcomeId != null) chat.update(welcomeId, `<div class="asst-msg-text">${escapeHtml(t().welcome)}</div>`);
    });

    if (chat.isEmpty()) welcomeId = chat.addAssistant(t().welcome);
}

export const assistant = {
    isEnabled() {
        return config.features.assistant?.enabled !== false;
    },

    init() {
        lang = config.features.assistant?.language === 'en' ? 'en' : 'tr';
        routeFlow.setLang(lang);
        routeFlow.init();
        // When a route the assistant did not start is cleared, drop our convo.
        eventBus.on('route:clear', () => { if (convo.mode !== 'idle') resetConvo(); });
    },

    /** Render the panel into the given container (called by sheet-content). */
    mount(container) {
        if (!container) return;
        buildPanel(container);
        requestAnimationFrame(() => inputEl?.focus());
    },
};

export function init() {
    assistant.init();
}
