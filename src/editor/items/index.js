/**
 * Birimler tab — clean, sheet-driven item editor.
 *
 * Layout (three columns):
 *
 *   ┌────────────────── toolbar (source pill, sync, reload) ─────────┐
 *   ├──────────────┬─────────────────────────┬─────────────────────┤
 *   │  list rail   │     live preview map    │     edit drawer     │
 *   │  (320px)     │     (full kiosk render) │     (380px)         │
 *   │              │     via iframe          │     hidden until    │
 *   │              │                          │     item selected   │
 *   └──────────────┴─────────────────────────┴─────────────────────┘
 *
 * Communication:
 *   - List ↔ map sync via postMessage to the embedded preview iframe.
 *   - Polygon click in iframe → `preview:itemClicked` → selectItem().
 *   - selectItem(id) updates the edit drawer + tells iframe to highlight.
 *
 * Edits are stored in `kv:itemEdits` (IDB) + mirrored to localStorage
 * so the preview iframe (same origin) picks them up on its next
 * sheet fetch.
 */

import { storage } from '../storage.js';
import { fetchSheetTab, pickTab } from '../../core/sheets.js';
import { sheetWriter } from '../sheet-writer.js';
import { iconHTML, renderIcons } from '../../core/icon.js';
import { initItemForm } from './edit-form.js';
import { initItemsPreview } from './items-preview.js';

const STATE = {
    started: false,
    rows:    [],
    edits:   {},
    cats:    [],
    floorMap:{},
    activeFloor: null,
    selectedId: null,
    search:  '',
    listFilter: 'all',
    loadError: null,
};

let host = null;
let app  = null;
let previewHandle = null;

const HTML = `
<div class="ed-items">
    <header class="ed-items-topbar">
        <div class="ed-items-title-block">
            <h1>Birimler</h1>
            <div class="ed-items-meta" id="itMeta"></div>
        </div>
        <div class="ed-items-actions">
            <button type="button" class="ed-btn ed-btn-ghost" id="itTest">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
                <span>Bağlantıyı Test Et</span>
            </button>
            <button type="button" class="ed-btn ed-btn-ghost" id="itReload">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                <span>Sheet'i Yenile</span>
            </button>
            <button type="button" class="ed-btn ed-btn-primary ed-items-sync" id="itSync" disabled>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                <span id="itSyncLabel">Sheet'e Sync</span>
            </button>
            <button type="button" class="ed-btn ed-btn-ghost ed-items-discard" id="itDiscard" hidden>Yerel değişiklikleri at</button>
        </div>
    </header>

    <div class="ed-items-toast" id="itToast" hidden></div>

    <div class="ed-items-body">

        <aside class="ed-items-list-rail">
            <div class="ed-items-search-row">
                <div class="ed-items-search-input">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    <input type="search" id="itSearch" placeholder="Ara… (ID, isim, kategori)" autocomplete="off">
                </div>
                <select id="itFilter" class="ed-items-filter">
                    <option value="all">Tümü</option>
                    <option value="dirty">Düzenlenenler</option>
                </select>
            </div>

            <div class="ed-items-floor-tabs" id="itFloorTabs"></div>

            <div class="ed-items-list-scroll" id="itList"></div>

            <div class="ed-items-list-empty" id="itListEmpty" hidden></div>
        </aside>

        <section class="ed-items-preview" id="itPreviewHost"></section>

        <aside class="ed-items-drawer" id="itDrawer" data-state="empty">
            <div class="ed-items-drawer-empty">
                <div class="ed-items-drawer-empty-icon">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </div>
                <div class="ed-items-drawer-empty-title">Düzenlemek için bir birim seçin</div>
                <div class="ed-items-drawer-empty-hint">Soldaki listeden ya da haritadan bir birime tıklayın.</div>
            </div>
        </aside>

    </div>
</div>
`;

export function initItemsTab(_host, _app) {
    host = _host;
    app  = _app;

    return {
        async activate() {
            if (STATE.started) {
                /* Re-entrancy: refresh edits + categories from local IDB
                 * (Categories tab may have written newer data). Cheap and
                 * keeps the dropdown current without a sheet round-trip. */
                STATE.edits = await storage.getItemEdits();
                await refreshCategoriesFromLocal();
                renderAll();
                return;
            }
            STATE.started = true;
            host.innerHTML = HTML;
            wireEvents();
            mountPreview();
            await loadInitial();
            renderAll();
        },
    };
}

