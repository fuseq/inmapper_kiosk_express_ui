/**
 * Categories tab — sheet-driven category editor.
 *
 * Source of truth (in priority order):
 *   1. Live Sheets (`venue.sheets.tabs.categories`)
 *   2. Local IDB override (legacy carry-over for venues without sheets)
 *
 * Editing:
 *   - Color picker, icon (emoji), DisplayName_TR, DisplayName_EN, Order
 *   - Drag-and-drop reordering (writes back the new "Order" values)
 *   - "Sheet'e Sync" button when writeEndpointUrl is configured;
 *     otherwise edits stay local (and will be picked up by next venue
 *     export).
 *
 * Schema (sheet columns):
 *   Category, Color, DisplayName_TR, DisplayName_EN, Icon, Order
 */

import { storage } from '../storage.js';
import { fetchSheetTab, pickTab } from '../../core/sheets.js';
import { sheetWriter } from '../sheet-writer.js';
import { iconHTML, renderIcons } from '../../core/icon.js';

let started = false;
let host = null;
let app = null;
let data = null;        // {categories: [...], source: 'sheets'|'local'|'empty'}
let editingIndex = -1;

const HTML = `
<div class="ed-cat-grid">
  <aside class="ed-cat-sidebar">
    <div class="ed-cat-source" id="catSource"></div>
    <div class="ed-cat-toolbar">
      <button type="button" class="ed-mb-btn ed-mb-btn-primary" id="catAdd">+ Yeni</button>
      <button type="button" class="ed-mb-btn ed-mb-btn-ghost" id="catReload">Yenile</button>
      <button type="button" class="ed-mb-btn ed-mb-btn-primary" id="catSync" hidden>Sheet'e Sync</button>
    </div>
    <div class="ed-cat-hint" id="catHint"></div>
    <div class="ed-cat-list" id="catList"></div>
  </aside>
  <section class="ed-cat-editor" id="catEditor">
    <div class="ed-cat-empty">Bir kategori seçin veya "+ Yeni" oluşturun.</div>
  </section>
</div>
`;

const FORM_HTML = `
<form class="ed-cat-form">
  <div class="ed-cat-row-grid">
    <label>API Key
      <input type="text" name="apiKey" required placeholder="fashion">
    </label>
    <label>Sıra
      <input type="number" name="order" min="0" max="9999" step="1" placeholder="999">
    </label>
  </div>
  <label>Renk
    <div class="ed-cat-color-row">
      <input type="color" name="color">
      <input type="text" name="colorHex" placeholder="#E74C3C">
    </div>
  </label>
  <label>İkon
    <div class="ed-cat-icon-row">
      <span class="ed-cat-icon-preview" id="catIconPreview" title="Önizleme"></span>
      <input type="text" name="icon" placeholder="gem / 💎 / https://…/icon.png" maxlength="2048" title="Lucide icon adı, emoji ya da bir görsel URL/Data URL'i">
      <button type="button" class="ed-mb-btn ed-mb-btn-ghost ed-cat-icon-upload" id="catIconUpload" title="Bilgisayardan görsel yükle (PNG, SVG, …)">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span>Yükle</span>
      </button>
      <input type="file" id="catIconFile" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" hidden>
    </div>
    <span class="ed-cat-icon-hint-row">
      <a class="ed-cat-icon-hint" href="https://lucide.dev/icons/" target="_blank" rel="noopener">Lucide icon listesi ↗</a>
      <span class="ed-cat-icon-sep">·</span>
      <span class="ed-cat-icon-hint">Lucide ismi · emoji · URL · yüklenmiş görsel</span>
    </span>
  </label>
  <div class="ed-cat-row-grid-2">
    <label>Görünen İsim (TR)
      <input type="text" name="displayName" placeholder="Moda">
    </label>
    <label>Görünen İsim (EN)
      <input type="text" name="displayName_en" placeholder="Fashion">
    </label>
  </div>
  <label>Açıklama
    <textarea name="description" rows="2"></textarea>
  </label>
  <div class="ed-cat-form-actions">
    <button type="button" class="ed-mb-btn ed-mb-btn-primary" id="catSave">Kaydet</button>
    <button type="button" class="ed-mb-btn ed-mb-btn-ghost" id="catDelete">Sil</button>
  </div>
</form>
`;

