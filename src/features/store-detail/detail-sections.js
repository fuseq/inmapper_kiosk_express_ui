/**
 * Shared collapsible detail sections for a unit/store, used by every detail
 * surface (kiosk tab, island panel, classic side panel, mobile sheet) so they
 * stay at feature parity with one implementation.
 *
 * Sections (each independently collapsible):
 *   - Görseller (image gallery; falls back to the single logo)
 *   - Çalışma Saatleri (structured per-day hours + live open/closed)
 *   - Detaylar (description)
 *   - Kategoriler (category tags)
 *   - Beğenebileceğiniz Yerler (manual `related` ids, else auto "similar")
 *
 * Markup uses a neutral `kd-*` class scheme styled once in
 * src/styles/detail-sections.css, so the layout reflows responsively and the
 * open/closed state animates consistently everywhere.
 */

import { dataStore } from '../../core/state.js';
import { getLocationDisplayName, formatPhoneNumber } from '../../core/utils.js';
import { getCategoryDisplayNames } from '../data/category-service.js';
import { hoursRows, isOpenNow, hoursTodaySummary } from '../data/location-fields.js';

const CHEVRON = '<svg class="kd-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

/* Per-section leading icons (stroke, inherit currentColor) so the flat layout
 * reads like the classic detail panel: icon + title + content, hairline
 * dividers between sections — no heavy boxes. */
const ICONS = {
    hours: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    categories: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>',
    related: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
};

const PHONE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const GLOBE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>';

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Images for the gallery: explicit gallery, else the single logo. */
export function galleryImages(loc) {
    if (Array.isArray(loc?.images) && loc.images.length) return loc.images;
    return loc?.logo ? [loc.logo] : [];
}

/** Resolve recommended units: manual `related` ids first, else auto-similar. */
export function resolveRelated(loc, limit = 6) {
    const all = Array.isArray(dataStore.locations) ? dataStore.locations : [];
    if (!loc) return [];
    if (Array.isArray(loc.related) && loc.related.length) {
        const byId = new Map(all.map(l => [String(l.id), l]));
        const out = [];
        for (const rid of loc.related) {
            const hit = byId.get(String(rid));
            if (hit && hit.id !== loc.id && !out.includes(hit)) out.push(hit);
        }
        if (out.length) return out.slice(0, limit);
    }
    // Auto "similar": same type first, then shared categories.
    const byType = all.filter(l => l.id !== loc.id && l.type && l.type === loc.type);
    if (byType.length >= limit) return byType.slice(0, limit);
    const srcCats = new Set((loc.apiCategories || []).map(String));
    const byCat = all.filter(l =>
        l.id !== loc.id && !byType.includes(l) &&
        (l.apiCategories || []).some(c => srcCats.has(String(c))));
    return [...byType, ...byCat].slice(0, limit);
}

function section({ key, title, subtitle = '', open = false, collapsible = true, body }) {
    if (!body) return '';
    const icon = ICONS[key] || '';
    const iconHtml = icon ? `<span class="kd-section-ico">${icon}</span>` : '';
    const subHtml = subtitle ? `<span class="kd-section-sub">${subtitle}</span>` : '';

    if (!collapsible) {
        return `
    <div class="kd-section kd-section--static" data-kd-section="${key}">
      <div class="kd-section-head kd-section-head--static">
        ${iconHtml}<span class="kd-section-title">${esc(title)}</span>${subHtml}
      </div>
      <div class="kd-section-static"><div class="kd-section-inner">${body}</div></div>
    </div>`;
    }

    return `
    <div class="kd-section${open ? ' is-open' : ''}" data-kd-section="${key}">
      <button type="button" class="kd-section-head" aria-expanded="${open ? 'true' : 'false'}">
        ${iconHtml}<span class="kd-section-title">${esc(title)}</span>${subHtml}
        ${CHEVRON}
      </button>
      <div class="kd-section-body"><div class="kd-section-inner">${body}</div></div>
    </div>`;
}

