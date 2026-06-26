import { eventBus } from '../../core/event-bus.js';
import { config } from '../../core/config.js';
import { state, dataStore } from '../../core/state.js';
import { getLocationDisplayName } from '../../core/utils.js';
import { getCategoryDisplayInfo, getAvailableCategories } from '../data/category-service.js';
import { iconHTML, renderIcons } from '../../core/icon.js';
import { assistant } from '../assistant/index.js';
import { buildDetailSectionsHTML, wireDetailSections } from '../store-detail/detail-sections.js';
import { openFloorMenuPortal, closeFloorMenuPortal, isFloorMenuOutsideClick } from '../../core/floor-menu-portal.js';

let containerEl = null;
let headerEl = null;
let currentMode = 'home';
let searchQuery = '';
let activeCategory = null;
let activeFloor = 'all';
let selectingField = null; // 'start' | 'end' in directions mode
let routeData = null;       // { coordinates, distance }
let navStepIndex = 0;
let navStepsExpanded = false;
let activeRouteType = 'shortest';

const SVG = {
    back: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 4v12m0 0l4-4m-4 4l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2" stroke="currentColor" stroke-width="2"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M19 12l-7-7M19 12l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    tune: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronUp: '<svg viewBox="0 0 24 24" fill="none"><path d="M18 15l-6-6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    message: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 9.5v5M7 5.5v13M11 8v8M15 11v2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M19 2.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3z" fill="currentColor"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 21V4m0 0l12 4-12 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepStart: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M10 22l2-7 2 7M8.5 12h7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepEnd: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="9" r="2.5" fill="currentColor"/></svg>',
    stepStraight: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M8 9l4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepRight: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M15 8l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepLeft: '<svg viewBox="0 0 24 24" fill="none"><path d="M19 12H5M9 8l-4 4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepElevator: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2"/><path d="M8 16v-4l2 2 2-2v4M14 8l2-2 2 2M14 16l2 2 2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stepStairs: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4v-4h4v-4h4v-4h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function isAutoStart() {
    return (config.features.navigation?.startPointMode || 'auto') === 'auto';
}

function snap(level) {
    eventBus.emit('sheet:requestSnap', level);
}

function filterLocations(query, category, floor) {
    let locs = dataStore.locations || [];
    if (category) {
        locs = locs.filter(l => l.apiCategories && l.apiCategories.includes(category));
    }
    if (floor && floor !== 'all') {
        locs = locs.filter(l => String(l.floor) === String(floor));
    }
    if (query && query.length > 0) {
        const q = query.toLowerCase();
        locs = locs.filter(l => {
            const n = (l.name || '').toLowerCase();
            const s = (l.subtitle || '').toLowerCase();
            const c = (l.category || '').toLowerCase();
            return n.includes(q) || s.includes(q) || c.includes(q);
        });
    }
    return locs;
}

function buildLocationItem(loc, clickHandler) {
    const catInfo = loc.apiCategories?.[0]
        ? getCategoryDisplayInfo(loc.apiCategories[0])
        : { icon: 'map-pin', label: loc.category || '' };
    const name = getLocationDisplayName(loc);

    const el = document.createElement('div');
    el.className = 'ms-loc-item';
    el.innerHTML = `
        <div class="ms-loc-icon">${iconHTML(catInfo.icon, { size: 20 })}</div>
        <div class="ms-loc-info">
            <div class="ms-loc-name">${name}</div>
            <div class="ms-loc-meta">${loc.floor || ''}${catInfo.label ? (loc.floor ? ' · ' : '') + catInfo.label : ''}</div>
        </div>`;
    el.addEventListener('click', () => clickHandler(loc));
    return el;
}

function buildLocationList(locs, clickHandler) {
    const wrap = document.createElement('div');
    wrap.className = 'ms-loc-list';
    for (const loc of locs) {
        wrap.appendChild(buildLocationItem(loc, clickHandler));
    }
    renderIcons();
    return wrap;
}

