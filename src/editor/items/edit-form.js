import { iconHTML, renderIcons } from '../../core/icon.js';
import { parseStructuredHours, hoursRows, isOpenNow } from '../../features/data/location-fields.js';

/**
 * Birim düzenleme formu.
 *
 * Kategori şipleri drag-reorder edilebilir; ilk şip "primary" — birim
 * rengini bu kategoriden alır. Şipler sürüklenince anchored "primary"
 * pozisyonu güncellenir.
 *
 * Form alanları:
 *   ID (read-only)
 *   Title, Subtitle, Floor (select),
 *   Phone, Description, Web, Logo, LogoName
 *   Categories — drag-reorder edilebilir liste + + ekle (kategori dropdown)
 *
 * Form `onChange(patch, primaryCategory)` callback'ini her atomik
 * değişiklikte çağırır; outer module patch'leri kv:itemEdits içinde
 * birikir.
 */

/* Form field → sheet column mapping.
 *
 * `key` is the column header in the venue's sheet — Apps Script upserts
 * by matching these against the sheet's header row. Mismatched names
 * are silently dropped on the server. The two most common phone column
 * names in our venues are "Telephone" (Zorlu / Kanyon) and "Phone"
 * (legacy). We standardise on "Telephone" for writing, but the form's
 * INITIAL value reads from either — see `pickInitial` below. */
const FIELDS = [
    { key: 'Title',       label: 'Başlık',     required: true },
    { key: 'Subtitle',    label: 'Alt başlık' },
    { key: 'Telephone',   label: 'Telefon', altKeys: ['Phone'] },
    { key: 'Description', label: 'Açıklama', textarea: true },
    { key: 'Hours',       label: 'Çalışma Saatleri', textarea: true,
      placeholder: 'Pzt-Cum 10:00-22:00; Cmt 10:00-20:00; Paz Kapalı',
      hint: 'Gün(ler) + saat; ";" veya satırla ayır. "Kapalı" / "24 Saat" yazılabilir.' },
    { key: 'Web',         label: 'Web' },
    { key: 'Logo',        label: 'Logo URL' },
    { key: 'LogoName',    label: 'Logo dosyası' },
    { key: 'Images',      label: 'Görseller (galeri)', textarea: true,
      placeholder: 'https://...jpg\nhttps://...jpg', hint: 'Her satıra bir URL (veya | ile ayır).' },
    { key: 'Related',     label: 'İlişkili Birimler',
      placeholder: 'ID003, ID005', hint: 'Önerilecek birim ID’leri (virgülle).' },
];

function pickInitial(row, field) {
    if (row[field.key] !== undefined && row[field.key] !== '') return row[field.key];
    for (const alt of (field.altKeys || [])) {
        if (row[alt] !== undefined && row[alt] !== '') return row[alt];
    }
    return '';
}