/** Contact row: phone (with number) + website globe. */
function contactBar(loc) {
    const phone = (loc.telephone || '').trim();
    const web = (loc.web || '').trim();
    if (!phone && !web) return '';
    const href = web && !/^https?:\/\//i.test(web) ? `https://${web}` : web;
    return `<div class="kd-contact">
        ${phone ? `<a class="kd-contact-btn kd-contact-phone" href="tel:${esc(phone)}">${PHONE_ICON}<span>${esc(formatPhoneNumber(phone))}</span></a>` : ''}
        ${web ? `<a class="kd-contact-btn" href="${esc(href)}" target="_blank" rel="noopener" aria-label="Web sitesi">${GLOBE_ICON}</a>` : ''}
    </div>`;
}

/** Hours block: heading + collapsible status line (matches reference). */
function hoursSection(loc) {
    const body = hoursBody(loc);
    if (!body) return '';
    const summary = hoursStatusLine(loc) || '<span class="kd-hours-today">Saatleri gör</span>';
    return `
    <div class="kd-section kd-hours-section" data-kd-section="hours">
      <div class="kd-section-head kd-section-head--static">
        <span class="kd-section-ico">${ICONS.hours}</span><span class="kd-section-title">Çalışma Saatleri</span>
      </div>
      <button type="button" class="kd-hours-trigger" aria-expanded="false">
        <span class="kd-hours-summary">${summary}</span>${CHEVRON}
      </button>
      <div class="kd-section-body"><div class="kd-section-inner">${body}</div></div>
    </div>`;
}

/** Today's open/closed summary line for the hours subtitle. */
function hoursStatusLine(loc) {
    if (!loc.hoursStructured) return '';
    const open = isOpenNow(loc.hoursStructured);
    const today = hoursTodaySummary(loc.hoursStructured);
    const badge = open == null ? ''
        : open ? '<span class="kd-status kd-open">Açık</span>'
            : '<span class="kd-status kd-closed">Kapalı</span>';
    return `${badge}${today ? `<span class="kd-hours-today">${esc(today)}</span>` : ''}`;
}

function galleryBody(loc) {
    const imgs = galleryImages(loc);
    if (!imgs.length) return '';
    const name = esc(getLocationDisplayName(loc));
    const multi = imgs.length > 1;
    const nav = multi ? `
        <button type="button" class="kd-gallery-nav kd-gallery-prev" aria-label="Önceki">&#10094;</button>
        <button type="button" class="kd-gallery-nav kd-gallery-next" aria-label="Sonraki">&#10095;</button>
        <span class="kd-gallery-count"><span class="kd-gallery-cur">1</span>/${imgs.length}</span>` : '';
    const dots = multi ? `<div class="kd-gallery-dots">${imgs.map((_, i) =>
        `<button type="button" class="kd-gallery-dot${i === 0 ? ' is-active' : ''}" data-kd-dot="${i}" aria-label="Görsel ${i + 1}"></button>`,
    ).join('')}</div>` : '';
    return `<div class="kd-gallery" data-kd-gallery>
        <div class="kd-gallery-stage">
            <img class="kd-gallery-main" src="${esc(imgs[0])}" alt="${name}" data-kd-img="0" loading="lazy">
            ${nav}
        </div>
        ${dots}
    </div>`;
}

function hoursBody(loc) {
    if (loc.hoursStructured) {
        const rows = hoursRows(loc.hoursStructured);
        return `<div class="kd-hours">${rows.map(r =>
            `<div class="kd-hours-row"><span class="kd-hours-day">${esc(r.label)}</span><span class="kd-hours-val">${esc(r.text)}</span></div>`,
        ).join('')}</div>`;
    }
    if (loc.hours) return `<div class="kd-hours-flat">${esc(loc.hours)}</div>`;
    return '';
}

