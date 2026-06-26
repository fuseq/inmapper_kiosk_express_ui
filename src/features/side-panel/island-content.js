import { eventBus } from '../../core/event-bus.js';
import { config } from '../../core/config.js';
import { state, dataStore } from '../../core/state.js';
import { getLocationDisplayName } from '../../core/utils.js';
import { isOpenNow } from '../data/location-fields.js';
import { getCategoryDisplayInfo, getCategoryDisplayNames, getAvailableCategories } from '../data/category-service.js';
import { buildDetailSectionsHTML, wireDetailSections } from '../store-detail/detail-sections.js';
import { featureLoader } from '../../core/feature-loader.js';
import { iconHTML, renderIcons } from '../../core/icon.js';
import { buildRouteQrImageUrl } from '../navigation/qr-service.js';
import { isKioskView } from '../../app.js';
import { getInterfaceProfile } from '../../core/interface-profile.js';
import { openFloorMenuPortal, closeFloorMenuPortal, isFloorMenuOutsideClick } from '../../core/floor-menu-portal.js';

/* "Mobile Links" sidecar that mirrors the store-detail QR card. Used as
 * the right column of the island's navigation layout. Returns an empty
 * string when the route is incomplete or QR is disabled
 * (`features.navigation.qrBaseUrl` empty) — in that case the main
 * column simply takes the full panel width via the .isl-nav fallback. */
function routeQrSidecarHtml() {
    const src = buildRouteQrImageUrl(280);
    if (!src) return '';
    return `
        <aside class="isl-nav-qr-side">
            <h3 class="isl-nav-qr-side-title">Mobile Links</h3>
            <div class="isl-nav-qr-side-image"><img src="${src}" alt="QR Code"></div>
            <p class="isl-nav-qr-side-desc">Continue from your phone by scanning the QR</p>
        </aside>`;
}

let containerEl = null;
let headerEl = null;
let currentMode = 'home';
let searchQuery = '';
let activeCategory = null;
let activeFloor = 'all';
let selectingField = null;
let routeData = null;
let navStepIndex = 0;
let navStepsExpanded = false;
let activeRouteType = 'shortest';

const SVG = {
    back: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2" stroke="currentColor" stroke-width="2"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M19 12l-7-7M19 12l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronUp: '<svg viewBox="0 0 24 24" fill="none"><path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepStart: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M10 22l2-7 2 7M8.5 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepEnd: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg>',
    stepStraight: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M8 9l4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepRight: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M15 8l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepLeft: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M9 8l-4 4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepElevator: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2"/><path d="M8 16v-4l2 2 2-2v4M14 8l2-2 2 2M14 16l2 2 2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepStairs: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4v-4h4v-4h4v-4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    tune: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none"><circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="2"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" stroke-width="2"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="2"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="7" r="1" fill="currentColor"/></svg>',
    directions: '<svg viewBox="0 0 24 24" fill="none"><path d="M3.27 11.44l7.29-7.29a2 2 0 012.83 0l7.29 7.29a1 1 0 010 1.41l-7.29 7.29a2 2 0 01-2.83 0l-7.29-7.29a1 1 0 010-1.41z" stroke="currentColor" stroke-width="2"/><path d="M9 12h6M12 9l3 3-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function isAutoStart() {
    return (config.features.navigation?.startPointMode || 'auto') === 'auto';
}

function filterLocations(query, category, floor) {
    let locs = dataStore.locations || [];
    if (category) locs = locs.filter(l => l.apiCategories?.includes(category));
    if (floor && floor !== 'all') locs = locs.filter(l => String(l.floor) === String(floor));
    if (query?.length > 0) {
        const q = query.toLowerCase();
        locs = locs.filter(l =>
            (l.name || '').toLowerCase().includes(q) ||
            (l.subtitle || '').toLowerCase().includes(q) ||
            (l.category || '').toLowerCase().includes(q)
        );
    }
    return locs;
}

/* ==================== FLOOR FILTER (custom dropdown) ==================== */
const FLOOR_ICO_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 13l9 5 9-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function islandFloorOptions() {
    const present = new Set();
    (dataStore.locations || []).forEach(l => { if (l.floor) present.add(String(l.floor)); });
    const floorMap = config.venue?.floorMap || {};
    const shortByName = {};
    const ordered = [];
    Object.entries(floorMap)
        .sort((a, b) => parseInt(b[0], 10) - parseInt(a[0], 10))
        .forEach(([key, name]) => {
            const n = String(name);
            shortByName[n] = String(key);
            if (present.has(n)) { ordered.push(n); present.delete(n); }
        });
    [...present].forEach(f => ordered.push(f));
    return [
        { value: 'all', label: 'Tüm Katlar', short: 'Tüm' },
        ...ordered.map(f => ({ value: f, label: f, short: shortByName[f] || f })),
    ];
}

function closeIslandFloorMenu() {
    const wrap = headerEl?.querySelector('.isl-floor');
    if (wrap) wrap.classList.remove('open');
    const menu = document.querySelector('.isl-floor-menu.is-portaled')
        || wrap?.querySelector('.isl-floor-menu');
    if (menu) closeFloorMenuPortal(menu);
    document.removeEventListener('click', onIslandFloorOutside, true);
}