export function initCategories(_host, _app) {
    host = _host;
    app  = _app;
    return {
        async activate() {
            if (started) return;
            started = true;
            host.innerHTML = HTML;
            await load();
            wire();
            renderAll();
        },
    };
}

async function load() {
    /* Sheet first (when configured), with local IDB override as a
     * pure fallback. The local override is *only* meaningful when the
     * venue isn't sheet-backed yet — once the user wires up Sheets we
     * silently stop using the override on read but keep it written so
     * an undo is possible until the next clearAll. */
    const sheets = app.getConfig()?.venue?.sheets;
    const tab = pickTab(sheets, 'categories');
    let lastError = null;
    if (sheets?.sheetId && tab) {
        try {
            const rows = await fetchSheetTab(sheets.sheetId, tab);
            data = {
                source: 'sheets',
                categories: rows.map(rowToCategory).filter(Boolean)
                    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
            };
            return;
        } catch (e) {
            console.warn('[categories] sheet fetch failed', e);
            lastError = e.message || String(e);
        }
    }
    const local = await storage.getCategories();
    data = {
        source: lastError ? 'error' : (local ? 'local' : 'empty'),
        error: lastError,
        categories: Array.isArray(local?.categories) ? local.categories : [],
    };
}

function rowToCategory(row) {
    const apiKey = (row.Category || row.category || '').trim();
    if (!apiKey) return null;
    const order = parseInt(row.Order || row.order || '', 10);
    return {
        apiKey,
        color:        (row.Color || row.color || '').trim() || '#cccccc',
        displayName:  (row.DisplayName_TR || row.displayName_TR || row.Cat_TR || row.cat_tr || row.DisplayName || apiKey).trim(),
        displayName_en: (row.DisplayName_EN || row.displayName_EN || row.DisplayName || apiKey).trim(),
        icon:         (row.Icon || row.icon || '🏷️').trim(),
        description:  (row.Description || row.description || '').trim(),
        order:        Number.isFinite(order) ? order : 999,
    };
}

function wire() {
    host.querySelector('#catAdd').addEventListener('click', () => {
        const nextOrder = (data.categories.reduce((m, c) => Math.max(m, c.order || 0), 0) || 0) + 1;
        data.categories.push({
            apiKey: '',
            color: '#cccccc',
            displayName: 'Yeni Kategori',
            displayName_en: 'New Category',
            icon: '🏷️',
            description: '',
            order: nextOrder,
            _local: true,
            _dirty: true,
        });
        editingIndex = data.categories.length - 1;
        renderAll();
        persistLocal();
    });
    host.querySelector('#catReload').addEventListener('click', async () => {
        const dirtyCount = data.categories.filter(c => c._dirty).length;
        if (dirtyCount > 0 && !confirm(`${dirtyCount} kaydedilmemiş değişiklik silinecek. Sheets'ten yeniden yüklensin mi?`)) {
            return;
        }
        await load();
        editingIndex = -1;
        renderAll();
        app.setStatus('Kategoriler yenilendi', 'saved');
    });
    host.querySelector('#catSync').addEventListener('click', () => syncToSheet());
}

function renderAll() {
    renderSourceTag();
    renderList();
    renderEditor();
    updateSyncBtn();
}

