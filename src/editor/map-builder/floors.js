/**
 * Floors panel — top of the Map Builder sidebar.
 *
 * Lets the user manage the set of floors in their venue project:
 *   • Pick the active floor (every other Map Builder tab operates on
 *     `mbState.getActiveFloor()`)
 *   • Add / rename / reorder / delete floors
 *
 * Each row shows the display name plus a chip for the floor key
 * (`-1`, `0`, `1`, …) and a status hint (no-svg / has-geojson) so the
 * user can see at a glance which floors still need work.
 */

import { mbState } from './state.js';

let app = null;

export async function initFloors(_app) {
    app = _app;
    const $list   = document.getElementById('mbFloorList');
    const $add    = document.getElementById('mbFloorAdd');
    if (!$list || !$add) return;

    function render() {
        const floors = mbState.listFloors();
        const active = mbState.activeFloorKey;
        $list.innerHTML = '';
        for (const f of floors) {
            const row = document.createElement('div');
            row.className = 'ed-mb-floor-row' + (f.key === active ? ' is-active' : '');
            row.draggable = true;
            row.dataset.key = f.key;

            const hasSvg = !!f.svgText;
            const hasGj  = !!(f.geojson?.features?.length);
            const status = hasGj ? 'ok' : (hasSvg ? 'svg' : 'empty');
            const badge =
                status === 'ok'  ? '<span class="ed-mb-floor-badge ok"  title="İşlenmiş">●</span>' :
                status === 'svg' ? '<span class="ed-mb-floor-badge svg" title="SVG var, işlenmedi">○</span>' :
                                   '<span class="ed-mb-floor-badge empty" title="Boş">·</span>';

            row.innerHTML = `
              <span class="ed-mb-floor-key" title="Kat numarası">${escapeHtml(f.key)}</span>
              <span class="ed-mb-floor-name" title="Yeniden adlandırmak için çift tıkla">${escapeHtml(f.name)}</span>
              ${badge}
              <button type="button" class="ed-mb-floor-del" title="Katı sil" aria-label="Sil">×</button>
            `;
            row.addEventListener('click', (e) => {
                if (e.target.closest('.ed-mb-floor-del')) return;
                mbState.setActiveFloor(f.key);
            });
            row.querySelector('.ed-mb-floor-name').addEventListener('dblclick', (e) => {
                e.stopPropagation();
                startRename(row, f);
            });
            row.querySelector('.ed-mb-floor-del').addEventListener('click', (e) => {
                e.stopPropagation();
                onDelete(f);
            });

            // Drag-reorder
            row.addEventListener('dragstart', (e) => {
                row.classList.add('is-dragging');
                e.dataTransfer.setData('text/plain', f.key);
                e.dataTransfer.effectAllowed = 'move';
            });
            row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
            row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('is-drop-target'); });
            row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.classList.remove('is-drop-target');
                const fromKey = e.dataTransfer.getData('text/plain');
                if (fromKey && fromKey !== f.key) onReorder(fromKey, f.key);
            });

            $list.appendChild(row);
        }
    }

    function startRename(row, floor) {
        const $name = row.querySelector('.ed-mb-floor-name');
        const original = floor.name;
        $name.contentEditable = 'true';
        $name.focus();
        // Select all
        const range = document.createRange();
        range.selectNodeContents($name);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);

        const finish = async (commit) => {
            $name.contentEditable = 'false';
            const next = $name.textContent.trim() || original;
            if (commit && next !== original) {
                try {
                    await mbState.renameFloor(floor.key, next);
                    schedulePreviewReload();
                }
                catch (e) { app?.setStatus?.(e.message, 'dirty'); }
            } else {
                $name.textContent = original;
            }
        };
        $name.addEventListener('blur', () => finish(true), { once: true });
        $name.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); $name.blur(); }
            if (ev.key === 'Escape') { ev.preventDefault(); $name.textContent = original; $name.blur(); }
        });
    }

    /**
     * Trigger a preview-iframe reload after a floor mutation. The
     * runtime reads the floor list out of IndexedDB on boot, so any
     * change to the floors set (add / rename / delete / reorder) means
     * the preview's cached `config.venue.floorMap` is now stale —
     * including the floor selector dropdown.
     */
    function schedulePreviewReload() {
        try { app?.reload?.(['venue.floorMap']); } catch {}
    }

    async function onDelete(floor) {
        const isLast = mbState.listFloors().length <= 1;
        const msg = isLast
            ? `"${floor.name}" tek kalan kat — silinince proje boş bir "Zemin Kat" ile sıfırlanacak. Devam edilsin mi?`
            : `"${floor.name}" katı ve içindeki tüm SVG/GeoJSON verisi silinecek. Devam edilsin mi?`;
        if (!confirm(msg)) return;
        try {
            await mbState.deleteFloor(floor.key);
            app?.setStatus?.(
                isLast ? 'Proje sıfırlandı' : `"${floor.name}" silindi`,
                'saved');
            schedulePreviewReload();
        } catch (e) {
            app?.setStatus?.(e.message, 'dirty');
        }
    }

    async function onReorder(fromKey, toKey) {
        const list = mbState.listFloors().map(f => f.key);
        const fromIdx = list.indexOf(fromKey);
        const toIdx = list.indexOf(toKey);
        if (fromIdx < 0 || toIdx < 0) return;
        list.splice(fromIdx, 1);
        list.splice(toIdx, 0, fromKey);
        await mbState.reorderFloors(list);
        schedulePreviewReload();
    }

    $add.addEventListener('click', async () => {
        const key = (prompt('Kat numarası (örn. 0, 1, -1):') || '').trim();
        if (!key) return;
        if (mbState.listFloors().some(f => f.key === key)) {
            app?.setStatus?.(`"${key}" zaten var`, 'dirty');
            return;
        }
        const name = (prompt(`"${key}" katı için görünen isim:`, defaultFloorName(key)) || '').trim() || defaultFloorName(key);
        try {
            await mbState.addFloor({ key, name });
            await mbState.setActiveFloor(key);
            app?.setStatus?.(`"${name}" eklendi`, 'saved');
            schedulePreviewReload();
        } catch (e) {
            app?.setStatus?.(e.message, 'dirty');
        }
    });

    mbState.on('hydrate', render);
    mbState.on('floors-changed', render);
    mbState.on('active-floor-changed', render);
    mbState.on('geojson-changed', render);
    mbState.on('svg-loaded', render);

    render();
}

function defaultFloorName(key) {
    const n = parseInt(key, 10);
    if (Number.isNaN(n)) return key;
    if (n === 0) return 'Zemin Kat';
    if (n > 0) return `${n}. Kat`;
    return `${Math.abs(n)}. Bodrum`;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