/* ==================== FLOOR FILTER (custom dropdown, mirrors island) ==================== */
const FLOOR_ICO_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M12 3l9 5-9 5-9-5 9-5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3 13l9 5 9-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function msFloorOptions() {
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

function closeMobileFloorMenu() {
    const wrap = headerEl?.querySelector('.ms-floor');
    if (wrap) wrap.classList.remove('open');
    const menu = document.querySelector('.ms-floor-menu.is-portaled')
        || wrap?.querySelector('.ms-floor-menu');
    if (menu) closeFloorMenuPortal(menu);
    document.removeEventListener('click', onMobileFloorOutside, true);
}

function onMobileFloorOutside(e) {
    const wrap = headerEl?.querySelector('.ms-floor');
    if (wrap && isFloorMenuOutsideClick(wrap, e)) closeMobileFloorMenu();
}

function buildFloorControlHtml() {
    const opts = msFloorOptions();
    if (!opts.some(o => o.value === activeFloor)) activeFloor = 'all';
    const cur = opts.find(o => o.value === activeFloor) || opts[0];
    const items = opts.map(o =>
        `<div class="ms-floor-option ${o.value === activeFloor ? 'active' : ''}" role="option" data-value="${o.value}">${o.label}</div>`,
    ).join('');
    return `
        <div class="ms-floor ${activeFloor === 'all' ? 'is-all' : ''}">
            <button class="ms-floor-trigger" type="button" aria-haspopup="listbox" aria-label="Kat filtresi">
                <span class="ms-floor-ico">${FLOOR_ICO_SVG}</span>
                <span class="ms-floor-label">${cur.short}</span>
            </button>
            <div class="ms-floor-menu" role="listbox">${items}</div>
        </div>`;
}

function wireFloorControl() {
    const wrap = headerEl.querySelector('.ms-floor');
    if (!wrap) return;
    wrap.querySelector('.ms-floor-trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        if (wrap.classList.contains('open')) {
            closeMobileFloorMenu();
        } else {
            wrap.classList.add('open');
            openFloorMenuPortal({
                wrap,
                menu: wrap.querySelector('.ms-floor-menu'),
                trigger: wrap.querySelector('.ms-floor-trigger'),
            });
            document.addEventListener('click', onMobileFloorOutside, true);
        }
    });
    wrap.querySelectorAll('.ms-floor-option').forEach(opt => {
        opt.addEventListener('click', () => {
            activeFloor = opt.dataset.value;
            const opts = msFloorOptions();
            const cur = opts.find(o => o.value === activeFloor);
            const label = wrap.querySelector('.ms-floor-label');
            if (label && cur) label.textContent = cur.short;
            wrap.classList.toggle('is-all', activeFloor === 'all');
            wrap.querySelectorAll('.ms-floor-option').forEach(o =>
                o.classList.toggle('active', o.dataset.value === activeFloor),
            );
            closeMobileFloorMenu();
            if (currentMode === 'search') renderSearchList();
            else setMode('search');
            snap('full');
        });
    });
}

/* ==================== ASSISTANT TOGGLE (search row) ==================== */
function wireAssistantToggle() {
    const btn = headerEl.querySelector('#msAssistantBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (currentMode === 'assistant') {
            setMode('home');
            snap(0);
        } else {
            setMode('assistant');
            // Half height — keep the map (and its destination zoom) visible up top.
            snap(1);
        }
    });
}