function renderSourceTag() {
    const $src = host.querySelector('#catSource');
    if (!$src) return;
    const cfg = app.getConfig()?.venue?.sheets;
    const tab = pickTab(cfg || {}, 'categories');
    const dirtyCount = data.categories.filter(c => c._dirty).length;

    if (data.source === 'sheets') {
        $src.innerHTML = `<span class="ed-cat-pill ed-cat-pill-ok">Sheets</span><span>${escapeHtml(tab)} · ${data.categories.length} kategori</span>${dirtyCount ? `<span class="ed-cat-pill ed-cat-pill-dirty">${dirtyCount} bekleyen</span>` : ''}`;
    } else if (data.source === 'error') {
        $src.innerHTML = `<span class="ed-cat-pill ed-cat-pill-dirty">Hata</span><span title="${escapeHtml(data.error)}">${escapeHtml(data.error)}</span>`;
    } else if (data.source === 'local') {
        $src.innerHTML = `<span class="ed-cat-pill ed-cat-pill-warn">Yerel</span><span>Sheets bağlı değil</span>`;
    } else {
        $src.innerHTML = `<span class="ed-cat-pill ed-cat-pill-warn">Boş</span><span>Sheets'i Ayarlar'dan bağlayın veya "+ Yeni" ile başlayın</span>`;
    }

    const $hint = host.querySelector('#catHint');
    if ($hint) {
        const parts = [];
        if (data.source === 'error') {
            parts.push('Sheets okuma başarısız. Ayarlar → "Sheets Sheet ID" ve "Kategoriler Sekmesi" alanlarını + sheet paylaşım iznini ("Anyone with the link" — Viewer yeterli) kontrol edin.');
        } else if (cfg?.writeEndpointUrl) {
            parts.push('Sıralamayı sürükleyerek değiştirebilirsiniz. "Sheet\'e Sync" değişiklikleri Apps Script üzerinden yazar.');
        } else {
            parts.push('Sheets yazma endpoint\'i ayarlanmadığı için değişiklikler sadece yerelde kalır. Ayarlar → "Sheets Yazma Endpoint" alanını doldurun.');
        }
        $hint.textContent = parts.join(' ');
    }
}

function updateSyncBtn() {
    const $btn = host.querySelector('#catSync');
    if (!$btn) return;
    const cfg = app.getConfig()?.venue?.sheets;
    const dirtyCount = data.categories.filter(c => c._dirty).length;
    const hasEndpoint = !!cfg?.writeEndpointUrl;
    const hasTab = !!pickTab(cfg, 'categories');
    const canSync = hasEndpoint && hasTab && data.source === 'sheets' && dirtyCount > 0;

    /* Always visible — disabled state communicates "why" via tooltip.
     * Hiding it confused users who couldn't find the action they read
     * about in the apps-script README. */
    $btn.hidden = false;
    $btn.disabled = !canSync;
    $btn.textContent = `Sheet'e Sync${dirtyCount ? ` (${dirtyCount})` : ''}`;
    if (!hasEndpoint)        $btn.title = 'Ayarlar → "Sheets Yazma Endpoint" alanını doldurun';
    else if (!hasTab)        $btn.title = 'Ayarlar → "Kategoriler Sekmesi" alanını doldurun';
    else if (data.source !== 'sheets') $btn.title = 'Önce Sheets bağlantısını kurun';
    else if (dirtyCount === 0) $btn.title = 'Senkronlanacak değişiklik yok';
    else                     $btn.title = `${dirtyCount} değişikliği Sheets\'e gönder`;
}

function renderList() {
    const $list = host.querySelector('#catList');
    if (!$list) return;
    $list.innerHTML = '';
    if (!data.categories.length) {
        $list.innerHTML = `<div class="ed-cat-empty-mini">Henüz kategori yok</div>`;
        return;
    }
    data.categories.forEach((c, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.draggable = true;
        row.dataset.index = String(i);
        row.className = 'ed-cat-row' + (i === editingIndex ? ' is-active' : '');
        row.innerHTML = `
          <span class="ed-cat-grip" aria-hidden="true">⋮⋮</span>
          <span class="ed-cat-swatch" style="background:${escapeHtml(c.color || '#ccc')}"></span>
          <span class="ed-cat-icon">${iconHTML(c.icon, { size: 16 })}</span>
          <span class="ed-cat-name">${escapeHtml(c.displayName || c.apiKey || '(boş)')}</span>
          <span class="ed-cat-key">${escapeHtml(c.apiKey || '—')}</span>
          ${c._dirty ? '<span class="ed-cat-dirty-dot" title="kaydedilmemiş"></span>' : ''}
        `;
        row.addEventListener('click', () => {
            editingIndex = i;
            renderList();
            renderEditor();
        });
        attachDrag(row, $list);
        $list.appendChild(row);
    });
    renderIcons();
}

