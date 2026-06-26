/**
 * Form renderer — builds the editor UI from the schema and wires up input events.
 *
 * onChange(path, value, field)   — user tweaked a control
 * onFocus(path, field)           — user entered a control
 * onBlur(path, field)            — user left a control
 * onJumpToScene(sceneId)         — user clicked the scene badge
 */

import { schema, getGroupScope, groupScopeInterfaces, INTERFACE_LABELS } from './schema.js';
import { getSceneById } from './scenes.js';
import { getByPath } from './path-utils.js';

const GROUP_OPEN_KEY = 'kiosk:editorOpenGroups';

function loadOpenGroups() {
    try {
        const raw = localStorage.getItem(GROUP_OPEN_KEY);
        if (!raw) return new Set(['general', 'branding', 'palette']);
        return new Set(JSON.parse(raw));
    } catch { return new Set(['general']); }
}

function saveOpenGroups(set) {
    try { localStorage.setItem(GROUP_OPEN_KEY, JSON.stringify([...set])); } catch {}
}

const CHEVRON_SVG = '<svg class="ed-chevron" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

const GROUP_ICONS = {
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
    tag: 'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
    paint: 'M19 11h-1v-1a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v1H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z',
    glass: 'M12 2v6 M5 8h14l-1.5 10a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2L5 8z',
    nav: 'M3 12h18 M3 6h18 M3 18h18',
    home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
    panel: 'M3 3h18v18H3z M15 3v18',
    map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16',
    layers: 'M12 2 2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    label: 'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z',
    route: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 13V8a4 4 0 0 1 4-4h4',
    phone: 'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M11 18h2',
    grid: 'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z',
    toggle: 'M8 8h8a4 4 0 1 1 0 8H8a4 4 0 1 1 0-8z M8 12a0 0 0 0 0 0 0',
    data: 'M4 7c0-2 3.58-3 8-3s8 1 8 3v10c0 2-3.58 3-8 3s-8-1-8-3z M4 7c0 2 3.58 3 8 3s8-1 8-3 M4 12c0 2 3.58 3 8 3s8-1 8-3',
};

function groupIcon(name) {
    const d = GROUP_ICONS[name];
    if (!d) return '';
    return `<svg class="ed-group-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
        d.split(' M').map((seg, i) => `<path d="${i === 0 ? seg : 'M' + seg}"/>`).join('')
    }</svg>`;
}

/* A small badge that tells the user whether a settings group is applied
 * globally (every interface) or only to specific interfaces. */
function groupScopeBadge(groupId) {
    const span = document.createElement('span');
    if (getGroupScope(groupId) === 'global') {
        span.className = 'ed-scope-badge ed-scope-global';
        span.textContent = 'Tüm arayüzler';
        span.title = 'Bu ayarlar tüm arayüzlere (web, kiosk, kiosk dikey, mobil) ortak uygulanır.';
    } else {
        const ifaces = groupScopeInterfaces(groupId);
        span.className = 'ed-scope-badge ed-scope-specific';
        span.textContent = ifaces.map(i => INTERFACE_LABELS[i] || i).join(' · ');
        span.title = 'Bu ayarlar yalnızca şu arayüz(ler) için geçerlidir: ' + span.textContent;
    }
    return span;
}

/* ============================================================
 * Public API
 * ============================================================ */