/* ──────────────────────────── load ───────────────────────────── */

async function loadInitial() {
    STATE.floorMap = app.getConfig()?.venue?.floorMap || {};
    await Promise.all([loadCategories(), loadItems()]);
    STATE.edits = await storage.getItemEdits();

    const floors = collectFloors();
    if (!STATE.activeFloor || !floors.includes(STATE.activeFloor)) {
        STATE.activeFloor = floors[0] || null;
    }
}

async function refreshCategoriesFromLocal() {
    /* On tab re-entry, prefer the freshly mirrored IDB copy over an
     * older sheet snapshot. The Categories tab writes to IDB on every
     * edit, so this guarantees the chip dropdown stays current without
     * us holding stale data. */
    try {
        const local = await storage.getCategories();
        if (Array.isArray(local?.categories) && local.categories.length) {
            STATE.cats = local.categories.map(c => ({
                apiKey: c.apiKey,
                color: c.color || '#cbd5e1',
                displayName: c.displayName || c.apiKey,
                displayName_en: c.displayName_en || c.displayName || c.apiKey,
                icon: c.icon || '🏷️',
                order: Number.isFinite(c.order) ? c.order : 999,
            })).sort((a, b) => a.order - b.order);
        }
    } catch {}
}

async function loadCategories() {
    const cfg = app.getConfig()?.venue?.sheets;
    const tab = pickTab(cfg, 'categories');

    // Try sheet first
    if (cfg?.sheetId && tab) {
        try {
            const rows = await fetchSheetTab(cfg.sheetId, tab);
            STATE.cats = rows.map(rowToCat).filter(Boolean)
                .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
            if (STATE.cats.length) return;
        } catch (e) {
            console.warn('[items] categories sheet fetch failed', e);
            STATE.loadError = `Kategori sekmesi okunamadı: ${e.message}`;
        }
    }

    // Fallback to IDB-stored categories (set by Categories tab).
    try {
        const local = await storage.getCategories();
        if (Array.isArray(local?.categories)) {
            STATE.cats = local.categories.map(c => ({
                apiKey: c.apiKey,
                color: c.color || '#cbd5e1',
                displayName: c.displayName || c.apiKey,
                displayName_en: c.displayName_en || c.displayName || c.apiKey,
                icon: c.icon || '🏷️',
                order: Number.isFinite(c.order) ? c.order : 999,
            })).sort((a, b) => a.order - b.order);
        } else {
            STATE.cats = [];
        }
    } catch {
        STATE.cats = [];
    }
}

async function loadItems() {
    STATE.loadError = null;
    const cfg = app.getConfig()?.venue?.sheets;
    const tab = pickTab(cfg, 'list', 'gid');
    if (!cfg?.sheetId || !tab) {
        STATE.rows = [];
        STATE.loadError = 'Sheets bağlantısı yok. Ayarlar → "Sheets Sheet ID" ve "Birim Listesi Sekmesi" alanlarını doldurun.';
        return;
    }
    try {
        STATE.rows = await fetchSheetTab(cfg.sheetId, tab);
    } catch (e) {
        console.error('[items] list fetch failed', e);
        STATE.rows = [];
        STATE.loadError = `Birim listesi yüklenemedi: ${e.message}`;
    }
}

function rowToCat(row) {
    const apiKey = (row.Category || '').trim();
    if (!apiKey) return null;
    const order = parseInt(row.Order || '', 10);
    return {
        apiKey,
        color: (row.Color || '#cbd5e1').trim(),
        displayName: (row.DisplayName_TR || row.Cat_TR || row.DisplayName || apiKey).trim(),
        displayName_en: (row.DisplayName_EN || row.DisplayName || apiKey).trim(),
        icon: (row.Icon || '🏷️').trim(),
        order: Number.isFinite(order) ? order : 999,
    };
}