export function initItemForm(host, opts) {
    const {
        row, cats, primaryCategory, floorMap, floors,
        dirty, onChange, onRevert,
    } = opts;

    let currentCats = parseCats(row.Category, primaryCategory);
    let currentRow  = { ...row };

    host.innerHTML = '';
    host.appendChild(buildHeader(currentRow, dirty, onRevert));
    host.appendChild(buildScalarFields());
    host.appendChild(buildFloorField());
    host.appendChild(buildCategorySection());

    /* ──────────────── helpers ──────────────── */

    function buildHeader(r, dirty, onRevert) {
        const div = document.createElement('div');
        div.className = 'ed-items-form-header';
        div.innerHTML = `
          <div class="ed-items-form-id">
            <span class="ed-items-pill ${dirty ? 'warn' : 'ok'}">${dirty ? 'Yerel düzenleme' : 'Sheet ile eş'}</span>
            <code>${escapeHtml(r.ID)}</code>
          </div>
          ${dirty ? '<button type="button" class="ed-mb-btn ed-mb-btn-ghost" id="ifRevert">Geri al</button>' : ''}
        `;
        if (dirty) {
            div.querySelector('#ifRevert')?.addEventListener('click', () => onRevert?.());
        }
        return div;
    }

    function buildScalarFields() {
        const wrap = document.createElement('div');
        wrap.className = 'ed-items-form-fields';
        for (const f of FIELDS) {
            const lbl = document.createElement('label');
            lbl.className = 'ed-items-form-field';
            lbl.innerHTML = `<span class="ed-items-form-label">${escapeHtml(f.label)}${f.required ? ' *' : ''}</span>`;
            const input = f.textarea
                ? Object.assign(document.createElement('textarea'), { rows: 3 })
                : Object.assign(document.createElement('input'), { type: 'text' });
            if (f.placeholder) input.placeholder = f.placeholder;
            const initial = pickInitial(currentRow, f);
            input.value = initial || '';
            // Seed currentRow with the resolved value so patch diffing is
            // accurate even when the source column was the alt key.
            currentRow[f.key] = initial || '';
            input.dataset.key = f.key;

            // Live structured preview for the Hours field.
            const isHours = f.key === 'Hours';
            const preview = isHours ? document.createElement('div') : null;
            if (preview) { preview.className = 'ed-items-hours-preview'; }
            const renderHoursPreview = () => {
                if (!preview) return;
                const parsed = parseStructuredHours(input.value);
                if (!parsed) { preview.innerHTML = input.value.trim() ? '<span class="ed-items-hours-bad">Biçim tanınmadı</span>' : ''; return; }
                const open = isOpenNow(parsed);
                const state = open == null ? '' : open
                    ? '<span class="ed-items-hours-open">Şu an açık</span>'
                    : '<span class="ed-items-hours-closed">Şu an kapalı</span>';
                preview.innerHTML = state + hoursRows(parsed)
                    .map(r => `<div class="ed-items-hours-row"><b>${escapeHtml(r.short)}</b> ${escapeHtml(r.text)}</div>`).join('');
            };

            input.addEventListener('input', () => {
                const v = input.value;
                if ((currentRow[f.key] || '') === v) return;
                currentRow[f.key] = v;
                if (isHours) renderHoursPreview();
                emitChange();
            });
            lbl.appendChild(input);
            if (f.hint) {
                const hint = document.createElement('span');
                hint.className = 'ed-items-form-hint';
                hint.textContent = f.hint;
                lbl.appendChild(hint);
            }
            if (preview) { renderHoursPreview(); lbl.appendChild(preview); }
            wrap.appendChild(lbl);
        }
        return wrap;
    }

    function buildFloorField() {
        const lbl = document.createElement('label');
        lbl.className = 'ed-items-form-field';
        lbl.innerHTML = `<span class="ed-items-form-label">Kat</span>`;
        const sel = document.createElement('select');
        for (const fk of floors) {
            const opt = document.createElement('option');
            opt.value = fk;
            opt.textContent = `${floorMap[fk] || fk} (${fk})`;
            if (String(currentRow.Floor) === String(fk)) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
            currentRow.Floor = sel.value;
            emitChange();
        });
        lbl.appendChild(sel);
        return lbl;
    }

    function buildCategorySection() {
        const wrap = document.createElement('div');
        wrap.className = 'ed-items-form-cats';
        const noCats = !cats || cats.length === 0;
        wrap.innerHTML = `
          <div class="ed-items-form-label">
            Kategoriler
            <span class="ed-items-form-hint">İlk şip rengi belirler. Sürükleyerek sırayı değiştirin.</span>
          </div>
          <div class="ed-items-chips" id="ifChips"></div>
          <div class="ed-items-add-cat">
            <select id="ifAddSel" ${noCats ? 'disabled' : ''}>
              <option value="">${noCats ? 'Kategori yok — önce "Kategoriler" sekmesinden yükleyin' : '+ Kategori ekle…'}</option>
            </select>
          </div>
        `;
        const $chips = wrap.querySelector('#ifChips');
        const $add   = wrap.querySelector('#ifAddSel');

        renderChips($chips);
        renderAddOptions($add);

        $add.addEventListener('change', () => {
            const v = $add.value;
            if (!v) return;
            if (!currentCats.includes(v)) currentCats.push(v);
            $add.value = '';
            renderChips($chips);
            renderAddOptions($add);
            emitChange();
        });
        return wrap;
    }

    function renderChips($chips) {
        $chips.innerHTML = '';
        if (!currentCats.length) {
            $chips.innerHTML = `<div class="ed-items-chips-empty">Kategori yok</div>`;
            return;
        }
        currentCats.forEach((key, idx) => {
            const cat = cats.find(c => c.apiKey === key);
            const chip = document.createElement('div');
            chip.className = 'ed-items-chip' + (idx === 0 ? ' is-primary' : '');
            chip.draggable = true;
            chip.dataset.idx = String(idx);
            chip.innerHTML = `
              <span class="ed-items-chip-grip" aria-hidden="true">⋮⋮</span>
              <span class="ed-items-chip-color" style="background:${escapeHtml(cat?.color || '#ccc')}"></span>
              <span class="ed-items-chip-icon">${iconHTML(cat?.icon, { size: 14 })}</span>
              <span class="ed-items-chip-name">${escapeHtml(cat?.displayName || key)}</span>
              ${idx === 0 ? '<span class="ed-items-chip-badge">renk</span>' : ''}
              <button type="button" class="ed-items-chip-remove" title="Kaldır" aria-label="Kaldır">×</button>
            `;
            chip.querySelector('.ed-items-chip-remove').addEventListener('click', (ev) => {
                ev.stopPropagation();
                currentCats.splice(idx, 1);
                renderChips($chips);
                renderAddOptions($add());
                emitChange();
            });
            attachChipDrag(chip, $chips);
            $chips.appendChild(chip);
        });
        renderIcons();
    }

    function $add() { return host.querySelector('#ifAddSel'); }

    function renderAddOptions($sel) {
        if (!$sel) return;
        const used = new Set(currentCats);
        $sel.innerHTML = '<option value="">+ Kategori ekle…</option>';
        for (const c of cats) {
            if (used.has(c.apiKey)) continue;
            const opt = document.createElement('option');
            opt.value = c.apiKey;
            opt.textContent = c.displayName || c.apiKey;
            $sel.appendChild(opt);
        }
    }

    function attachChipDrag(chip, container) {
        chip.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', chip.dataset.idx);
            chip.classList.add('is-dragging');
        });
        chip.addEventListener('dragend', () => {
            chip.classList.remove('is-dragging');
            container.querySelectorAll('.is-drop-target').forEach(c => c.classList.remove('is-drop-target'));
        });
        chip.addEventListener('dragover', (e) => {
            e.preventDefault();
            container.querySelectorAll('.is-drop-target').forEach(c => c.classList.remove('is-drop-target'));
            chip.classList.add('is-drop-target');
        });
        chip.addEventListener('drop', (e) => {
            e.preventDefault();
            const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
            const to   = parseInt(chip.dataset.idx, 10);
            if (Number.isNaN(from) || Number.isNaN(to) || from === to) return;
            const [moved] = currentCats.splice(from, 1);
            currentCats.splice(to, 0, moved);
            renderChips(container);
            emitChange();
        });
    }

    /* Build a sheet-shaped patch — every changed key + the joined
     * category string. Diff against the resolved-initial value (using
     * altKeys so e.g. "Phone" in the original row counts as the baseline
     * for "Telephone"). */
    function emitChange() {
        const patch = {};
        const orig = opts.row;
        for (const f of FIELDS) {
            const origVal = pickInitial(orig, f) || '';
            if ((currentRow[f.key] || '') !== origVal) {
                patch[f.key] = currentRow[f.key] || '';
            }
        }
        if (String(currentRow.Floor) !== String(orig.Floor)) patch.Floor = String(currentRow.Floor);
        const newCatStr = currentCats.join(',');
        if (newCatStr !== (orig.Category || '')) patch.Category = newCatStr;

        const primary = currentCats[0] || '';
        onChange?.(patch, primary);
    }

    /* Pull the row's existing categories, but pin `primaryCategory`
     * to the front when supplied. Sheet's first entry is primary too,
     * so this only matters when the user has overridden it locally. */
    function parseCats(rawCsv, primaryHint) {
        const list = (rawCsv || '').split(',').map(s => s.trim()).filter(Boolean);
        if (primaryHint && list.includes(primaryHint) && list[0] !== primaryHint) {
            return [primaryHint, ...list.filter(c => c !== primaryHint)];
        }
        return list;
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