function onIslandFloorOutside(e) {
    const wrap = headerEl?.querySelector('.isl-floor');
    if (wrap && isFloorMenuOutsideClick(wrap, e)) closeIslandFloorMenu();
}

function buildFloorControlHtml() {
    const opts = islandFloorOptions();
    if (!opts.some(o => o.value === activeFloor)) activeFloor = 'all';
    const cur = opts.find(o => o.value === activeFloor) || opts[0];
    const items = opts.map(o =>
        `<div class="isl-floor-option ${o.value === activeFloor ? 'active' : ''}" role="option" data-value="${o.value}">${o.label}</div>`,
    ).join('');
    return `
        <div class="isl-floor ${activeFloor === 'all' ? 'is-all' : ''}">
            <button class="isl-floor-trigger" type="button" aria-haspopup="listbox" aria-label="Kat filtresi">
                <span class="isl-floor-ico">${FLOOR_ICO_SVG}</span>
                <span class="isl-floor-label">${cur.short}</span>
            </button>
            <div class="isl-floor-menu" role="listbox">${items}</div>
        </div>`;
}

function wireFloorControl() {
    const wrap = headerEl.querySelector('.isl-floor');
    if (!wrap) return;
    wrap.querySelector('.isl-floor-trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        if (wrap.classList.contains('open')) {
            closeIslandFloorMenu();
        } else {
            wrap.classList.add('open');
            openFloorMenuPortal({
                wrap,
                menu: wrap.querySelector('.isl-floor-menu'),
                trigger: wrap.querySelector('.isl-floor-trigger'),
            });
            document.addEventListener('click', onIslandFloorOutside, true);
        }
    });
    wrap.querySelectorAll('.isl-floor-option').forEach(opt => {
        opt.addEventListener('click', () => {
            activeFloor = opt.dataset.value;
            const opts = islandFloorOptions();
            const cur = opts.find(o => o.value === activeFloor);
            const label = wrap.querySelector('.isl-floor-label');
            if (label && cur) label.textContent = cur.short;
            wrap.classList.toggle('is-all', activeFloor === 'all');
            wrap.querySelectorAll('.isl-floor-option').forEach(o =>
                o.classList.toggle('active', o.dataset.value === activeFloor),
            );
            closeIslandFloorMenu();
            if (currentMode === 'search') renderSearchList();
            else setMode('search');
        });
    });
}

function buildLocationItem(loc, clickHandler) {
    const catInfo = loc.apiCategories?.[0]
        ? getCategoryDisplayInfo(loc.apiCategories[0])
        : { icon: 'map-pin', label: loc.category || '' };
    const name = getLocationDisplayName(loc);
    const el = document.createElement('div');
    el.className = 'isl-loc-item';
    el.innerHTML = `
        <div class="isl-loc-icon${loc.logo ? ' has-logo' : ''}">${loc.logo
            ? `<img src="${loc.logo}" alt="" loading="lazy" decoding="async">`
            : iconHTML(catInfo.icon, { size: 20 })}</div>
        <div class="isl-loc-info">
            <div class="isl-loc-name">${name}</div>
            <div class="isl-loc-meta">${loc.floor || ''}${catInfo.label ? (loc.floor ? ' · ' : '') + catInfo.label : ''}</div>
        </div>
        <div class="isl-loc-arrow">${arrowSVG}</div>`;
    el.addEventListener('click', () => clickHandler(loc));
    return el;
}
const arrowSVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function buildLocationList(locs, clickHandler) {
    const wrap = document.createElement('div');
    wrap.className = 'isl-loc-list';
    locs.forEach(loc => wrap.appendChild(buildLocationItem(loc, clickHandler)));
    renderIcons();
    return wrap;
}

/* ==================== SEARCH BAR ==================== */
function renderSearchBar(showBack) {
    headerEl.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'isl-search-row';
    // Mobile-style: the in-field leading icon doubles as Back while searching
    // (magnifier ⇄ back), so no separate back button shifts the row. A floor
    // filter sits to the right of the field.
    row.innerHTML = `
        <div class="isl-search-field">
            <button class="isl-search-leading ${showBack ? 'is-back' : ''}" type="button" aria-label="${showBack ? 'Geri' : 'Ara'}">${showBack ? SVG.back : SVG.search}</button>
            <input type="search" class="isl-search-input" placeholder="Nereyi arıyorsunuz?" autocomplete="off" value="${searchQuery}">
        </div>
        ${buildFloorControlHtml()}`;
    headerEl.appendChild(row);

    const input = row.querySelector('.isl-search-input');
    const leading = row.querySelector('.isl-search-leading');

    wireFloorControl();

    input.addEventListener('focus', () => {
        if (currentMode === 'home') setMode('search');
    });

    let debounce = null;
    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            searchQuery = input.value.trim();
            if (currentMode === 'search') renderSearchList();
        }, 200);
    });

    leading.addEventListener('click', () => {
        if (!showBack) {
            // Magnifier → open search (focus triggers setMode).
            input.focus();
            return;
        }
        // Back arrow → exit search; magnifier returns on re-render.
        input.value = '';
        searchQuery = '';
        activeCategory = null;
        selectingField = null;
        if (state.endPoint && currentMode === 'search') {
            setMode('directions');
        } else {
            setMode('home');
        }
    });

    return input;
}