/* HTML5 drag-and-drop reordering. We mark each row draggable, listen
 * for drop on the list container, and rewrite `order` based on the new
 * array index so the sheet sees a clean sort key. */
function attachDrag(row, container) {
    row.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.index);
        row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        container.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
    });
    row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.querySelectorAll('.is-drop-target').forEach(el => el.classList.remove('is-drop-target'));
        row.classList.add('is-drop-target');
    });
    row.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIdx   = parseInt(row.dataset.index, 10);
        if (Number.isNaN(fromIdx) || Number.isNaN(toIdx) || fromIdx === toIdx) return;
        const [moved] = data.categories.splice(fromIdx, 1);
        data.categories.splice(toIdx, 0, moved);
        // Re-stamp Order numbers and mark all moved entries dirty.
        data.categories.forEach((c, i) => {
            const newOrder = (i + 1) * 10;
            if (c.order !== newOrder) {
                c.order = newOrder;
                c._dirty = true;
            }
        });
        if (editingIndex === fromIdx) editingIndex = toIdx;
        else if (fromIdx < editingIndex && toIdx >= editingIndex) editingIndex--;
        else if (fromIdx > editingIndex && toIdx <= editingIndex) editingIndex++;
        renderAll();
        persistLocal();
    });
}

function renderEditor() {
    const $editor = host.querySelector('#catEditor');
    if (!$editor) return;
    if (editingIndex < 0 || editingIndex >= data.categories.length) {
        $editor.innerHTML = `<div class="ed-cat-empty">Bir kategori seçin veya "+ Yeni" oluşturun.</div>`;
        return;
    }
    $editor.innerHTML = FORM_HTML;
    const cat = data.categories[editingIndex];
    const form = $editor.querySelector('form');
    form.elements.apiKey.value         = cat.apiKey || '';
    form.elements.color.value          = cat.color || '#cccccc';
    form.elements.colorHex.value       = cat.color || '#cccccc';
    form.elements.icon.value           = cat.icon || '';
    form.elements.displayName.value    = cat.displayName || '';
    form.elements.displayName_en.value = cat.displayName_en || '';
    form.elements.order.value          = cat.order ?? '';
    form.elements.description.value    = cat.description || '';

    const $iconP = $editor.querySelector('#catIconPreview');
    $iconP.innerHTML = iconHTML(cat.icon, { size: 22 });
    renderIcons();

    form.elements.color.addEventListener('input', () => {
        form.elements.colorHex.value = form.elements.color.value;
    });
    form.elements.colorHex.addEventListener('input', () => {
        const v = form.elements.colorHex.value.trim();
        if (/^#[0-9a-f]{3,8}$/i.test(v)) form.elements.color.value = v;
    });
    form.elements.icon.addEventListener('input', () => {
        $iconP.innerHTML = iconHTML(form.elements.icon.value, { size: 22 });
        renderIcons();
    });

    /* ── Görsel yükleme: PNG/SVG/JPG → data URL → input.icon ──────
     * Apps Script üzerinden sheet'e yazılırken sadece string olarak
     * gidiyor; data URL'ler büyüyebileceği için en fazla 256 KB'a kadar
     * kabul ediyoruz. Daha büyük dosyalar için kullanıcıya URL gir
     * önerisi gösterilir. */
    const $upload = $editor.querySelector('#catIconUpload');
    const $file   = $editor.querySelector('#catIconFile');
    $upload?.addEventListener('click', () => $file?.click());
    $file?.addEventListener('change', () => {
        const file = $file.files?.[0];
        if (!file) return;
        if (file.size > 256 * 1024) {
            if (!confirm(`Dosya boyutu ${Math.round(file.size/1024)} KB. 256 KB'tan büyük dosyalar Sheet'e gömüldüğünde performans sorunu çıkarabilir — yine de yüklensin mi?`)) {
                $file.value = '';
                return;
            }
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || '');
            form.elements.icon.value = dataUrl;
            $iconP.innerHTML = iconHTML(dataUrl, { size: 22 });
            renderIcons();
        };
        reader.onerror = () => app.setStatus('İkon dosyası okunamadı', 'dirty');
        reader.readAsDataURL(file);
        $file.value = '';
    });

    $editor.querySelector('#catSave').addEventListener('click', () => {
        const v = {
            apiKey:         form.elements.apiKey.value.trim(),
            color:          (form.elements.colorHex.value || form.elements.color.value).trim() || '#cccccc',
            icon:           form.elements.icon.value.trim() || 'tag',
            displayName:    form.elements.displayName.value.trim(),
            displayName_en: form.elements.displayName_en.value.trim(),
            description:    form.elements.description.value.trim(),
            order:          parseInt(form.elements.order.value, 10) || 999,
        };
        if (!v.apiKey) { app.setStatus('apiKey gerekli', 'dirty'); return; }

        const prev = data.categories[editingIndex];
        const dirty = !!(prev._dirty || hasChanged(prev, v));
        data.categories[editingIndex] = { ...prev, ...v, _dirty: dirty };
        persistLocal();
        renderAll();
        app.setStatus('Kategori kaydedildi', 'saved');
    });

    $editor.querySelector('#catDelete').addEventListener('click', () => {
        if (!confirm('Bu kategori silinecek. Emin misin?')) return;
        const removed = data.categories.splice(editingIndex, 1)[0];
        if (data.source === 'sheets') {
            // Track deletion so syncToSheet can issue a delete row call.
            data._deletedKeys = data._deletedKeys || [];
            data._deletedKeys.push(removed.apiKey);
        }
        editingIndex = -1;
        persistLocal();
        renderAll();
    });
}