/* ==================== SEARCH BAR (rendered into fixed header) ==================== */
function renderSearchBar(showBack) {
    headerEl.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'ms-search-row';
    // The leading icon inside the field doubles as the Back control while
    // searching (magnifier ⇄ back). The right-side tune button stays put, so
    // the search field never shifts when entering/leaving search.
    const assistOn = currentMode === 'assistant';
    const assistBtn = assistant.isEnabled()
        ? `<button class="ms-assistant-btn ${assistOn ? 'is-active' : ''}" id="msAssistantBtn" type="button" aria-label="Asistan">${assistOn ? SVG.close : SVG.message}</button>`
        : '';
    // Floor filter + assistant toggle share one compact segmented pill.
    row.innerHTML = `
        <div class="ms-search-field">
            <button class="ms-search-leading ${showBack ? 'is-back' : ''}" id="msSearchLeading" type="button" aria-label="${showBack ? 'Geri' : 'Ara'}">
                ${showBack ? SVG.back : SVG.search}
            </button>
            <input type="search" id="msSearchInput" placeholder="Nereyi arıyorsunuz?" enterkeyhint="search" autocomplete="off" value="${searchQuery}">
        </div>
        <div class="ms-search-tools">
            ${buildFloorControlHtml()}
            ${assistBtn}
        </div>`;
    headerEl.appendChild(row);
    wireFloorControl();
    wireAssistantToggle();

    const input = headerEl.querySelector('#msSearchInput');
    const leadingBtn = headerEl.querySelector('#msSearchLeading');

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

    leadingBtn.addEventListener('click', () => {
        if (!showBack) {
            // Magnifier tapped on home → open search (focus triggers setMode).
            input.focus();
            return;
        }
        // Back arrow → exit search; the magnifier returns on re-render.
        input.value = '';
        searchQuery = '';
        activeCategory = null;
        activeFloor = 'all';
        selectingField = null;
        if (state.endPoint && currentMode === 'search') {
            setMode('directions');
            snap(state.startPoint && state.endPoint ? 'fit' : 1);
        } else {
            setMode('home');
            snap(0);
        }
    });

    return input;
}

function clearHeader() {
    headerEl.innerHTML = '';
}