/* ==================== HOME ==================== */
function renderHome() {
    containerEl.innerHTML = '';
    renderSearchBar(false);

    const grid = document.createElement('div');
    grid.className = 'isl-category-grid';

    const cats = getAvailableCategories();

    const gridCfg = config.theme?.mobile?.categoryGrid || {};
    const defaultCols = gridCfg.defaultColumns || 3;
    const rowDefs = gridCfg.rows || [];

    let idx = 0, rowIdx = 0;
    while (idx < cats.length) {
        const cols = rowDefs[rowIdx] || defaultCols;
        const rowEl = document.createElement('div');
        rowEl.className = 'isl-cat-row';
        const rowCats = cats.slice(idx, idx + cols);
        rowEl.style.gridTemplateColumns = `repeat(${rowCats.length}, 1fr)`;

        rowCats.forEach(cat => {
            const card = document.createElement('div');
            card.className = 'isl-cat-card';
            card.dataset.key = cat.apiKey;
            card.innerHTML = `<span class="isl-cat-icon">${iconHTML(cat.icon, { size: 24 })}</span><span class="isl-cat-label">${cat.displayName}</span>`;
            card.addEventListener('click', () => {
                activeCategory = activeCategory === cat.apiKey ? null : cat.apiKey;
                grid.querySelectorAll('.isl-cat-card').forEach(c =>
                    c.classList.toggle('active', c.dataset.key === activeCategory)
                );
                setMode('search', { fromCategory: true });
            });
            rowEl.appendChild(card);
        });
        grid.appendChild(rowEl);
        idx += cols;
        rowIdx++;
    }

    containerEl.appendChild(grid);
    renderIcons();

    requestAnimationFrame(() => {
        const cards = grid.querySelectorAll('.isl-cat-card');
        let maxH = 0;
        cards.forEach(c => { if (c.offsetHeight > maxH) maxH = c.offsetHeight; });
        if (maxH > 0) cards.forEach(c => { c.style.minHeight = `${maxH}px`; });
    });

    showIslandScrollHint();
    updateIslandSize('compact');
}

function showIslandScrollHint() {
    const panel = document.getElementById('mapSidePanel');
    if (!panel) return;
    const old = panel.querySelector('.isl-scroll-hint');
    if (old) old.remove();

    requestAnimationFrame(() => {
        if (!containerEl) return;
        const isScrollable = containerEl.scrollHeight - containerEl.clientHeight > 4;
        if (!isScrollable) return;

        const hint = document.createElement('div');
        hint.className = 'isl-scroll-hint';
        hint.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
        panel.appendChild(hint);

        const onScroll = () => {
            hint.classList.add('hide');
            containerEl.removeEventListener('scroll', onScroll);
            setTimeout(() => hint.remove(), 400);
        };
        containerEl.addEventListener('scroll', onScroll, { passive: true });
    });
}

/* ==================== SEARCH (list) ==================== */
function renderSearch(params = {}) {
    const input = renderSearchBar(true);
    renderSearchList();
    containerEl.scrollTop = 0;
    if (!params.fromCategory) requestAnimationFrame(() => input.focus());
    updateIslandSize('expanded');
}

function renderSearchList() {
    containerEl.innerHTML = '';
    const locs = filterLocations(searchQuery, activeCategory, activeFloor);

    if (locs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'isl-empty';
        empty.textContent = searchQuery ? 'Sonuç bulunamadı' : 'Konum yok';
        containerEl.appendChild(empty);
    } else {
        const title = document.createElement('div');
        title.className = 'isl-section-title';
        title.textContent = activeCategory
            ? getCategoryDisplayInfo(activeCategory).label
            : 'Tüm Birimler';
        containerEl.appendChild(title);
        containerEl.appendChild(buildLocationList(locs, loc => {
            if (selectingField) {
                onDirectionsLocationPick(loc);
            } else {
                onLocationSelected(loc);
            }
        }));
    }
}