export function renderForm(root, hooks) {
    root.innerHTML = '';
    const openGroups = loadOpenGroups();

    for (const group of schema) {
        const groupEl = document.createElement('section');
        groupEl.className = 'ed-group';
        groupEl.dataset.groupId = group.id;
        if (openGroups.has(group.id)) groupEl.classList.add('is-open');

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'ed-group-head';
        const count = group.fields?.length ?? 0;
        head.innerHTML = `
            ${CHEVRON_SVG}
            ${groupIcon(group.icon)}
            <span class="ed-group-label">${group.label}</span>
            <span class="ed-group-count">${count}</span>
        `;
        head.querySelector('.ed-group-label')?.after(groupScopeBadge(group.id));
        head.addEventListener('click', () => {
            groupEl.classList.toggle('is-open');
            if (groupEl.classList.contains('is-open')) openGroups.add(group.id);
            else openGroups.delete(group.id);
            saveOpenGroups(openGroups);
        });
        groupEl.appendChild(head);

        const body = document.createElement('div');
        body.className = 'ed-group-body';

        if (group.description) {
            const desc = document.createElement('div');
            desc.className = 'ed-group-desc';
            desc.textContent = group.description;
            body.appendChild(desc);
        }

        for (const field of (group.fields || [])) {
            body.appendChild(buildField(field, hooks));
        }
        groupEl.appendChild(body);
        root.appendChild(groupEl);
    }
}

export function refreshAllFields(root, config) {
    const fields = root.querySelectorAll('.ed-field[data-path]');
    for (const el of fields) {
        const path = el.dataset.path;
        // Multi-input controls (e.g. category multiselect) manage their own state.
        if (el.querySelector('[data-no-refresh]')) continue;
        const input = el.querySelector('input, select, textarea');
        if (!input) continue;
        const value = getByPath(config, path);
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else input.value = value ?? '';
    }
}

export function applySearchFilter(rootEl, query) {
    const q = query.trim().toLowerCase();
    const groups = rootEl.querySelectorAll('.ed-group');

    if (!q) {
        groups.forEach(g => {
            g.style.display = '';
            g.querySelectorAll('.ed-field').forEach(f => f.style.display = '');
        });
        rootEl.querySelector('.ed-empty')?.remove();
        return;
    }

    let matched = 0;
    groups.forEach(g => {
        let groupMatched = 0;
        g.querySelectorAll('.ed-field').forEach(f => {
            const hay = (f.dataset.search || '');
            const ok = hay.includes(q);
            f.style.display = ok ? '' : 'none';
            if (ok) { groupMatched++; matched++; }
        });
        g.style.display = groupMatched > 0 ? '' : 'none';
        if (groupMatched > 0) g.classList.add('is-open');
    });

    rootEl.querySelector('.ed-empty')?.remove();
    if (matched === 0) {
        const empty = document.createElement('div');
        empty.className = 'ed-empty';
        empty.textContent = 'Sonuç bulunamadı';
        rootEl.appendChild(empty);
    }
}

/* ============================================================
 * Field builders
 * ============================================================ */