/* ==================== MODE: HOME ==================== */
function renderHome() {
    containerEl.innerHTML = '';
    renderSearchBar(false);

    const grid = document.createElement('div');
    grid.className = 'ms-category-grid';
    grid.id = 'msCategoryGrid';

    const cats = getAvailableCategories();

    const gridCfg = config.theme?.mobile?.categoryGrid || {};
    const defaultCols = gridCfg.defaultColumns || 3;
    const rowDefs = gridCfg.rows || [];

    let idx = 0;
    let rowIdx = 0;
    while (idx < cats.length) {
        const cols = rowDefs[rowIdx] || defaultCols;
        const rowEl = document.createElement('div');
        rowEl.className = 'ms-cat-row';
        const rowCats = cats.slice(idx, idx + cols);
        rowEl.style.gridTemplateColumns = `repeat(${rowCats.length}, 1fr)`;

        rowCats.forEach(cat => {
            const card = document.createElement('div');
            card.className = 'ms-cat-card';
            card.dataset.key = cat.apiKey;
            card.innerHTML = `<span class="ms-cat-icon">${iconHTML(cat.icon, { size: 22 })}</span><span class="ms-cat-label">${cat.displayName}</span>`;
            card.addEventListener('click', () => {
                activeCategory = activeCategory === cat.apiKey ? null : cat.apiKey;
                grid.querySelectorAll('.ms-cat-card').forEach(c =>
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
        requestAnimationFrame(() => {
            snap('home-peek');
            showScrollHint();
        });
    });
}

function showScrollHint() {
    const sheet = document.getElementById('mobileBottomSheet');
    if (!sheet) return;
    const old = sheet.querySelector('.ms-scroll-hint');
    if (old) old.remove();

    requestAnimationFrame(() => {
        if (!containerEl || currentMode !== 'home') return;
        const isScrollable = containerEl.scrollHeight - containerEl.clientHeight > 4;
        if (!isScrollable) return;

        const hint = document.createElement('div');
        hint.className = 'ms-scroll-hint';
        hint.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
        sheet.appendChild(hint);

        const onScroll = () => {
            hint.classList.add('hide');
            containerEl.removeEventListener('scroll', onScroll);
            setTimeout(() => hint.remove(), 400);
        };
        containerEl.addEventListener('scroll', onScroll, { passive: true });
    });
}

/* ==================== MODE: SEARCH (full list) ==================== */
function renderSearch(params = {}) {
    const input = renderSearchBar(true);
    renderSearchList();

    if (!params.fromCategory) {
        requestAnimationFrame(() => input.focus());
    }
}

function renderSearchList() {
    containerEl.innerHTML = '';
    const locs = filterLocations(searchQuery, activeCategory, activeFloor);

    if (locs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ms-empty';
        empty.textContent = searchQuery ? 'Sonuç bulunamadı' : 'Konum yok';
        containerEl.appendChild(empty);
    } else {
        const title = document.createElement('div');
        title.className = 'ms-section-title';
        title.textContent = activeCategory
            ? getCategoryDisplayInfo(activeCategory).label
            : 'Tüm Birimler';
        containerEl.appendChild(title);

        containerEl.appendChild(buildLocationList(locs, (loc) => {
            if (selectingField) {
                onDirectionsLocationPick(loc);
            } else {
                onLocationSelected(loc);
            }
        }));
    }
}

/* ==================== MODE: DETAIL ==================== */
function renderDetail(params = {}) {
    const loc = params.location || state.selectedLocation;
    if (!loc) { renderHome(); return; }

    clearHeader();
    containerEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ms-detail';

    const catInfo = loc.apiCategories?.[0]
        ? getCategoryDisplayInfo(loc.apiCategories[0])
        : { icon: 'map-pin' };
    const displayName = getLocationDisplayName(loc);

    // Peek: header + route + hours (divider below hours is the peek boundary).
    // More: categories, description, contact, gallery — revealed when sheet expands.
    wrap.innerHTML = `
        <div class="ms-detail-peek" data-ms-detail-peek>
            <div class="ms-detail-top">
                <div class="ms-detail-logo">${loc.logo ? `<img src="${loc.logo}" alt="">` : `<span style="font-size:26px">${iconHTML(catInfo.icon, { size: 26 })}</span>`}</div>
                <div style="flex:1"></div>
                <div class="ms-detail-actions-top">
                    <button class="ms-detail-icon-btn" id="msDetailClose">${SVG.close}</button>
                </div>
            </div>
            <div class="ms-detail-name">${displayName}</div>
            <div class="ms-detail-sub">${loc.floor || ''}${loc.category ? (loc.floor ? ' · ' : '') + loc.category : ''}</div>
            <button class="ms-detail-route-btn" id="msDetailRouteBtn">Rota Çiz</button>
            ${buildDetailSectionsHTML(loc, { part: 'peek' })}
        </div>
        <div class="ms-detail-more">
            ${buildDetailSectionsHTML(loc, { part: 'more' })}
        </div>`;

    containerEl.appendChild(wrap);
    renderIcons();

    wireDetailSections(wrap, loc, {
        onSheetExpand: () => snap('full'),
        onRelatedClick: (store) => {
            state.selectedLocation = store;
            eventBus.emit('map:locationSelected', { location: store });
            renderDetail({ location: store });
        },
    });

    // Snap to measured peek height (through hours divider).
    requestAnimationFrame(() => snap('detail-peek'));

    containerEl.querySelector('#msDetailClose').addEventListener('click', () => {
        // If this detail was opened on top of a live route, closing it returns
        // to that route screen — not the home/category cards.
        if (state.routeNavigationActive && state.mobileRouteScreen) {
            const back = state.mobileRouteScreen;
            setMode(back);
            snap(back === 'assistant' ? 1 : 'fit');
            return;
        }
        eventBus.emit('map:deselected');
        setMode('home');
        snap(0);
    });

    containerEl.querySelector('#msDetailRouteBtn').addEventListener('click', () => {
        state.endPoint = loc;
        if (!state.startPoint && isAutoStart()) {
            state.startPoint = config.venue.kioskLocation;
        }
        eventBus.emit('routePoint:updated', { point: 'end', location: loc });
        setMode('directions');
        snap(state.startPoint && state.endPoint ? 'fit' : 1);
    });
}

/* ==================== MODE: DIRECTIONS ==================== */
function renderDirections() {
    const sp = state.startPoint;
    const ep = state.endPoint;
    const pinEnabled = config.features.navigation?.droppedPin?.enabled !== false;

    clearHeader();
    containerEl.innerHTML = '';

    // Fixed (sticky) top: header + route fields + draw button + divider.
    // Only the location list below the divider scrolls.
    const sticky = document.createElement('div');
    sticky.className = 'ms-dir-sticky';
    containerEl.appendChild(sticky);

    // Header
    const header = document.createElement('div');
    header.className = 'ms-dir-header';
    header.innerHTML = `<button class="ms-dir-back" id="msDirBack">${SVG.back}</button><div class="ms-dir-title">Rota</div>`;
    sticky.appendChild(header);

    // Fields + connector
    const fields = document.createElement('div');
    fields.className = 'ms-dir-fields';

    const spName = sp ? (sp.isPinned ? 'Haritadan seçildi' : getLocationDisplayName(sp)) : null;
    const epName = ep ? getLocationDisplayName(ep) : null;
    const spIcon = sp?.apiCategories?.[0] ? iconHTML(getCategoryDisplayInfo(sp.apiCategories[0]).icon, { size: 16 }) : '';
    const epIcon = ep?.apiCategories?.[0] ? iconHTML(getCategoryDisplayInfo(ep.apiCategories[0]).icon, { size: 16 }) : '';

    const showPin = pinEnabled && !isAutoStart() && !sp;

    fields.innerHTML = `
        <div class="ms-dir-connector">
            <div class="ms-dir-dot start"></div>
            <div class="ms-dir-line"></div>
            <div class="ms-dir-dot end"></div>
        </div>
        <div class="ms-dir-inputs">
            <div class="ms-dir-field ${sp ? '' : 'empty'}" id="msDirStart">
                ${sp ? `<span class="ms-dir-field-icon">${spIcon || iconHTML('map-pin', { size: 16 })}</span>` : SVG.search}
                <span class="ms-dir-field-text">${spName || 'Başlangıç Noktası Seç'}</span>
                ${showPin ? `<button class="ms-dir-field-pin" id="msDirPin" title="Pin Bırak">${SVG.pin}</button>` : ''}
            </div>
            <div class="ms-dir-field ${ep ? '' : 'empty'}" id="msDirEnd">
                ${ep ? `<span class="ms-dir-field-icon">${epIcon || iconHTML('map-pin', { size: 16 })}</span>` : SVG.search}
                <span class="ms-dir-field-text">${epName || 'Hedef Noktası Seç'}</span>
            </div>
        </div>`;
    sticky.appendChild(fields);
    renderIcons();

    // Draw button
    const actions = document.createElement('div');
    actions.className = 'ms-dir-actions';
    const canDraw = sp && ep;
    actions.innerHTML = `<button class="ms-dir-draw-btn" id="msDirDraw" ${canDraw ? '' : 'disabled'}>Rota Çiz</button>`;
    sticky.appendChild(actions);

    // Divider marks the boundary — list scrolls in .ms-dir-scroll below.
    const needsStart = !sp && !isAutoStart();
    if (needsStart || !canDraw) {
        const divider = document.createElement('div');
        divider.className = 'ms-divider';
        sticky.appendChild(divider);

        const scroll = document.createElement('div');
        scroll.className = 'ms-dir-scroll';

        const title = document.createElement('div');
        title.className = 'ms-section-title';
        title.textContent = needsStart ? 'Başlangıç noktası seçin' : 'Birim seçin';
        scroll.appendChild(title);

        const locs = filterLocations('', null);
        scroll.appendChild(buildLocationList(locs, (loc) => {
            if (needsStart) {
                state.startPoint = loc;
                eventBus.emit('routePoint:updated', { point: 'start', location: loc });
            } else {
                state.endPoint = loc;
                eventBus.emit('routePoint:updated', { point: 'end', location: loc });
                eventBus.emit('location:selected', { locationId: loc.id, fromMap: false });
            }
            renderDirections();
            snap(state.startPoint && state.endPoint ? 'fit' : 1);
        }));

        containerEl.appendChild(scroll);
    }

    // Event bindings
    containerEl.querySelector('#msDirBack').addEventListener('click', () => {
        if (ep) {
            setMode('detail', { location: ep });
        } else {
            setMode('home');
            snap(0);
        }
    });

    containerEl.querySelector('#msDirStart')?.addEventListener('click', () => {
        selectingField = 'start';
        setMode('search');
        snap(2);
    });

    containerEl.querySelector('#msDirEnd')?.addEventListener('click', () => {
        selectingField = 'end';
        setMode('search');
        snap(2);
    });

    containerEl.querySelector('#msDirPin')?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.editingPoint = 'start';
        eventBus.emit('pin:activate');
        snap(0);
    });

    containerEl.querySelector('#msDirDraw')?.addEventListener('click', () => {
        if (!sp || !ep) return;
        eventBus.emit('route:draw', { fromId: sp.id, toId: ep.id, startPoint: sp });
        setMode('navigation');
        snap('fit');
    });
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
    snap(state.startPoint && state.endPoint ? 'fit' : 1);
}

/* ==================== MODE: NAVIGATION ==================== */
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

    clearHeader();
    containerEl.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ms-nav';

    const stepMarkers = steps.map((s, i) => {
        const pct = totalSteps > 1 ? (i / (totalSteps - 1)) * 100 : 0;
        const type = i === 0 ? 'start' : i === totalSteps - 1 ? 'end' : 'mid';
        const cls = i < navStepIndex ? 'done' : i === navStepIndex ? 'active' : '';
        return `<div class="ms-nav-track-marker ${type} ${cls}" style="left:${pct}%"><span>${SVG[s.icon] || ''}</span></div>`;
    }).join('');

    wrap.innerHTML = `
        <div class="ms-nav-progress">
            <div class="ms-nav-progress-track">
                <div class="ms-nav-progress-fill" style="width: ${progress}%"></div>
                ${stepMarkers}
            </div>
        </div>
        <div class="ms-nav-endpoints">
            <span class="ms-nav-ep-name start">${spName}</span>
            <span class="ms-nav-ep-sep">${eta || '→'}</span>
            <span class="ms-nav-ep-name end">${epName}</span>
        </div>
        
        <div class="ms-nav-step-card" id="msNavStepCard">
            <div class="ms-nav-step-header" id="msNavStepToggle">
                <div class="ms-nav-step-icon">${SVG[currentStep?.icon] || SVG.stepStraight}</div>
                <div class="ms-nav-step-text">${currentStep?.text || 'Rota çizildi'}</div>
                <div class="ms-nav-step-expand">${navStepsExpanded ? SVG.chevronUp : SVG.chevronDown}</div>
            </div>
            <div class="ms-nav-step-list ${navStepsExpanded ? 'expanded' : ''}" id="msNavStepList">
                ${steps.map((s, i) => `
                    <div class="ms-nav-step-item ${i === navStepIndex ? 'active' : ''} ${i < navStepIndex ? 'done' : ''}">
                        <div class="ms-nav-step-bullet">${SVG[s.icon] || ''}</div>
                        <div class="ms-nav-step-label">${s.text}</div>
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="ms-route-type-switch" id="msRouteTypeSwitch">
            ${(config.features.navigation?.routeTypes || [
                { key: 'shortest', label: 'En Kısa', icon: 'stepStraight' },
                { key: 'least_turns', label: 'Az Dönüş', icon: 'stepRight' },
            ]).map(rt => `
                <button class="ms-route-type-btn ${rt.key === activeRouteType ? 'active' : ''}" data-type="${rt.key}">
                    ${SVG[rt.icon] || ''}
                    <span>${rt.label}</span>
                </button>
            `).join('')}
        </div>
        <div class="ms-nav-btns">
            <button class="ms-nav-btn" id="msNavPrev" ${navStepIndex === 0 ? 'disabled' : ''}>${SVG.arrowLeft}</button>
            <button class="ms-nav-btn cancel" id="msNavCancel">${SVG.close}</button>
            <button class="ms-nav-btn" id="msNavNext" ${navStepIndex >= totalSteps - 1 ? 'disabled' : ''}>${SVG.arrowRight}</button>
        </div>`;

    containerEl.appendChild(wrap);

    containerEl.querySelector('#msNavStepToggle').addEventListener('click', () => {
        navStepsExpanded = !navStepsExpanded;
        const list = containerEl.querySelector('#msNavStepList');
        const expandIcon = containerEl.querySelector('.ms-nav-step-expand');
        if (list) list.classList.toggle('expanded', navStepsExpanded);
        if (expandIcon) expandIcon.innerHTML = navStepsExpanded ? SVG.chevronUp : SVG.chevronDown;
    });

    function goNavStep(idx) {
        navStepIndex = idx;
        renderNavigation();
        eventBus.emit('route:navStep', { stepIndex: navStepIndex });
        snap('fit');
    }

    containerEl.querySelector('#msNavPrev').addEventListener('click', () => {
        if (navStepIndex > 0) goNavStep(navStepIndex - 1);
    });

    containerEl.querySelector('#msNavNext').addEventListener('click', () => {
        if (navStepIndex < totalSteps - 1) goNavStep(navStepIndex + 1);
    });

    containerEl.querySelectorAll('.ms-nav-step-item').forEach((el, i) => {
        el.addEventListener('click', () => goNavStep(i));
    });

    containerEl.querySelector('#msNavCancel').addEventListener('click', () => {
        eventBus.emit('route:clear');
        state.startPoint = isAutoStart() ? config.venue.kioskLocation : null;
        state.endPoint = null;
        state.selectedLocation = null;
        selectingField = null;
        routeData = null;
        navStepIndex = 0;
        navStepsExpanded = false;
        activeRouteType = 'shortest';
        setMode('home');
        snap(0);
    });

    containerEl.querySelectorAll('.ms-route-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            if (type === activeRouteType) return;
            activeRouteType = type;
            containerEl.querySelectorAll('.ms-route-type-btn').forEach(b =>
                b.classList.toggle('active', b.dataset.type === type)
            );
            eventBus.emit('route:typeChanged', type);
        });
    });
}

/* ==================== MODE: ASSISTANT ==================== */
function renderAssistant() {
    // Keep the search bar pinned so its toggle (now an ✕) can close the panel.
    renderSearchBar(false);
    containerEl.innerHTML = '';
    assistant.mount(containerEl);
}

/* ==================== LOCATION SELECTED (from list) ==================== */
function onLocationSelected(loc) {
    state.selectedLocation = loc;
    state.endPoint = loc;
    if (!state.startPoint && isAutoStart()) {
        state.startPoint = config.venue.kioskLocation;
    }
    eventBus.emit('routePoint:updated', { point: 'end', location: loc });
    eventBus.emit('location:selected', { locationId: loc.id, fromMap: false });
    searchQuery = '';
    activeCategory = null;
    activeFloor = 'all';
    setMode('detail', { location: loc });
}

/* ==================== PUBLIC API ==================== */
function removeScrollHint() {
    const sheet = document.getElementById('mobileBottomSheet');
    const old = sheet?.querySelector('.ms-scroll-hint');
    if (old) old.remove();
}

function setMode(mode, params = {}) {
    if (mode !== 'detail' && currentMode === 'detail') {
        import('./index.js').then(m => m.resetSnapPoints());
    }
    currentMode = mode;
    state.mobileSheetMode = mode;
    // Remember which route screen is live so a unit-detail opened over the
    // route can come back to it; clear it once we're truly home.
    if (mode === 'navigation' || mode === 'assistant') state.mobileRouteScreen = mode;
    else if (mode === 'home') state.mobileRouteScreen = null;
    // The bouncing "scroll for more" chevron belongs only to the home grid.
    if (mode !== 'home') removeScrollHint();
    if (containerEl) containerEl.classList.toggle('ms-dir-mode', mode === 'directions');
    switch (mode) {
        case 'home':       renderHome(); break;
        case 'search':     renderSearch(params); break;
        case 'detail':     renderDetail(params); break;
        case 'directions': renderDirections(); break;
        case 'navigation': renderNavigation(); break;
        case 'assistant':  renderAssistant(); break;
        default:           renderHome();
    }
}

export const sheetContent = {
    init(el) {
        containerEl = el;
        headerEl = document.getElementById('mobileSheetHeader');
        renderHome();

        eventBus.on('sheet:requestSnap', (level) => {
            import('./index.js').then(m => m.snapSheet(level));
        });

        eventBus.on('categories:updated', () => {
            if (currentMode === 'home') renderHome();
        });

        eventBus.on('route:result', (data) => {
            routeData = data;
            if (data?.routeType) activeRouteType = data.routeType;
            navStepIndex = 0;
            navStepsExpanded = false;
            if (currentMode === 'navigation') {
                renderNavigation();
                snap('fit');
            }
        });
    },

    setMode,

    getMode() {
        return currentMode;
    },

    refreshRoute() {
        if (currentMode === 'directions') renderDirections();
    },
};
