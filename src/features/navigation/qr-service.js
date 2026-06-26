import { state } from '../../core/state.js';
import { config } from '../../core/config.js';

/* Single source of truth for the route → phone deep-link URL. Anywhere
 * that wants to mint a QR for the current route (modal, side-panel card,
 * island nav card, mobile sheet) should call this so the encoding stays
 * consistent. Returns `null` when the route is incomplete or QR is
 * disabled (empty `qrBaseUrl`). */
export function buildRouteUrl() {
    const base = config.features?.navigation?.qrBaseUrl;
    if (!base) return null;
    const ep = state.endPoint;
    if (!ep) return null;
    const fromId = state.startPoint?.id || 0;
    return `${base}?from=${fromId}&to=${ep.id}`;
}

export function buildRouteQrImageUrl(size = 300) {
    const route = buildRouteUrl();
    if (!route) return null;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(route)}`;
}

export function showQRCode() {
    const qrUrl = buildRouteQrImageUrl(300);
    if (!qrUrl) return;

    const img = document.getElementById('qrCodeImage');
    const modal = document.getElementById('qrModal');
    if (img) img.src = qrUrl;
    if (modal) modal.classList.add('active');
}

export function hideQRCode() {
    const modal = document.getElementById('qrModal');
    if (modal) modal.classList.remove('active');
}