function collectFloors() {
    const set = new Set();
    for (const r of STATE.rows) {
        const f = (r.Floor || '0').toString().trim();
        if (f) set.add(f);
    }
    return [...set].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

/* ──────────────────────── wiring & preview ─────────────────────── */

function wireEvents() {
    host.querySelector('#itReload').addEventListener('click', async () => {
        showToast('Sheet yenileniyor…', 'progress');
        await loadItems();
        STATE.edits = await storage.getItemEdits();
        renderAll();
        previewHandle?.reload?.();
        const dirty = countDirty();
        showToast(
            `Birimler yenilendi · ${STATE.rows.length} kayıt${dirty ? ` · ${dirty} yerel düzenleme korundu` : ''}`,
            STATE.loadError ? 'error' : 'success',
        );
    });

    host.querySelector('#itSync').addEventListener('click', () => syncNow());
    host.querySelector('#itDiscard').addEventListener('click', () => discardLocal());
    host.querySelector('#itTest').addEventListener('click', () => runConnectionDiagnostic());

    host.querySelector('#itSearch').addEventListener('input', (e) => {
        STATE.search = e.target.value.trim().toLowerCase();
        renderList();
    });
    host.querySelector('#itFilter').addEventListener('change', (e) => {
        STATE.listFilter = e.target.value;
        renderList();
    });
}

function mountPreview() {
    const $preview = host.querySelector('#itPreviewHost');
    previewHandle = initItemsPreview($preview, {
        onItemClicked: (id) => {
            // Polygon clicked on the map iframe
            STATE.selectedId = id || null;
            renderList();
            renderDrawer();
            // Don't echo back the highlight — the iframe already shows it
        },
        onReady: () => {
            // After ready, if there's already a selection, ask iframe to highlight
            if (STATE.selectedId) previewHandle.setActiveItem(STATE.selectedId);
        },
    });
}

function selectItem(id) {
    STATE.selectedId = id;
    renderList();
    renderDrawer();
    previewHandle?.setActiveItem(id);
}

/* ──────────────────────────── rendering ─────────────────────────── */

function renderAll() {
    renderMeta();
    renderActionButtons();
    renderFloorTabs();
    renderList();
    renderDrawer();
}

function renderMeta() {
    const $meta = host.querySelector('#itMeta');
    if (!$meta) return;
    const cfg = app.getConfig()?.venue?.sheets;
    const tab = pickTab(cfg, 'list', 'gid');
    const dirty = countDirty();
    const hasEndpoint = !!cfg?.writeEndpointUrl;

    const parts = [];
    if (cfg?.sheetId && tab) {
        parts.push(`<span class="ed-items-pill ok"><span class="ed-items-pill-dot"></span>Sheets</span>`);
        parts.push(`<code>${escapeHtml(tab)}</code>`);
        parts.push(`<span class="ed-items-meta-sep">·</span>`);
        parts.push(`<span>${STATE.rows.length} birim</span>`);
    } else {
        parts.push(`<span class="ed-items-pill warn"><span class="ed-items-pill-dot"></span>Bağlı değil</span>`);
        parts.push(`<span>Ayarlar sekmesinden Sheets'i bağlayın</span>`);
    }
    if (hasEndpoint) {
        parts.push(`<span class="ed-items-meta-sep">·</span>`);
        parts.push(`<span class="ed-items-pill subtle"><span class="ed-items-pill-dot"></span>Write endpoint</span>`);
    }
    if (dirty > 0) {
        parts.push(`<span class="ed-items-meta-sep">·</span>`);
        parts.push(`<span class="ed-items-pill dirty">${dirty} yerel değişiklik</span>`);
    }
    $meta.innerHTML = parts.join(' ');

    if (STATE.loadError) showToast(STATE.loadError, 'error', { sticky: true });
}

function renderActionButtons() {
    const cfg = app.getConfig()?.venue?.sheets;
    const dirty = countDirty();
    const tab = pickTab(cfg, 'list', 'gid');
    const $sync    = host.querySelector('#itSync');
    const $syncLbl = host.querySelector('#itSyncLabel');
    const $discard = host.querySelector('#itDiscard');

    const hasEndpoint = !!cfg?.writeEndpointUrl;
    const hasConn     = !!(cfg?.sheetId && tab);
    const canSync     = hasEndpoint && hasConn && dirty > 0;

    if ($sync) {
        $sync.disabled = !canSync;
        if (!hasEndpoint) $sync.title = 'Önce Ayarlar → "Sheets Yazma Endpoint" alanını doldurun';
        else if (!hasConn) $sync.title = 'Önce Sheets bağlantısını kurun';
        else if (dirty === 0) $sync.title = 'Senkronlanacak değişiklik yok';
        else $sync.title = `${dirty} değişikliği sheet'e gönder`;
    }
    if ($syncLbl) {
        $syncLbl.textContent = canSync ? `Sheet'e Sync (${dirty})` : 'Sheet\'e Sync';
    }
    if ($discard) $discard.hidden = dirty === 0;
}

function renderFloorTabs() {
    const floors = collectFloors();
    const $tabs = host.querySelector('#itFloorTabs');
    if (!$tabs) return;
    $tabs.innerHTML = '';
    if (floors.length <= 1) { $tabs.style.display = 'none'; return; }
    $tabs.style.display = 'flex';

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'ed-items-floor-tab' + (STATE.activeFloor === null ? ' is-active' : '');
    allBtn.textContent = 'Tümü';
    allBtn.addEventListener('click', () => { STATE.activeFloor = null; renderFloorTabs(); renderList(); });
    $tabs.appendChild(allBtn);

    for (const fk of floors) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ed-items-floor-tab' + (STATE.activeFloor === fk ? ' is-active' : '');
        btn.textContent = STATE.floorMap[fk] || `Kat ${fk}`;
        btn.addEventListener('click', () => { STATE.activeFloor = fk; renderFloorTabs(); renderList(); });
        $tabs.appendChild(btn);
    }
}