function relatedBody(loc) {
    const rel = resolveRelated(loc, 6);
    if (!rel.length) return '';
    return `<div class="kd-related">${rel.map(s => {
        const name = esc(getLocationDisplayName(s));
        const inner = s.logo
            ? `<img src="${esc(s.logo)}" alt="${name}">`
            : `<span class="kd-related-name">${name}</span>`;
        return `<button type="button" class="kd-related-item" data-kd-related="${esc(s.id)}" title="${name}">${inner}</button>`;
    }).join('')}</div>`;
}

function buildMoreBlocks(loc, opts = {}) {
    const { descriptionFallback = '', includeCategories = true, includeRelated = false } = opts;
    const catNames = includeCategories ? getCategoryDisplayNames(loc.apiCategories || []) : [];
    const desc = loc.description || descriptionFallback;
    const catBody = catNames.length
        ? `<div class="kd-tags">${catNames.map(n => `<span class="kd-tag">${esc(n)}</span>`).join('')}</div>` : '';
    const descBlock = desc
        ? `<div class="kd-block kd-desc-block"><p class="kd-desc is-clamped" data-kd-desc>${esc(desc)}</p><button type="button" class="kd-desc-more" data-kd-desc-more hidden>…daha fazla</button></div>` : '';
    const contact = contactBar(loc);
    const gallery = galleryBody(loc);
    const galleryBlock = gallery ? `<div class="kd-block kd-gallery-block">${gallery}</div>` : '';
    return {
        catBody,
        descBlock,
        contact,
        galleryBlock,
        related: includeRelated ? section({ key: 'related', title: 'Beğenebileceğiniz Yerler', collapsible: false, body: relatedBody(loc) }) : '',
    };
}

/**
 * Build the collapsible sections HTML for `loc`.
 * @param {object} loc
 * @param {object} [opts]
 * @param {string} [opts.descriptionFallback]
 * @param {boolean} [opts.includeCategories=true]
 * @param {'all'|'peek'|'more'} [opts.part='all'] — mobile sheet splits peek (hours) vs scrollable more.
 */
export function buildDetailSectionsHTML(loc, opts = {}) {
    if (!loc) return '';
    const { part = 'all', ...rest } = opts;
    const blocks = buildMoreBlocks(loc, rest);

    if (part === 'peek') {
        const hours = hoursSection(loc);
        return hours ? `<div class="kd-sections">${hours}</div>` : '';
    }

    if (part === 'more') {
        const inner = [
            section({ key: 'categories', title: 'Kategoriler', collapsible: false, body: blocks.catBody }),
            blocks.descBlock,
            blocks.contact,
            blocks.related,
            blocks.galleryBlock,
        ].filter(Boolean).join('');
        return inner ? `<div class="kd-sections">${inner}</div>` : '';
    }

    return `<div class="kd-sections">
      ${hoursSection(loc)}
      ${section({ key: 'categories', title: 'Kategoriler', collapsible: false, body: blocks.catBody })}
      ${blocks.descBlock}
      ${blocks.contact}
      ${blocks.related}
      ${blocks.galleryBlock}
    </div>`;
}

/**
 * Wire accordion toggles, gallery clicks and related-store clicks within `root`.
 * @param {HTMLElement} root
 * @param {object} loc
 * @param {object} [handlers]
 * @param {(store:object)=>void} [handlers.onRelatedClick]
 * @param {(images:string[], index:number)=>void} [handlers.onImageClick]
 * @param {()=>void} [handlers.onSheetExpand] — mobile: expand bottom sheet to full screen
 */