/* ==================== DETAIL ==================== */
function renderDetail(params = {}) {
    const loc = params.location || state.selectedLocation;
    if (!loc) { renderHome(); return; }

    headerEl.innerHTML = '';
    containerEl.innerHTML = '';

    const catInfo = loc.apiCategories?.[0]
        ? getCategoryDisplayInfo(loc.apiCategories[0])
        : { icon: '📍' };
    const displayName = getLocationDisplayName(loc);
    const descFallback = `${displayName}, ${config.venue.name} bünyesinde hizmet veren popüler bir işletmedir. Detaylı bilgi için lütfen ziyaret ediniz.`;
    const openState = loc.hoursStructured ? isOpenNow(loc.hoursStructured) : null;
    const statusHtml = openState == null ? ''
        : openState ? '<span class="isl-detail-open">Açık</span>'
            : '<span class="isl-detail-closed">Kapalı</span>';

    const wrap = document.createElement('div');
    wrap.className = 'isl-detail';

    wrap.innerHTML = `
        <div class="isl-detail-header">
            <div class="isl-detail-logo">${loc.logo ? `<img src="${loc.logo}" alt="">` : `<span>${iconHTML(catInfo.icon, { size: 32 })}</span>`}</div>
            <div class="isl-detail-actions">
                <button class="isl-detail-action-btn isl-detail-share" title="Paylaş">${SVG.share}</button>
                <button class="isl-detail-action-btn isl-detail-close" title="Kapat">${SVG.close}</button>
            </div>
        </div>

        <div class="isl-detail-name">${displayName}</div>
        <div class="isl-detail-sub">${loc.floor || ''}${statusHtml ? (loc.floor ? ' <span class="isl-detail-sep">·</span> ' : '') + statusHtml : ''}</div>

        <div class="isl-detail-buttons">
            <button class="isl-detail-route-btn">${SVG.directions}<span>Yol Tarifi</span></button>
        </div>

        ${buildDetailSectionsHTML(loc, { descriptionFallback: descFallback })}
    `;
    containerEl.appendChild(wrap);
    renderIcons();

    // Collapsible sections + gallery + related-store navigation.
    wireDetailSections(wrap, loc, {
        onRelatedClick: (store) => {
            state.selectedLocation = store;
            eventBus.emit('map:locationSelected', { location: store });
            renderDetail({ location: store });
            containerEl.scrollTop = 0;
        },
    });

    wrap.querySelector('.isl-detail-close').addEventListener('click', () => {
        eventBus.emit('map:deselected');
        setMode('home');
    });

    wrap.querySelector('.isl-detail-share')?.addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({ title: displayName, text: `${displayName} - ${config.venue.name}` }).catch(() => {});
        }
    });

    wrap.querySelector('.isl-detail-route-btn').addEventListener('click', () => {
        state.endPoint = loc;
        if (!state.startPoint && isAutoStart()) state.startPoint = config.venue.kioskLocation;
        eventBus.emit('routePoint:updated', { point: 'end', location: loc });
        setMode('directions');
    });

    updateIslandSize('expanded');
}

/* ==================== DIRECTIONS ==================== */
function renderDirections() {
    const sp = state.startPoint;
    const ep = state.endPoint;
    const pinEnabled = config.features.navigation?.droppedPin?.enabled !== false;

    headerEl.innerHTML = '';
    containerEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'isl-dir-header';
    header.innerHTML = `<button class="isl-dir-back">${SVG.back}</button><div class="isl-dir-title">Rota</div>`;
    containerEl.appendChild(header);

    const spName = sp ? (sp.isPinned ? 'Haritadan seçildi' : getLocationDisplayName(sp)) : null;
    const epName = ep ? getLocationDisplayName(ep) : null;
    const showPin = pinEnabled && !isAutoStart() && !sp;

    const fields = document.createElement('div');
    fields.className = 'isl-dir-fields';
    fields.innerHTML = `
        <div class="isl-dir-connector">
            <div class="isl-dir-dot start"></div>
            <div class="isl-dir-line"></div>
            <div class="isl-dir-dot end"></div>
        </div>
        <div class="isl-dir-inputs">
            <div class="isl-dir-field ${sp ? '' : 'empty'}" id="islDirStart">
                ${SVG.search}
                <span class="isl-dir-field-text">${spName || 'Başlangıç Noktası Seç'}</span>
                ${showPin ? `<button class="isl-dir-field-pin">${SVG.pin}</button>` : ''}
            </div>
            <div class="isl-dir-field ${ep ? '' : 'empty'}" id="islDirEnd">
                ${SVG.search}
                <span class="isl-dir-field-text">${epName || 'Hedef Noktası Seç'}</span>
            </div>
        </div>`;
    containerEl.appendChild(fields);

    const canDraw = sp && ep;
    const actions = document.createElement('div');
    actions.className = 'isl-dir-actions';
    actions.innerHTML = `<button class="isl-dir-draw-btn" ${canDraw ? '' : 'disabled'}>Rota Çiz</button>`;
    containerEl.appendChild(actions);

    header.querySelector('.isl-dir-back').addEventListener('click', () => {
        if (ep) { setMode('detail', { location: ep }); }
        else { setMode('home'); }
    });

    containerEl.querySelector('#islDirStart')?.addEventListener('click', () => {
        selectingField = 'start';
        setMode('search');
    });
    containerEl.querySelector('#islDirEnd')?.addEventListener('click', () => {
        selectingField = 'end';
        setMode('search');
    });
    containerEl.querySelector('.isl-dir-field-pin')?.addEventListener('click', e => {
        e.stopPropagation();
        state.editingPoint = 'start';
        eventBus.emit('pin:activate');
    });
    containerEl.querySelector('.isl-dir-draw-btn')?.addEventListener('click', () => {
        if (!sp || !ep) return;
        eventBus.emit('route:draw', { fromId: sp.id, toId: ep.id, startPoint: sp });
        setMode('navigation');
    });

    updateIslandSize('expanded');
}

function onDirectionsLocationPick(loc) {
    if (selectingField === 'start') {
        state.startPoint = loc;
        eventBus.emit('routePoint:updated', { point: 'start', location: loc });
    } else {
        state.endPoint = loc;
        eventBus.emit('routePoint:updated', { point: 'end', location: loc });
        eventBus.emit('location:selected', { locationId: loc.id, fromMap: false });
    }
    selectingField = null;
    searchQuery = '';
    setMode('directions');
}