function renderList() {
    const $list  = host.querySelector('#itList');
    const $empty = host.querySelector('#itListEmpty');
    if (!$list || !$empty) return;
    $list.innerHTML = '';

    const filtered = filteredRows();

    if (!filtered.length) {
        $empty.hidden = false;
        if (!STATE.rows.length) {
            $empty.innerHTML = STATE.loadError
                ? `<div class="ed-items-list-empty-msg error">${escapeHtml(STATE.loadError)}</div>`
                : `<div class="ed-items-list-empty-msg">Sheet henüz yüklenmedi.</div>`;
        } else {
            $empty.innerHTML = `<div class="ed-items-list-empty-msg">Eşleşen birim yok.</div>`;
        }
        return;
    }
    $empty.hidden = true;

    /* Virtualised-ish: build all rows in a fragment, then attach once. */
    const frag = document.createDocumentFragment();
    for (const row of filtered) frag.appendChild(buildListRow(row));
    $list.appendChild(frag);
    renderIcons();
}

function buildListRow(row) {
    const id = (row.ID || '').trim();
    const merged = mergeRowWithEdit(row);
    const cats = (merged.Category || '').split(',').map(s => s.trim()).filter(Boolean);
    const primaryKey = STATE.edits[id]?.primaryCategory || cats[0] || '';
    const cat = STATE.cats.find(c => c.apiKey === primaryKey);
    const dirty = !!STATE.edits[id]?.dirty;
    const active = id === STATE.selectedId;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ed-items-row' + (active ? ' is-active' : '') + (dirty ? ' is-dirty' : '');
    btn.dataset.id = id;
    btn.innerHTML = `
        <span class="ed-items-row-swatch" style="background:${escapeHtml(cat?.color || '#cbd5e1')}"></span>
        <span class="ed-items-row-body">
            <span class="ed-items-row-head">
                <span class="ed-items-row-title">${escapeHtml(merged.Title || '(başlıksız)')}</span>
                <span class="ed-items-row-id">${escapeHtml(id)}</span>
            </span>
            <span class="ed-items-row-tail">
                <span class="ed-items-row-floor">${escapeHtml(STATE.floorMap[merged.Floor] || `Kat ${merged.Floor || '?'}`)}</span>
                ${cat ? `<span class="ed-items-row-cat-chip">${iconHTML(cat.icon, { size: 12 })} <span>${escapeHtml(cat.displayName)}</span></span>` : ''}
            </span>
        </span>
        ${dirty ? '<span class="ed-items-row-dot" title="kaydedilmemiş"></span>' : ''}
    `;
    btn.addEventListener('click', () => selectItem(id));
    return btn;
}