function hasChanged(prev, next) {
    return ['apiKey', 'color', 'icon', 'displayName', 'displayName_en', 'description', 'order']
        .some(k => (prev[k] || '') !== (next[k] || ''));
}

async function persistLocal() {
    /* We mirror everything to IDB regardless of source — this powers the
     * preview iframe (`window.__previewAssets.categories`) so the user
     * sees their changes live even before pushing to the sheet. */
    await storage.setCategories({ categories: data.categories });
    app.onStorageChange?.();
    app.reload(['categoryMapping']);
    updateSyncBtn();
}

async function syncToSheet() {
    const cfg = app.getConfig()?.venue?.sheets;
    if (!cfg?.writeEndpointUrl) {
        app.setStatus('Endpoint yok — Ayarlar > Sheets Yazma Endpoint', 'dirty');
        return;
    }
    const tab = pickTab(cfg, 'categories');
    if (!tab) { app.setStatus('Kategoriler sekmesi tanımlı değil', 'dirty'); return; }

    const dirtyRows = data.categories.filter(c => c._dirty).map(c => ({
        Category:        c.apiKey,
        Color:           c.color,
        DisplayName_TR:  c.displayName,
        DisplayName_EN:  c.displayName_en,
        Icon:            c.icon,
        Order:           c.order,
        Description:     c.description || '',
    }));
    if (!dirtyRows.length && !(data._deletedKeys?.length)) {
        app.setStatus('Senkronlanacak değişiklik yok', 'saved');
        return;
    }

    app.setStatus('Senkronlanıyor…', 'dirty');
    try {
        const res = await sheetWriter.upsertRows({
            sheetId:     cfg.sheetId,
            tab,
            keyColumn:   'Category',
            rows:        dirtyRows,
            deleteKeys:  data._deletedKeys || [],
            endpointUrl: cfg.writeEndpointUrl,
        });
        if (!res.ok) throw new Error(res.error || 'sync failed');
        // Mark everything clean.
        data.categories.forEach(c => { c._dirty = false; });
        delete data._deletedKeys;
        await persistLocal();
        renderAll();
        app.setStatus(`${dirtyRows.length} kategori senkronlandı`, 'saved');
    } catch (e) {
        console.error(e);
        app.setStatus(`Sync hatası: ${e.message}`, 'dirty');
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
