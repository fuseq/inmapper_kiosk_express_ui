/**
 * Birimler tab preview iframe controller.
 *
 * Yaklaşım: ayrı bir MapLibre instance yerine, kiosk uygulamasının
 * kendisini `?preview=1` ile bir iframe içinde yükleyip "item editor"
 * moduna alıyoruz. Böylece harita TAMAMEN gerçek render'la görünür:
 * extrusion, sublayer renkleri, ikonlar, kat seçici, hepsi.
 *
 * İletişim (postMessage):
 *   parent → iframe : { type: 'editor:goToScene',
 *                        commands: [{type:'goToItemEditor'}] }
 *   parent → iframe : { type: 'editor:highlightItem', id }
 *   iframe → parent : { type: 'preview:ready' }
 *   iframe → parent : { type: 'preview:itemClicked', id }
 *
 * Bu modül kendi bridge'ini açmaz — parent'taki bridge'i kullanır;
 * dış API'si sadece `init`, `setActiveItem`, `destroy`.
 */

import { createBridge } from '../bridge.js';
import { buildPreviewUrl } from '../device-presets.js';

export function initItemsPreview(host, opts) {
    const { onItemClicked, onReady } = opts || {};

    host.innerHTML = `
        <div class="ed-items-preview-toolbar">
            <span class="ed-items-preview-label">Canlı Önizleme</span>
            <div class="ed-items-preview-status" id="itPreviewStatus">Yükleniyor…</div>
            <button type="button" class="ed-items-preview-reload" id="itPreviewReload" title="Önizlemeyi yenile">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
            </button>
        </div>
        <div class="ed-items-preview-stage">
            <div class="ed-items-preview-overlay" id="itPreviewOverlay">
                <div class="ed-items-preview-spinner"></div>
                <div class="ed-items-preview-overlay-label">Harita yükleniyor…</div>
            </div>
            <iframe class="ed-items-preview-iframe" title="Birim editörü önizlemesi"></iframe>
        </div>
    `;

    const $iframe  = host.querySelector('iframe');
    const $reload  = host.querySelector('#itPreviewReload');
    const $overlay = host.querySelector('#itPreviewOverlay');
    const $status  = host.querySelector('#itPreviewStatus');

    /* The Items tab preview always renders at "web" device (no kiosk
     * chrome around it makes the most sense for a clickable map). */
    const url = buildPreviewUrl('web');
    $iframe.src = url;

    const bridge = createBridge($iframe);
    let isReady = false;
    let editorModeApplied = false;
    let pendingHighlight = null;
    let failsafeTimer = null;

    function markReady(label = 'Hazır') {
        $overlay.classList.add('is-hidden');
        $status.textContent = label;
        $status.classList.add('is-ready');
        if (failsafeTimer) { clearTimeout(failsafeTimer); failsafeTimer = null; }
    }

    /* If neither `data-ready` nor `app-ready` arrive within 6 s (e.g.
     * locations were already loaded BEFORE we registered, *and* the
     * fallback emission in preview-bridge somehow missed), hide the
     * overlay anyway — the map is almost certainly visible behind it. */
    function armFailsafe() {
        if (failsafeTimer) clearTimeout(failsafeTimer);
        failsafeTimer = setTimeout(() => markReady('Hazır'), 6000);
    }
    armFailsafe();

    const unsub = bridge.on((evt) => {
        if (evt.type === 'ready') {
            const phase = evt.data?.phase;
            /* Hide the overlay on EITHER data-ready or app-ready — the map
             * is visible after both. The very first ready (no phase) is
             * just the handshake; we keep "Hazırlanıyor…" until a phased
             * one arrives. */
            if (phase === 'data-ready' || phase === 'app-ready') {
                markReady('Hazır');
            } else if (!isReady) {
                $status.textContent = 'Hazırlanıyor…';
            }
            isReady = true;
            // Send goToItemEditor only once per iframe lifecycle. Subsequent
            // preview:ready signals (app-ready, data-ready phases) just
            // mean different boot milestones — not a re-mount.
            if (!editorModeApplied) {
                bridge.enterItemEditor();
                editorModeApplied = true;
            }
            if (pendingHighlight !== undefined) {
                bridge.highlightItem(pendingHighlight);
                pendingHighlight = undefined;
            }
            onReady?.(phase);
        } else if (evt.type === 'itemClicked') {
            onItemClicked?.(evt.data?.id ?? null);
        }
    });

    $reload.addEventListener('click', () => doReload());

    function doReload() {
        isReady = false;
        editorModeApplied = false;
        $overlay.classList.remove('is-hidden');
        $status.textContent = 'Yenileniyor…';
        $status.classList.remove('is-ready');
        armFailsafe();
        try {
            $iframe.contentWindow?.location.reload();
        } catch {
            $iframe.src = url + '&_t=' + Date.now();
        }
    }

    return {
        setActiveItem(id) {
            if (isReady) bridge.highlightItem(id || null);
            else pendingHighlight = id || null;
        },
        reload: doReload,
        destroy() {
            unsub();
            bridge.destroy?.();
        },
    };
}
