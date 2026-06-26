/**
 * Generic icon resolver — supports two kinds of inputs:
 *
 *   1. Emoji / Unicode glyph  (👕, 🍔, 💎, …)
 *      Returned verbatim wrapped in a <span>; no Lucide needed.
 *
 *   2. Lucide icon name       ("gem", "shopping-bag", "shirt", …)
 *      Returned as an `<i data-lucide="…">` marker which the Lucide
 *      runtime swaps for an inline SVG when `renderIcons()` is called.
 *
 * Empty / unknown values fall back to a neutral dot so layout doesn't
 * collapse. Callers are expected to invoke `renderIcons(host?)` AFTER
 * the markup has been inserted into the DOM so the markers can be
 * hydrated. The hydrator is idempotent and cheap, so call it freely
 * after every render pass.
 *
 * Lucide is loaded from CDN in editor.html / index.html. The helper
 * degrades gracefully if Lucide hasn't loaded yet (markers stay as
 * `<i>` placeholders until the script becomes available, at which
 * point a queued retry hydrates them).
 */

/* A value is treated as an emoji/glyph if it contains any non-ASCII
 * character or any ASCII char other than letters/dash/underscore (so
 * "shopping-cart" stays a Lucide name, but "🛒" or "→" become spans). */
const NAME_RE = /^[a-z][a-z0-9_-]*$/i;

/* Detects http(s):// URLs and `data:image/…;base64,…` payloads. We
 * render these as <img> instead of Lucide markers so the editor can
 * upload arbitrary PNG/SVG/JPG icons for categories. */
const IMG_RE = /^(https?:\/\/|data:image\/|\.?\/|[a-z0-9_\-]+\.(png|jpe?g|svg|webp|gif))/i;

export function iconHTML(value, opts = {}) {
    const size = opts.size || 16;
    const cls  = opts.className || 'ic';
    const raw  = String(value ?? '').trim();
    if (!raw) {
        return `<span class="${cls} ${cls}-empty" aria-hidden="true">·</span>`;
    }
    if (IMG_RE.test(raw)) {
        /* Custom image (URL, data URL, or relative asset path). */
        return `<span class="${cls} ${cls}-img" style="width:${size}px;height:${size}px"><img src="${escapeAttr(raw)}" alt="" loading="lazy" decoding="async"></span>`;
    }
    if (NAME_RE.test(raw)) {
        /* Looks like a Lucide kebab-case name. Lucide is case-sensitive
         * and only matches kebab-case ("ShoppingBag" → "shopping-bag"),
         * so normalise first: lowercase, and split camelCase into dashes. */
        const norm = raw
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/_/g, '-')
            .toLowerCase();
        return `<i data-lucide="${escapeAttr(norm)}" class="${cls}" style="width:${size}px;height:${size}px"></i>`;
    }
    /* Anything else (emoji, kanji, punctuation, etc.) renders inline.
     * Pass the same numeric size as `font-size` so emoji visually match
     * the Lucide SVG sibling next to them. */
    return `<span class="${cls} ${cls}-glyph" aria-hidden="true" style="font-size:${size}px;line-height:1">${escapeHtml(raw)}</span>`;
}

/** Decide if a given value should render as a Lucide marker. Useful when
 *  building DOM nodes programmatically rather than via innerHTML. */
export function isLucideName(value) {
    const raw = String(value ?? '').trim();
    return !!raw && !IMG_RE.test(raw) && NAME_RE.test(raw);
}

/** Decide if a given value is an image reference (URL / data URL / path). */
export function isImageRef(value) {
    const raw = String(value ?? '').trim();
    return !!raw && IMG_RE.test(raw);
}

/* ─────────────────────── runtime hydration ─────────────────────── */

let pending = false;

/**
 * Walk the DOM and replace every `<i data-lucide="…">` with an inline
 * SVG. Idempotent — Lucide skips already-replaced markers. Calling this
 * before the CDN script has loaded queues a retry; multiple invocations
 * collapse into a single queued retry.
 */
export function renderIcons(/* root */ _) {
    const lucide = typeof window !== 'undefined' ? window.lucide : null;
    if (lucide && typeof lucide.createIcons === 'function') {
        try { lucide.createIcons(); } catch (e) { console.warn('[icon] createIcons failed', e); }
        return;
    }
    if (pending) return;
    pending = true;
    const start = Date.now();
    const tryAgain = () => {
        const lib = typeof window !== 'undefined' ? window.lucide : null;
        if (lib && typeof lib.createIcons === 'function') {
            try { lib.createIcons(); } catch (e) { console.warn('[icon] createIcons failed', e); }
            pending = false;
            return;
        }
        if (Date.now() - start > 6000) {
            pending = false;
            console.warn('[icon] Lucide failed to load within 6 s');
            return;
        }
        setTimeout(tryAgain, 80);
    };
    tryAgain();
}

/* ─────────────────────── helpers ─────────────────────── */

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) {
    return s.replace(/[<>"']/g, c => ({'<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