function filteredRows() {
    const q = STATE.search;
    const filter = STATE.listFilter;
    const fk = STATE.activeFloor;
    return STATE.rows.filter(r => {
        const id = (r.ID || '').trim();
        if (!id) return false;
        const merged = mergeRowWithEdit(r);
        if (fk && (merged.Floor || '0').toString() !== fk) return false;
        if (filter === 'dirty' && !STATE.edits[id]?.dirty) return false;
        if (q) {
            const hay = `${id} ${merged.Title || ''} ${merged.Subtitle || ''} ${merged.Category || ''}`.toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

/* ─────────────────────────── edit drawer ──────────────────────── */

function renderDrawer() {
    const $drawer = host.querySelector('#itDrawer');
    if (!$drawer) return;

    if (!STATE.selectedId) {
        $drawer.dataset.state = 'empty';
        $drawer.innerHTML = `
            <div class="ed-items-drawer-empty">
                <div class="ed-items-drawer-empty-icon">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </div>
                <div class="ed-items-drawer-empty-title">Düzenlemek için bir birim seçin</div>
                <div class="ed-items-drawer-empty-hint">Soldaki listeden ya da haritadan bir birime tıklayın.</div>
            </div>
        `;
        return;
    }

    const row = STATE.rows.find(r => (r.ID || '').trim() === STATE.selectedId);
    if (!row) {
        $drawer.dataset.state = 'missing';
        $drawer.innerHTML = `
            <div class="ed-items-drawer-empty">
                <div class="ed-items-drawer-empty-title">Birim sheet'te bulunamadı</div>
                <code>${escapeHtml(STATE.selectedId)}</code>
                <button type="button" class="ed-btn ed-btn-ghost" id="itDrawerClose">Kapat</button>
            </div>
        `;
        $drawer.querySelector('#itDrawerClose')?.addEventListener('click', () => selectItem(null));
        return;
    }

    $drawer.dataset.state = 'editing';
    $drawer.innerHTML = `
        <header class="ed-items-drawer-header">
            <div class="ed-items-drawer-id">
                <code>${escapeHtml(STATE.selectedId)}</code>
                ${STATE.edits[STATE.selectedId]?.dirty
                    ? '<span class="ed-items-pill warn">Yerel düzenleme</span>'
                    : '<span class="ed-items-pill subtle">Sheet ile eş</span>'}
            </div>
            <button type="button" class="ed-items-drawer-close" id="itDrawerClose" title="Kapat">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        </header>
        <div class="ed-items-drawer-form" id="itDrawerForm"></div>
    `;
    $drawer.querySelector('#itDrawerClose')?.addEventListener('click', () => selectItem(null));

    initItemForm($drawer.querySelector('#itDrawerForm'), {
        row: mergeRowWithEdit(row),
        cats: STATE.cats,
        primaryCategory: STATE.edits[STATE.selectedId]?.primaryCategory
            || (mergeRowWithEdit(row).Category || '').split(',')[0]?.trim()
            || '',
        floorMap: STATE.floorMap,
        floors: collectFloors(),
        dirty: !!STATE.edits[STATE.selectedId]?.dirty,
        onChange: (patch, primary) => applyEdit(STATE.selectedId, patch, primary),
        onRevert: () => {
            delete STATE.edits[STATE.selectedId];
            persistEdits();
            renderAll();
        },
    });
}

function applyEdit(id, patch, primaryCategory) {
    const isClean = !patch || Object.keys(patch).length === 0;
    if (isClean) {
        if (STATE.edits[id]) {
            delete STATE.edits[id];
            persistEdits();
            renderMeta();
            renderActionButtons();
            // Touch only the affected row so we don't lose scroll
            const $row = host.querySelector(`.ed-items-row[data-id="${id.replace(/"/g, '\\"')}"]`);
            if ($row) $row.classList.remove('is-dirty');
        }
        return;
    }
    STATE.edits[id] = {
        patch,
        primaryCategory: primaryCategory || null,
        dirty: true,
        lastModified: new Date().toISOString(),
    };
    persistEdits();
    renderMeta();
    renderActionButtons();
    const $row = host.querySelector(`.ed-items-row[data-id="${id.replace(/"/g, '\\"')}"]`);
    if ($row) $row.classList.add('is-dirty');
}

async function persistEdits() {
    await storage.setItemEdits(STATE.edits);
}

function countDirty() {
    return Object.values(STATE.edits).filter(e => e.dirty).length;
}

/* ────────────────────────── sync / discard ─────────────────────── */

async function syncNow() {
    const cfg = app.getConfig()?.venue?.sheets;
    if (!cfg?.writeEndpointUrl) {
        showToast('Endpoint URL yok — Ayarlar → "Sheets Yazma Endpoint" alanını doldurun.', 'error');
        return;
    }
    const tab = pickTab(cfg, 'list', 'gid');
    if (!tab) { showToast('Liste sekmesi tanımlı değil.', 'error'); return; }

    const dirty = Object.entries(STATE.edits).filter(([, e]) => e.dirty);
    if (!dirty.length) { showToast('Senkronlanacak değişiklik yok.', 'subtle'); return; }

    /* Send only changed fields + ID. Apps Script preserves untouched
     * columns even if a teammate edited them concurrently. */
    const rows = dirty.map(([id, rec]) => ({ ...(rec.patch || {}), ID: id }));

    const $sync = host.querySelector('#itSync');
    const $syncLbl = host.querySelector('#itSyncLabel');
    if ($sync) $sync.disabled = true;
    if ($syncLbl) $syncLbl.textContent = 'Gönderiliyor…';

    showToast(`${dirty.length} birim Sheets'e gönderiliyor…`, 'progress');

    try {
        const res = await sheetWriter.upsertRows({
            sheetId: cfg.sheetId,
            tab,
            keyColumn: 'ID',
            rows,
            endpointUrl: cfg.writeEndpointUrl,
        });
        if (!res.ok) throw new Error(res.error || 'sync failed');

        // Apply patches to the local rows array so list reflects new state
        for (const [id, rec] of dirty) {
            const idx = STATE.rows.findIndex(r => (r.ID || '').trim() === id);
            if (idx >= 0) STATE.rows[idx] = { ...STATE.rows[idx], ...rec.patch };
            delete STATE.edits[id];
        }
        await persistEdits();
        renderAll();
        previewHandle?.reload?.();
        showToast(
            `${dirty.length} birim Sheets'e gönderildi ✓` +
            (res.updated?.length ? ` · ${res.updated.length} güncellendi` : '') +
            (res.inserted?.length ? ` · ${res.inserted.length} eklendi` : ''),
            'success',
        );
    } catch (e) {
        console.error(e);
        showToast(`Sync başarısız: ${e.message}`, 'error');
    } finally {
        renderActionButtons();
    }
}

async function runConnectionDiagnostic() {
    const cfg = app.getConfig()?.venue?.sheets;
    if (!cfg?.sheetId) {
        showDiagnostic([{ name: 'Sheets', ok: false, msg: 'Sheet ID boş. Ayarlar → "Sheets Sheet ID" alanını doldurun.' }]);
        return;
    }

    showToast('Bağlantı test ediliyor…', 'progress');

    const results = [];

    // Test 1: list tab
    const listTab = pickTab(cfg, 'list', 'gid');
    if (!listTab) {
        results.push({ name: 'Birim Listesi sekmesi', ok: false, msg: 'tabs.list veya gid yok' });
    } else {
        try {
            const rows = await fetchSheetTab(cfg.sheetId, listTab);
            results.push({
                name: 'Birim Listesi sekmesi',
                ok: true,
                msg: `${rows.length} satır okundu (${listTab})`,
            });
        } catch (e) {
            results.push({ name: 'Birim Listesi sekmesi', ok: false, msg: e.message });
        }
    }

    // Test 2: categories tab
    const catTab = pickTab(cfg, 'categories');
    if (!catTab) {
        results.push({ name: 'Kategoriler sekmesi', ok: false, msg: 'tabs.categories tanımlı değil — kategori dropdown\'u boş kalacak.' });
    } else {
        try {
            const rows = await fetchSheetTab(cfg.sheetId, catTab);
            results.push({
                name: 'Kategoriler sekmesi',
                ok: true,
                msg: `${rows.length} kategori okundu (${catTab})`,
            });
        } catch (e) {
            results.push({ name: 'Kategoriler sekmesi', ok: false, msg: e.message });
        }
    }

    // Test 3: info tab (optional)
    const infoTab = pickTab(cfg, 'info');
    if (infoTab) {
        try {
            const rows = await fetchSheetTab(cfg.sheetId, infoTab);
            results.push({
                name: 'Info sekmesi',
                ok: true,
                msg: `${rows.length} satır okundu (${infoTab})`,
            });
        } catch (e) {
            results.push({ name: 'Info sekmesi', ok: false, msg: e.message });
        }
    }

    // Test 4: write endpoint
    if (cfg.writeEndpointUrl) {
        try {
            const res = await sheetWriter.ping(cfg.writeEndpointUrl);
            if (res.ok) {
                results.push({ name: 'Yazma endpoint', ok: true, msg: `Apps Script ${res.version || 'OK'}` });
            } else {
                results.push({ name: 'Yazma endpoint', ok: false, msg: res.error });
            }
        } catch (e) {
            results.push({ name: 'Yazma endpoint', ok: false, msg: e.message });
        }
    } else {
        results.push({ name: 'Yazma endpoint', ok: false, msg: 'Tanımlı değil. Sync için Apps Script URL gerekli.' });
    }

    showDiagnostic(results);
}

function showDiagnostic(results) {
    const $toast = host.querySelector('#itToast');
    if (!$toast) return;
    if (toastTimer) clearTimeout(toastTimer);

    const allOk = results.every(r => r.ok);
    const lines = results.map(r =>
        `<div class="ed-items-diag-line ${r.ok ? 'ok' : 'fail'}">
            <span class="ed-items-diag-icon">${r.ok ? '✓' : '✗'}</span>
            <span class="ed-items-diag-name">${escapeHtml(r.name)}</span>
            <span class="ed-items-diag-msg">${escapeHtml(r.msg)}</span>
        </div>`,
    ).join('');

    $toast.className = 'ed-items-toast is-' + (allOk ? 'success' : 'error');
    $toast.innerHTML = `
        <div class="ed-items-diag">
            <div class="ed-items-diag-header">
                <strong>${allOk ? 'Bağlantı OK' : 'Bağlantıda sorun var'}</strong>
                <button type="button" class="ed-items-toast-close" aria-label="Kapat">×</button>
            </div>
            <div class="ed-items-diag-body">${lines}</div>
        </div>
    `;
    $toast.hidden = false;
    $toast.querySelector('.ed-items-toast-close')?.addEventListener('click', () => { $toast.hidden = true; });
}

async function discardLocal() {
    const n = countDirty();
    if (!n) { showToast('Atılacak yerel değişiklik yok.', 'subtle'); return; }
    if (!confirm(`${n} yerel düzenleme silinecek. Devam?`)) return;
    STATE.edits = {};
    await storage.clearItemEdits();
    renderAll();
    previewHandle?.reload?.();
    showToast('Yerel değişiklikler atıldı.', 'success');
}

function mergeRowWithEdit(row) {
    const id = (row.ID || '').trim();
    const patch = STATE.edits[id]?.patch || {};
    return { ...row, ...patch };
}

/* ──────────────────────────── toast ────────────────────────────── */

let toastTimer = null;
function showToast(message, kind = 'subtle', opts = {}) {
    const $toast = host.querySelector('#itToast');
    if (!$toast) return;
    if (toastTimer) clearTimeout(toastTimer);
    $toast.className = 'ed-items-toast is-' + kind;
    $toast.innerHTML = `
        <span class="ed-items-toast-icon">${iconForKind(kind)}</span>
        <span class="ed-items-toast-message">${escapeHtml(message)}</span>
        ${opts.sticky ? '' : '<button type="button" class="ed-items-toast-close" aria-label="Kapat">×</button>'}
    `;
    $toast.hidden = false;
    if (!opts.sticky) {
        $toast.querySelector('.ed-items-toast-close')?.addEventListener('click', () => { $toast.hidden = true; });
        toastTimer = setTimeout(() => { $toast.hidden = true; }, 4500);
    }
}

function iconForKind(kind) {
    switch (kind) {
        case 'success':  return '✓';
        case 'error':    return '!';
        case 'progress': return '⟳';
        default:         return 'ⓘ';
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
