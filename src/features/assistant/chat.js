/**
 * Chat transcript store + renderer for the mobile assistant.
 *
 * The message log lives in memory so the conversation survives bottom-sheet
 * mode switches (which clear the DOM). `bind()` (re)attaches a history element
 * and replays the log into it. Action buttons / chips inside a bubble carry
 * `data-*` attributes; click handling is delegated by the feature module.
 */

let historyEl = null;
const messages = [];
let seq = 0;

function timeLabel(d) {
    try {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function bubbleHtml(msg) {
    const body = msg.html != null ? msg.html : `<div class="asst-msg-text">${escapeHtml(msg.text)}</div>`;
    if (msg.role === 'user') {
        return `
            <div class="asst-msg user" data-mid="${msg.id}">
                <div class="asst-bubble">${body}</div>
            </div>`;
    }
    return `
        <div class="asst-msg assistant" data-mid="${msg.id}">
            <div class="asst-avatar">${ASSISTANT_AVATAR}</div>
            <div class="asst-bubble">${body}</div>
        </div>`;
}

const ASSISTANT_AVATAR = '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="7" width="16" height="12" rx="3" stroke="currentColor" stroke-width="2"/><path d="M12 7V3M9 13h.01M15 13h.01M9 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function renderOne(msg) {
    if (!historyEl) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = bubbleHtml(msg).trim();
    historyEl.appendChild(tmp.firstChild);
}

function scrollToBottom() {
    if (historyEl) historyEl.scrollTop = historyEl.scrollHeight;
}

export const chat = {
    /** Attach a history element and replay the existing transcript into it. */
    bind(el) {
        historyEl = el;
        if (!historyEl) return;
        historyEl.innerHTML = '';
        messages.forEach(renderOne);
        scrollToBottom();
    },

    addUser(text) {
        const msg = { id: ++seq, role: 'user', text, html: null, time: new Date() };
        messages.push(msg);
        renderOne(msg);
        scrollToBottom();
        return msg.id;
    },

    addAssistant(text, html = null) {
        const msg = { id: ++seq, role: 'assistant', text, html, time: new Date() };
        messages.push(msg);
        renderOne(msg);
        scrollToBottom();
        return msg.id;
    },

    /** Replace the inner content of an existing assistant message (in place). */
    update(id, html) {
        const msg = messages.find(m => m.id === id);
        if (msg) { msg.html = html; }
        if (historyEl) {
            const node = historyEl.querySelector(`[data-mid="${id}"] .asst-bubble`);
            if (node) node.innerHTML = html;
        }
        scrollToBottom();
    },

    remove(id) {
        const i = messages.findIndex(m => m.id === id);
        if (i !== -1) messages.splice(i, 1);
        const node = historyEl?.querySelector(`[data-mid="${id}"]`);
        if (node) node.remove();
    },

    clear() {
        messages.length = 0;
        if (historyEl) historyEl.innerHTML = '';
    },

    isEmpty() {
        return messages.length === 0;
    },
};
