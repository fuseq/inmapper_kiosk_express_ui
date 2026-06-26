/**
 * Resolve the active interface for this load.
 *
 * Resolution order:
 *   1. `?view=` URL param (editor preview / explicit manual override) — wins
 *      if it is one of the deployment's enabled `interfaces`.
 *   2. A fixed `initialView` (concrete, not 'auto') — pins the app, e.g. a
 *      kiosk hardware install or a single-interface deployment.
 *   3. If exactly one interface is enabled, use it.
 *   4. Auto-detect within the enabled set: phone viewport -> 'mobile' (when
 *      enabled), otherwise 'web', otherwise the first kiosk variant.
 *
 * Kiosk / kiosk-portrait are never auto-selected from viewport (hardware is
 * fixed at install via `initialView`); only web<->mobile auto-switch.
 */

const VALID = ['web', 'kiosk', 'kiosk-portrait', 'mobile'];
const PHONE_QUERY = '(max-width: 768px)';

function isPhoneViewport() {
    try {
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            return window.matchMedia(PHONE_QUERY).matches;
        }
    } catch { /* ignore */ }
    return false;
}

export function resolveInterface(config, search) {
    const enabled = (Array.isArray(config.interfaces) && config.interfaces.length
        ? config.interfaces
        : VALID).filter(v => VALID.includes(v));
    const set = enabled.length ? enabled : VALID.slice();

    const params = search instanceof URLSearchParams
        ? search
        : new URLSearchParams(search || (typeof location !== 'undefined' ? location.search : ''));

    // 1. explicit ?view= override (preview / manual). Wins unconditionally
    //    when it names a valid interface — the editor preview relies on this
    //    to switch devices regardless of the deployment's enabled set.
    const viewParam = params.get('view');
    if (viewParam && VALID.includes(viewParam)) return viewParam;

    // 2. fixed install view
    const fixed = config.initialView;
    if (fixed && fixed !== 'auto' && set.includes(fixed)) return fixed;

    // 3. single enabled interface
    if (set.length === 1) return set[0];

    // 4. auto-detect web <-> mobile
    if (set.includes('mobile') && isPhoneViewport()) return 'mobile';
    if (set.includes('web')) return 'web';
    if (set.includes('kiosk')) return 'kiosk';
    if (set.includes('kiosk-portrait')) return 'kiosk-portrait';
    return set[0] || 'web';
}