/* ==================== NAVIGATION ==================== */
function generateSteps() {
    if (routeData?.describeSteps?.length) {
        return routeData.describeSteps;
    }
    const spName = state.startPoint
        ? (state.startPoint.isPinned ? 'Haritadan seçilen nokta' : getLocationDisplayName(state.startPoint))
        : 'Başlangıç';
    const epName = state.endPoint ? getLocationDisplayName(state.endPoint) : 'Hedef';
    if (!routeData?.coordinates?.length) {
        return [{ icon: 'stepStraight', text: 'Rota yükleniyor…' }];
    }
    return [
        { icon: 'stepStart', text: `${spName} noktasından yola çıkın.` },
        { icon: 'stepEnd', text: `${epName} konumuna ulaştınız.` },
    ];
}

function renderNavigation() {
    const sp = state.startPoint;
    const ep = state.endPoint;
    const spName = sp ? (sp.isPinned ? 'Haritadan seçildi' : getLocationDisplayName(sp)) : 'Başlangıç';
    const epName = ep ? getLocationDisplayName(ep) : 'Hedef';
    const dist = routeData?.distance ? Math.round(routeData.distance) : null;
    const eta = dist ? `~${Math.max(1, Math.round(dist / 70))} dk` : '';
    const steps = generateSteps();
    const totalSteps = steps.length;
    const progress = totalSteps > 1 ? Math.round((navStepIndex / (totalSteps - 1)) * 100) : 0;
    const currentStep = steps[navStepIndex] || null;

    headerEl.innerHTML = '';
    containerEl.innerHTML = '';

    const wrap = document.createElement('div');
    /* `isl-nav` is a 2-column flex row: nav stack on the left, QR
     * "Mobile Links" sidecar on the right. When QR is disabled the
     * sidecar template is empty and the main column flexes to fill
     * the panel naturally. */
    wrap.className = 'isl-nav';

    const stepMarkers = steps.map((s, i) => {
        const pct = totalSteps > 1 ? (i / (totalSteps - 1)) * 100 : 0;
        const type = i === 0 ? 'start' : i === totalSteps - 1 ? 'end' : 'mid';
        const cls = i < navStepIndex ? 'done' : i === navStepIndex ? 'active' : '';
        return `<div class="isl-nav-marker ${type} ${cls}" style="left:${pct}%"><span>${SVG[s.icon] || ''}</span></div>`;
    }).join('');

    wrap.innerHTML = `
        <div class="isl-nav-main">
            <div class="isl-nav-progress">
                <div class="isl-nav-track">
                    <div class="isl-nav-fill" style="width:${progress}%"></div>
                    ${stepMarkers}
                </div>
            </div>
            <div class="isl-nav-endpoints">
                <span class="isl-nav-ep start">${spName}</span>
                <span class="isl-nav-ep-sep">${eta || '→'}</span>
                <span class="isl-nav-ep end">${epName}</span>
            </div>
            <div class="isl-nav-step-card">
                <div class="isl-nav-step-list expanded">
                    ${steps.map((s, i) => `
                        <div class="isl-nav-step-item ${i === navStepIndex ? 'active' : ''} ${i < navStepIndex ? 'done' : ''}">
                            <div class="isl-nav-step-bullet">${SVG[s.icon] || ''}</div>
                            <div class="isl-nav-step-label">${s.text}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="isl-nav-route-type-switch">
                ${(config.features.navigation?.routeTypes || [
                    { key: 'shortest', label: 'En Kısa', icon: 'stepStraight' },
                    { key: 'least_turns', label: 'Az Dönüş', icon: 'stepRight' },
                ]).map(rt => `
                    <button class="isl-nav-route-type-btn ${rt.key === activeRouteType ? 'active' : ''}" data-type="${rt.key}">
                        ${SVG[rt.icon] || ''}
                        <span>${rt.label}</span>
                    </button>
                `).join('')}
            </div>
            <div class="isl-nav-btns">
                <button class="isl-nav-btn" id="islNavPrev" ${navStepIndex === 0 ? 'disabled' : ''}>${SVG.arrowLeft}</button>
                <button class="isl-nav-btn cancel" id="islNavCancel">${SVG.close}</button>
                <button class="isl-nav-btn" id="islNavNext" ${navStepIndex >= totalSteps - 1 ? 'disabled' : ''}>${SVG.arrowRight}</button>
            </div>
        </div>
        ${routeQrSidecarHtml()}`;
    containerEl.appendChild(wrap);

    containerEl.querySelectorAll('.isl-nav-route-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            if (type === activeRouteType) return;
            activeRouteType = type;
            containerEl.querySelectorAll('.isl-nav-route-type-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.type === type)
            );
            eventBus.emit('route:typeChanged', type);
        });
    });

    function goNavStep(idx) {
        navStepIndex = idx;
        renderNavigation();
        eventBus.emit('route:navStep', { stepIndex: navStepIndex });
    }

    containerEl.querySelector('#islNavPrev').addEventListener('click', () => {
        if (navStepIndex > 0) goNavStep(navStepIndex - 1);
    });
    containerEl.querySelector('#islNavNext').addEventListener('click', () => {
        if (navStepIndex < totalSteps - 1) goNavStep(navStepIndex + 1);
    });

    containerEl.querySelectorAll('.isl-nav-step-item').forEach((el, i) => {
        el.addEventListener('click', () => goNavStep(i));
    });
    containerEl.querySelector('#islNavCancel').addEventListener('click', () => {
        eventBus.emit('route:clear');
        state.startPoint = isAutoStart() ? config.venue.kioskLocation : null;
        state.endPoint = null;
        state.selectedLocation = null;
        selectingField = null;
        routeData = null;
        navStepIndex = 0;
        navStepsExpanded = false;
        activeRouteType = 'shortest';

        /* On kiosk views (yatay or dikey) the X fully resets to the
         * idle home screen — users start a fresh query via the home
         * overlay's search bar, not by re-picking from the island's
         * location list. On web/mobile we keep the existing behaviour
         * (drop back to the island's home so the user can keep
         * exploring inline). */
        if (isKioskView()) {
            eventBus.emit('home:requestShow');
        } else {
            setMode('home');
        }
    });

    updateIslandSize('expanded');
}

/* ==================== ISLAND SIZE ==================== */
function updateIslandSize(size) {
    const panel = document.getElementById('mapSidePanel');
    if (!panel) return;
    panel.classList.toggle('island-compact', size === 'compact');
    panel.classList.toggle('island-expanded', size === 'expanded');
}

/* ==================== LOCATION SELECTED ==================== */
function onLocationSelected(loc) {
    state.selectedLocation = loc;
    state.endPoint = loc;
    if (!state.startPoint && isAutoStart()) state.startPoint = config.venue.kioskLocation;
    eventBus.emit('routePoint:updated', { point: 'end', location: loc });
    eventBus.emit('location:selected', { locationId: loc.id, fromMap: false });
    searchQuery = '';
    activeCategory = null;
    setMode('detail', { location: loc });
}

/* ==================== SET MODE ==================== */
function setMode(mode, params = {}) {
    currentMode = mode;
    const panel = document.getElementById('mapSidePanel');
    if (panel) {
        if (mode !== 'home') {
            const hint = panel.querySelector('.isl-scroll-hint');
            if (hint) hint.remove();
        }
        /* `island-nav` widens the panel so the navigation surface can
         * host the nav stack + Mobile-Links QR sidecar side-by-side
         * (see `.map-side-panel.island-layout.island-nav` in
         * side-panel.css). Skip widening when the sidecar would be
         * empty (QR disabled / route incomplete) — otherwise the right
         * column would just be wasted space. */
        const wantsNavLayout =
            mode === 'navigation' && !!buildRouteQrImageUrl(1);
        panel.classList.toggle('island-nav', wantsNavLayout);
        panel.classList.toggle('island-detail', mode === 'detail');
    }
    switch (mode) {
        case 'home':       renderHome(); break;
        case 'search':     renderSearch(params); break;
        case 'detail':     renderDetail(params); break;
        case 'directions': renderDirections(); break;
        case 'navigation': renderNavigation(); break;
        default:           renderHome();
    }
}

/* ==================== INIT ==================== */
export function initIslandContent(panel) {
    const staticContent = panel.querySelector('.side-panel-content');
    if (staticContent) staticContent.style.display = 'none';

    headerEl = document.createElement('div');
    headerEl.className = 'isl-header';

    containerEl = document.createElement('div');
    containerEl.className = 'isl-content';

    panel.appendChild(headerEl);
    panel.appendChild(containerEl);

    renderHome();

    if (isKioskView()) {
        panel.classList.add('hidden');
    } else {
        panel.classList.remove('hidden');
    }

    eventBus.on('categories:updated', () => { if (currentMode === 'home') renderHome(); });
    eventBus.on('sidePanel:showPreviewMode', (location) => {
        if (!location) return;
        if (state.currentView === 'map') {
            state.selectedLocation = location;
            state.endPoint = location;
            if (!state.startPoint && isAutoStart()) state.startPoint = config.venue.kioskLocation;
            eventBus.emit('routePoint:updated', { point: 'end', location });

            /* Kiosk map: categories + unit detail live in search / detail
             * tabs — the island only appears during active navigation (or
             * directions setup). Web keeps the inline island detail flow. */
            if (isKioskView()) {
                if (currentMode === 'navigation') {
                    const panel = document.getElementById('mapSidePanel');
                    if (panel?.classList.contains('hidden')) panel.classList.remove('hidden');
                    const sp = state.startPoint || (isAutoStart() ? config.venue.kioskLocation : null);
                    if (sp?.id && location.id) {
                        eventBus.emit('route:draw', { fromId: sp.id, toId: location.id, startPoint: sp });
                    }
                    renderNavigation();
                } else if (currentMode === 'directions') {
                    const panel = document.getElementById('mapSidePanel');
                    if (panel?.classList.contains('hidden')) panel.classList.remove('hidden');
                    renderDirections();
                }
                return;
            }

            const panel = document.getElementById('mapSidePanel');
            if (panel?.classList.contains('hidden')) panel.classList.remove('hidden');
            if (currentMode === 'navigation') {
                const sp = state.startPoint || (isAutoStart() ? config.venue.kioskLocation : null);
                if (sp?.id && location.id) {
                    eventBus.emit('route:draw', { fromId: sp.id, toId: location.id, startPoint: sp });
                }
                renderNavigation();
            } else if (currentMode === 'directions') {
                renderDirections();
            } else {
                setMode('detail', { location });
            }
            return;
        }
        setMode('detail', { location });
    });
    eventBus.on('sidePanel:showLocationList', () => {
        /* Default rest state is the island home (kategori kartları). Only
         * switch to the search list if we're returning from a non-home mode
         * (e.g. closing a unit detail or finishing a route). */
        if (currentMode !== 'home') setMode('search');
    });
    eventBus.on('route:result', data => {
        routeData = data;
        if (data?.routeType) activeRouteType = data.routeType;
        navStepIndex = 0;
        navStepsExpanded = false;
        if (currentMode === 'navigation') renderNavigation();
    });
    eventBus.on('map:locationClicked', ({ location }) => {
        if (!location) return;
        if (state.currentView !== 'map') {
            setMode('detail', { location });
        }
    });

    /* Interfaces without the kiosk store-detail tab (web) surface unit
     * detail inline in the island. Wire location:selected here so picks from
     * the map (fromMap) and any other source reliably open the island detail
     * — kiosk variants use their dedicated store-detail tab instead and are
     * excluded via the profile's `storeDetailTab` flag. */
    if (!getInterfaceProfile(config.initialView).storeDetailTab && !isKioskView()) {
        eventBus.on('location:selected', ({ locationId }) => {
            const loc = dataStore.locations.find(l => String(l.id) === String(locationId));
            if (!loc) return;
            state.selectedLocation = loc;
            state.endPoint = loc;
            if (!state.startPoint && isAutoStart()) state.startPoint = config.venue.kioskLocation;
            eventBus.emit('routePoint:updated', { point: 'end', location: loc });
            setMode('detail', { location: loc });
        });

        eventBus.on('navigation:directToMap', (payload) => {
            const id = payload?.locationId;
            if (!id) return;
            const loc = dataStore.locations.find(l => String(l.id) === String(id));
            if (!loc) return;
            state.selectedLocation = loc;
            state.endPoint = loc;
            setMode('detail', { location: loc });
        });
    }
    eventBus.on('map:deselected', () => {
        if (currentMode === 'detail' && !isKioskView()) setMode('home');
    });
    eventBus.on('pin:dropped', () => {
        if (currentMode === 'directions') renderDirections();
    });
    eventBus.on('pin:routeDrawn', () => {
        setMode('navigation');
    });
    // In island layout the store-detail panel isn't shown, but if the user
    // reaches this event anyway (e.g. via the Start Heading Forward button
    // in the kiosk's full store-detail overlay) we still want to:
    //   1) transition from the kiosk home screen to the map view, and
    //   2) draw the route + switch the island to navigation mode.
    //
    // The panel-layout equivalent lives in side-panel/index.js
    // (transitionToMapView). Since side-panel/index.js returns early for
    // the island layout, the home→map transition has to be done here too;
    // otherwise `#initialHome` (z-index:50) keeps covering the map and the
    // user sees the home screen again with the route invisible underneath.
    eventBus.on('navigation:startRoute', () => {
        eventBus.emit('storeDetail:hide');

        const home      = document.getElementById('initialHome');
        const slideshow = document.getElementById('homeMiniSlideshow');
        const searchTab = document.getElementById('searchTab');
        const detail    = document.getElementById('storeDetailContent');
        const panel     = document.getElementById('mapSidePanel');
        const mapFloor  = document.getElementById('mapFloorSelectorCompact');

        if (home) {
            home.style.transition    = 'none';
            home.style.opacity       = '0';
            home.style.visibility    = 'hidden';
            home.style.pointerEvents = 'none';
            home.classList.remove('search-mode', 'animating');
        }
        if (slideshow) slideshow.classList.add('hidden');
        if (searchTab) {
            searchTab.classList.remove('open', 'closing', 'animating');
            searchTab.style.opacity       = '0';
            searchTab.style.visibility    = 'hidden';
            searchTab.style.pointerEvents = 'none';
        }
        if (detail) {
            detail.classList.add('hidden');
            detail.classList.remove('active');
        }
        if (panel) panel.classList.remove('hidden');
        if (mapFloor) {
            mapFloor.classList.remove('hidden');
            mapFloor.style.display = 'flex';
        }

        state.currentView = 'map';

        const ep = state.endPoint;
        const sp = state.startPoint || (isAutoStart() ? config.venue.kioskLocation : null);
        if (!ep || !sp) return;
        state.startPoint = sp;
        eventBus.emit('route:draw', { fromId: sp.id, toId: ep.id, startPoint: sp });
        setMode('navigation');
    });
    // "Harita — Varsayılan" — the canonical map view: map + island +
    // floor selector visible, back button hidden. This is what the
    // editor's default map scene drives, and what kiosk users land on
    // when they reach the map through the normal search → location →
    // route flow (search/start route handlers also leave the island
    // visible). Distinct from `map:explore` below, which is the
    // kiosk-only minimal "browse the map" affordance.
    eventBus.on('map:default', () => {
        if (!state.startPoint && isAutoStart()) state.startPoint = config.venue.kioskLocation;

        const home      = document.getElementById('initialHome');
        const slideshow = document.getElementById('homeMiniSlideshow');
        const searchTab = document.getElementById('searchTab');
        const detail    = document.getElementById('storeDetailContent');
        const panel     = document.getElementById('mapSidePanel');
        const mapFloor  = document.getElementById('mapFloorSelectorCompact');
        const backBtn   = document.getElementById('mapBackBtn');

        if (home) {
            home.style.transition    = 'none';
            home.style.opacity       = '0';
            home.style.visibility    = 'hidden';
            home.style.pointerEvents = 'none';
            home.classList.remove('search-mode', 'animating');
        }
        if (slideshow) slideshow.classList.add('hidden');
        if (searchTab) {
            searchTab.classList.remove('open', 'closing', 'animating');
            searchTab.style.opacity       = '';
            searchTab.style.visibility    = '';
            searchTab.style.pointerEvents = '';
        }
        if (detail) {
            detail.classList.add('hidden');
            detail.classList.remove('active');
        }
        if (isKioskView()) {
            // Kiosk: browse/search UI lives outside the island; map is
            // navigation-only (or hidden-island explore via map:explore).
            if (panel) panel.classList.add('hidden');
        } else {
            if (panel) panel.classList.remove('hidden');
        }
        if (mapFloor) {
            mapFloor.classList.remove('hidden');
            mapFloor.style.display = 'flex';
        }
        if (backBtn) backBtn.style.display = 'none';

        state.currentView = 'map';
        setMode('home');

        const mapMod = featureLoader.getModule('map');
        if (mapMod?.mapRenderer?.mainMap) {
            const { mapRenderer } = mapMod;
            setTimeout(() => { mapRenderer.mainMap.resize(); mapRenderer.fitToAll(mapRenderer.mainMap); }, 100);
        }
    });

    // "Kiosk — Haritayı Keşfet" — kiosk-only minimal explore view.
    // Island/side-panel stays hidden, only floor selector + back
    // button visible. Lives on the kiosk home screen as a way for
    // users to browse the map without picking a destination first.
    // NOT one of the normal-flow screens.
    //
    // side-panel/index.js owns the equivalent listener for the
    // non-island layout and returns early when the island is active,
    // so the island layout has to do its own home → map transition.
    eventBus.on('map:explore', () => {
        if (!state.startPoint && isAutoStart()) state.startPoint = config.venue.kioskLocation;

        const home      = document.getElementById('initialHome');
        const slideshow = document.getElementById('homeMiniSlideshow');
        const searchTab = document.getElementById('searchTab');
        const detail    = document.getElementById('storeDetailContent');
        const panel     = document.getElementById('mapSidePanel');
        const mapFloor  = document.getElementById('mapFloorSelectorCompact');
        const backBtn   = document.getElementById('mapBackBtn');

        if (home) {
            home.style.transition    = 'none';
            home.style.opacity       = '0';
            home.style.visibility    = 'hidden';
            home.style.pointerEvents = 'none';
            home.classList.remove('search-mode', 'animating');
        }
        if (slideshow) slideshow.classList.add('hidden');
        if (searchTab) {
            searchTab.classList.remove('open', 'closing', 'animating');
            searchTab.style.opacity       = '0';
            searchTab.style.visibility    = 'hidden';
            searchTab.style.pointerEvents = 'none';
        }
        if (detail) {
            detail.classList.add('hidden');
            detail.classList.remove('active');
        }
        // Hide the island during pure explore — the user only sees the
        // map + floor selector + back button until they tap a feature.
        if (panel) panel.classList.add('hidden');
        if (mapFloor) {
            mapFloor.classList.remove('hidden');
            mapFloor.style.display = 'flex';
        }
        if (backBtn) backBtn.style.display = 'flex';

        state.currentView = 'map';
        // Pre-render home into the hidden island for a clean reset; kiosk
        // map taps do not surface category/detail UI on the island.
        setMode('home');

        const mapMod = featureLoader.getModule('map');
        if (mapMod?.mapRenderer?.mainMap) {
            const { mapRenderer } = mapMod;
            setTimeout(() => { mapRenderer.mainMap.resize(); mapRenderer.fitToAll(mapRenderer.mainMap); }, 100);
        }
    });

    // Back button — side-panel/index.js wires this for the non-island
    // layout but it returns early in island mode. Without this, clicking
    // "Geri Dön" only fires the messaging postMessage to the kiosk shell
    // and does nothing locally (so standalone/preview gets stuck on the
    // map). Mirror what side-panel/index.js does: emit home:requestShow
    // and let home/index.js handle the cleanup.
    const backBtn = document.getElementById('mapBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            eventBus.emit('home:requestShow');
        });
    }
    eventBus.on('idle:timeout', () => {
        if (state.routeNavigationActive && currentMode === 'navigation') return;

        searchQuery = '';
        activeCategory = null;
        activeFloor = 'all';
        selectingField = null;
        routeData = null;
        navStepIndex = 0;
        navStepsExpanded = false;
        activeRouteType = 'shortest';
        state.startPoint = isAutoStart() ? config.venue.kioskLocation : null;
        state.endPoint = null;
        state.selectedLocation = null;
        setMode('home');
        if (isKioskView()) {
            const panel = document.getElementById('mapSidePanel');
            if (panel) panel.classList.add('hidden');
        }
    });
}