export function wireDetailSections(root, loc, handlers = {}) {
    if (!root) return;
    // Only collapsible sections toggle; static heads (categories/related) are
    // plain labels.
    root.querySelectorAll('.kd-section:not(.kd-section--static) > .kd-section-head, .kd-hours-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
            const sec = trigger.closest('.kd-section');
            if (!sec) return;
            const open = sec.classList.toggle('is-open');
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open && handlers.onSheetExpand) handlers.onSheetExpand();
            if (handlers.onLayoutChange) handlers.onLayoutChange();
        });
    });

    // Description "…daha fazla" — only show the toggle when text overflows.
    const descEl = root.querySelector('[data-kd-desc]');
    const moreBtn = root.querySelector('[data-kd-desc-more]');
    if (descEl && moreBtn) {
        requestAnimationFrame(() => {
            if (descEl.scrollHeight - descEl.clientHeight > 2) moreBtn.hidden = false;
        });
        moreBtn.addEventListener('click', () => {
            const clamped = descEl.classList.toggle('is-clamped');
            moreBtn.textContent = clamped ? '…daha fazla' : 'daha az';
            if (!clamped && handlers.onSheetExpand) handlers.onSheetExpand();
            if (handlers.onLayoutChange) handlers.onLayoutChange();
        });
    }

    const imgs = galleryImages(loc);
    const gal = root.querySelector('[data-kd-gallery]');
    if (gal && imgs.length) {
        let gi = 0;
        const mainEl = gal.querySelector('.kd-gallery-main');
        const curEl = gal.querySelector('.kd-gallery-cur');
        const dotEls = gal.querySelectorAll('.kd-gallery-dot');
        const show = (n) => {
            gi = (n + imgs.length) % imgs.length;
            if (mainEl) { mainEl.src = imgs[gi]; mainEl.dataset.kdImg = String(gi); }
            if (curEl) curEl.textContent = String(gi + 1);
            dotEls.forEach((d, i) => d.classList.toggle('is-active', i === gi));
        };
        gal.querySelector('.kd-gallery-prev')?.addEventListener('click', (e) => { e.stopPropagation(); show(gi - 1); });
        gal.querySelector('.kd-gallery-next')?.addEventListener('click', (e) => { e.stopPropagation(); show(gi + 1); });
        dotEls.forEach((d, i) => d.addEventListener('click', (e) => { e.stopPropagation(); show(i); }));
        mainEl?.addEventListener('click', () => {
            if (handlers.onImageClick) handlers.onImageClick(imgs, gi);
            else openLightbox(imgs, gi);
        });
    }

    root.querySelectorAll('[data-kd-related]').forEach(btn => {
        btn.addEventListener('click', () => {
            const store = (dataStore.locations || []).find(l => String(l.id) === String(btn.dataset.kdRelated));
            if (store && handlers.onRelatedClick) handlers.onRelatedClick(store);
        });
    });
}

/* Minimal built-in lightbox for image gallery (used when the surface doesn't
 * provide its own onImageClick). */
function openLightbox(images, index = 0) {
    if (!images?.length) return;
    let i = index;
    const ov = document.createElement('div');
    ov.className = 'kd-lightbox';
    ov.innerHTML = `
      <button class="kd-lightbox-close" aria-label="Kapat">&times;</button>
      <button class="kd-lightbox-nav kd-lightbox-prev" aria-label="Önceki">&#10094;</button>
      <img class="kd-lightbox-img" src="${images[i]}" alt="">
      <button class="kd-lightbox-nav kd-lightbox-next" aria-label="Sonraki">&#10095;</button>`;
    const imgEl = ov.querySelector('.kd-lightbox-img');
    const show = (n) => { i = (n + images.length) % images.length; imgEl.src = images[i]; };
    ov.querySelector('.kd-lightbox-prev').addEventListener('click', e => { e.stopPropagation(); show(i - 1); });
    ov.querySelector('.kd-lightbox-next').addEventListener('click', e => { e.stopPropagation(); show(i + 1); });
    const close = () => ov.remove();
    ov.querySelector('.kd-lightbox-close').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    if (images.length < 2) ov.querySelectorAll('.kd-lightbox-nav').forEach(b => b.style.display = 'none');
    document.body.appendChild(ov);
}