function buildField(field, hooks) {
    const wrap = document.createElement('div');
    wrap.className = 'ed-field';
    wrap.dataset.path = field.path;
    wrap.dataset.search = [
        field.label || '',
        field.path,
        field.description || '',
        field.hint || '',
    ].join(' ').toLowerCase();

    // Head: label + badges
    const head = document.createElement('div');
    head.className = 'ed-field-head';

    const label = document.createElement('span');
    label.className = 'ed-field-label';
    label.title = field.path;
    label.textContent = field.label || field.path;
    head.appendChild(label);

    const badges = document.createElement('span');
    badges.className = 'ed-field-badges';

    if (field.primaryScene) {
        const scene = getSceneById(field.primaryScene);
        if (scene) {
            const badge = document.createElement('button');
            badge.type = 'button';
            badge.className = 'ed-scene-badge';
            badge.title = `Önizlemeyi "${scene.label}" sahnesine götür`;
            badge.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg><span>${scene.label}</span>`;
            badge.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                hooks.onJumpToScene?.(field.primaryScene);
            });
            badges.appendChild(badge);
        }
    }

    if (field.requiresReload) {
        const b = document.createElement('span');
        b.className = 'ed-reload-badge';
        b.title = 'Bu değişiklik önizlemeyi yeniden yükleyecek';
        b.textContent = 'reload';
        badges.appendChild(b);
    }

    head.appendChild(badges);
    wrap.appendChild(head);

    if (field.description) {
        const d = document.createElement('div');
        d.className = 'ed-field-desc';
        d.textContent = field.description;
        wrap.appendChild(d);
    }

    const control = buildControl(field, hooks);
    wrap.appendChild(control);

    // NOTE: Auto-jumping the preview to the field's primary scene on focus is
    // handled centrally by the onFocus hook (main.js handleFieldFocus), which
    // guards against re-driving when the preview is ALREADY on that scene.
    // A second, unguarded jump here made the whole scene script (e.g.
    // search → list → auto-select → route) replay on every focus/click.

    if (field.hint) {
        const h = document.createElement('div');
        h.className = 'ed-field-hint';
        h.textContent = field.hint;
        wrap.appendChild(h);
    }

    // Focus/blur propagation — listen on the wrapper so any inner input
    // counts.
    wrap.addEventListener('focusin', () => hooks.onFocus?.(field.path, field));
    wrap.addEventListener('focusout', (e) => {
        // Only emit blur when focus leaves the wrapper entirely, not when
        // it moves between inner inputs.
        if (!wrap.contains(e.relatedTarget)) hooks.onBlur?.(field.path, field);
    });

    // Also emit focus on mousedown so clicking on a color swatch counts.
    wrap.addEventListener('mousedown', () => hooks.onFocus?.(field.path, field));

    return wrap;
}

function buildControl(field, hooks) {
    const value = getByPath(hooks.config, field.path);
    const onChange = (path, v) => hooks.onChange?.(path, v, field);

    switch (field.type) {
        case 'color':       return buildColor(field, value, onChange);
        case 'text':        return buildText(field, value, onChange);
        case 'number':      return buildNumber(field, value, onChange);
        case 'slider':      return buildSlider(field, value, onChange);
        case 'toggle':      return buildToggle(field, value, onChange);
        case 'select':      return buildSelect(field, value, onChange);
        case 'gradient3':   return buildGradient3(field, value, onChange);
        case 'cssLength':   return buildCssLength(field, value, onChange);
        case 'numberArray': return buildNumberArray(field, value, onChange);
        case 'categorySelect': return buildCategorySelect(field, value, onChange, hooks);
        default: {
            const d = document.createElement('div');
            d.textContent = `Unsupported type: ${field.type}`;
            d.style.color = 'var(--ed-danger)';
            return d;
        }
    }
}

/* ------------------------------------------------------------
 * Individual controls
 * ------------------------------------------------------------ */

function buildText(field, value, onChange) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ed-input';
    input.value = value ?? '';
    input.placeholder = field.placeholder || '';
    input.addEventListener('input', () => onChange(field.path, input.value));
    return input;
}

function buildNumber(field, value, onChange) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'ed-input';
    if (field.min !== undefined) input.min = field.min;
    if (field.max !== undefined) input.max = field.max;
    if (field.step !== undefined) input.step = field.step;
    input.value = value ?? '';
    input.addEventListener('input', () => {
        const v = input.value === '' ? null : Number(input.value);
        onChange(field.path, Number.isFinite(v) ? v : null);
    });
    return input;
}

function buildSlider(field, value, onChange) {
    const row = document.createElement('div');
    row.className = 'ed-slider-row';

    const range = document.createElement('input');
    range.type = 'range';
    if (field.min !== undefined) range.min = field.min;
    if (field.max !== undefined) range.max = field.max;
    range.step = field.step ?? 1;
    range.value = value ?? field.min ?? 0;

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'ed-input';
    if (field.min !== undefined) num.min = field.min;
    if (field.max !== undefined) num.max = field.max;
    num.step = field.step ?? 1;
    num.value = range.value;

    const emit = (src) => {
        const v = Number(src.value);
        if (!Number.isFinite(v)) return;
        range.value = v;
        num.value = v;
        onChange(field.path, v);
    };
    range.addEventListener('input', () => emit(range));
    num.addEventListener('input', () => emit(num));

    row.append(range, num);
    if (field.unit) {
        const suffix = document.createElement('span');
        suffix.className = 'ed-slider-unit';
        suffix.textContent = field.unit;
        row.appendChild(suffix);
        row.classList.add('has-unit');
    }
    return row;
}

function buildToggle(field, value, onChange) {
    const label = document.createElement('label');
    label.className = 'ed-toggle';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);

    const track = document.createElement('span');
    track.className = 'ed-toggle-track';
    const thumb = document.createElement('span');
    thumb.className = 'ed-toggle-thumb';
    track.appendChild(thumb);

    const text = document.createElement('span');
    text.className = 'ed-toggle-text';
    text.textContent = input.checked ? 'Açık' : 'Kapalı';

    input.addEventListener('change', () => {
        text.textContent = input.checked ? 'Açık' : 'Kapalı';
        onChange(field.path, input.checked);
    });

    label.append(input, track, text);
    return label;
}

/* ---------------- Category multiselect ----------------
 * Checkbox list fed by the live (Sheets-backed) category palette via
 * hooks.getCategories(). Value semantics: null/[] = all visible; otherwise
 * an array of selected apiKeys. When every box is ticked we store null so
 * new sheet categories appear automatically. */
function buildCategorySelect(field, value, onChange, hooks) {
    const box = document.createElement('div');
    box.className = 'ed-catselect';
    box.dataset.noRefresh = '1';
    box.textContent = 'Kategoriler yükleniyor…';

    Promise.resolve(hooks.getCategories?.()).then((cats) => {
        cats = Array.isArray(cats) ? cats : [];
        box.textContent = '';
        if (!cats.length) {
            box.textContent = 'Kategori bulunamadı — Sheets bağlantısını veya Kategoriler sekmesini kontrol edin.';
            return;
        }

        const chosen = Array.isArray(value) && value.length ? new Set(value.map(String)) : null;
        const emit = () => {
            const keys = [...box.querySelectorAll('input:checked')].map(i => i.value);
            onChange(field.path, keys.length === cats.length || keys.length === 0 ? null : keys);
        };

        for (const c of cats) {
            const label = document.createElement('label');
            label.className = 'ed-catselect-item';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.value = String(c.apiKey);
            input.checked = chosen ? chosen.has(String(c.apiKey)) : true;
            input.addEventListener('change', emit);

            const swatch = document.createElement('span');
            swatch.className = 'ed-catselect-swatch';
            swatch.style.background = c.color || '#ccc';

            const text = document.createElement('span');
            text.className = 'ed-catselect-name';
            text.textContent = c.displayName || c.apiKey;

            label.append(input, swatch, text);
            box.appendChild(label);
        }

        const hint = document.createElement('div');
        hint.className = 'ed-catselect-hint';
        hint.textContent = 'Hepsi işaretliyse tüm kategoriler (yenileri dahil) gösterilir.';
        box.appendChild(hint);
    }).catch(() => {
        box.textContent = 'Kategoriler yüklenemedi.';
    });

    return box;
}

function buildSelect(field, value, onChange) {
    const sel = document.createElement('select');
    sel.className = 'ed-input';
    for (const opt of (field.options || [])) {
        const o = document.createElement('option');
        if (typeof opt === 'string') { o.value = opt; o.textContent = opt; }
        else { o.value = opt.value; o.textContent = opt.label; }
        if (String(o.value) === String(value ?? '')) o.selected = true;
        sel.appendChild(o);
    }
    sel.addEventListener('change', () => onChange(field.path, sel.value));
    return sel;
}

/* ---------------- Color ---------------- */

function parseColor(str) {
    if (!str || typeof str !== 'string') return { hex: '#000000', alpha: 1 };
    const s = str.trim();
    if (s.startsWith('#')) {
        let h = s.slice(1);
        if (h.length === 3) h = h.split('').map(c => c + c).join('');
        if (h.length === 6) return { hex: '#' + h.toLowerCase(), alpha: 1 };
    }
    const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/i);
    if (m) {
        const r = +m[1], g = +m[2], b = +m[3];
        const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
        const hex = '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
        return { hex, alpha: Math.max(0, Math.min(1, a)) };
    }
    return { hex: '#000000', alpha: 1 };
}

function formatColor(hex, alpha) {
    if (alpha >= 0.999) return hex;
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(3))})`;
}

function buildColor(field, value, onChange) {
    const row = document.createElement('div');
    row.className = 'ed-color-row';

    const initial = parseColor(value);

    const swatch = document.createElement('div');
    swatch.className = 'ed-color-swatch';
    const fill = document.createElement('div');
    fill.className = 'ed-color-swatch-fill';
    fill.style.background = value || initial.hex;
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = initial.hex;
    swatch.append(fill, picker);

    const text = document.createElement('input');
    text.type = 'text';
    text.className = 'ed-input';
    text.value = value || '';
    text.placeholder = '#rrggbb veya rgba(...)';

    const apply = (v) => {
        fill.style.background = v || 'transparent';
        onChange(field.path, v);
    };

    picker.addEventListener('input', () => {
        const { alpha } = parseColor(text.value);
        const v = alpha < 0.999 ? formatColor(picker.value, alpha) : picker.value;
        text.value = v;
        apply(v);
    });
    text.addEventListener('input', () => {
        const parsed = parseColor(text.value);
        picker.value = parsed.hex;
        apply(text.value);
    });

    row.append(swatch, text);
    return row;
}

/* ---------------- Gradient 3 stops ---------------- */

function buildGradient3(field, value, onChange) {
    const stops = Array.isArray(value) && value.length === 3
        ? value.slice()
        : ['#214eaf', '#3863be', '#3b82f6'];

    const wrap = document.createElement('div');
    wrap.className = 'ed-gradient';

    const preview = document.createElement('div');
    preview.className = 'ed-gradient-preview';
    const drawPreview = () => {
        preview.style.background = `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)`;
    };
    drawPreview();

    const stopRow = document.createElement('div');
    stopRow.className = 'ed-gradient-stops';

    stops.forEach((stop, i) => {
        const cell = buildColor(
            { path: field.path + `[${i}]`, label: `Stop ${i+1}` },
            stop,
            (_p, v) => {
                stops[i] = v;
                drawPreview();
                onChange(field.path, stops.slice());
            }
        );
        stopRow.appendChild(cell);
    });

    wrap.append(preview, stopRow);
    return wrap;
}

/* ---------------- CSS length ---------------- */

function buildCssLength(field, value, onChange) {
    const unit = field.unit || 'px';

    let initial = field.min ?? 0;
    if (typeof value === 'string') {
        const m = value.match(/^([\d.]+)/);
        if (m) initial = parseFloat(m[1]);
    } else if (typeof value === 'number') {
        initial = value;
    }

    const row = document.createElement('div');
    row.className = 'ed-slider-row has-unit';

    const range = document.createElement('input');
    range.type = 'range';
    if (field.min !== undefined) range.min = field.min;
    if (field.max !== undefined) range.max = field.max;
    range.step = field.step ?? 1;
    range.value = initial;

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'ed-input';
    if (field.min !== undefined) num.min = field.min;
    if (field.max !== undefined) num.max = field.max;
    num.step = field.step ?? 1;
    num.value = initial;

    const suffix = document.createElement('span');
    suffix.className = 'ed-slider-unit';
    suffix.textContent = unit;

    const emit = (v) => {
        range.value = v; num.value = v;
        onChange(field.path, `${v}${unit}`);
    };
    range.addEventListener('input', () => emit(Number(range.value)));
    num.addEventListener('input', () => emit(Number(num.value)));

    row.append(range, num, suffix);
    return row;
}

/* ---------------- Number array ---------------- */

function buildNumberArray(field, value, onChange) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ed-input ed-number-array';
    input.value = Array.isArray(value) ? value.join(', ') : '';
    input.placeholder = field.placeholder || 'örn. 1, 2, 3';

    input.addEventListener('input', () => {
        const arr = input.value
            .split(/[,\s]+/)
            .filter(Boolean)
            .map(s => Number(s))
            .filter(n => Number.isFinite(n));
        onChange(field.path, arr);
    });
    return input;
}
