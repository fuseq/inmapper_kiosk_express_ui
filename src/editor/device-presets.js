/**
 * Device presets + iframe scale-to-fit
 */

export const DEVICE_PRESETS = {
    // Web ve Kiosk önizlemeleri aynı 1920x1080 kanvasta render edilip stage'e
    // scale-to-fit ediliyor — böylece iki device arasında geçiş yaparken
    // boyut/oran değişmiyor, yalnızca `initialView` farkı görünüyor.
    web:               { width: 1920, height: 1080, initialView: 'web',            label: 'Web' },
    kiosk:             { width: 1920, height: 1080, initialView: 'kiosk',          label: 'Kiosk' },
    'kiosk-portrait':  { width: 1080, height: 1920, initialView: 'kiosk-portrait', label: 'Kiosk Dikey' },
    mobile:            { width: 390,  height: 844,  initialView: 'mobile',         label: 'Mobil' },
};

/**
 * Fit the device frame inside the stage using CSS scale.
 * Called on device switch and on window resize.
 */
export function fitDeviceFrame(stageEl, frameEl, device) {
    const preset = DEVICE_PRESETS[device];
    if (!preset) return;

    if (!preset.width || !preset.height) {
        // fluid — let CSS handle it
        frameEl.style.transform = '';
        frameEl.style.margin = '';
        return;
    }

    const stageRect = stageEl.getBoundingClientRect();
    const availW = Math.max(100, stageRect.width - 24);
    const availH = Math.max(100, stageRect.height - 24);

    const scale = Math.min(availW / preset.width, availH / preset.height, 1);
    frameEl.style.transform = `scale(${scale})`;
    frameEl.style.transformOrigin = 'center center';

    // `transform: scale()` görsel olarak küçültür ama layout boyutunu
    // değiştirmez — bounding box hâlâ preset.width × preset.height olur.
    // Stage'den büyük kalırsa grid (place-items: center) aşan elementi
    // başa hizalar; scaled görsel de stage'in altında kalır. Negatif
    // margin ile bounding box'ı scaled boyuta çöktürüyoruz, böylece grid
    // düzgün merkezler.
    const dx = (preset.width  * (scale - 1)) / 2;
    const dy = (preset.height * (scale - 1)) / 2;
    frameEl.style.margin = `${dy}px ${dx}px`;
}

/**
 * Build the preview URL for a given device + extra params.
 * Each device forces a matching `initialView`.
 */
export function buildPreviewUrl(device, extraParams = {}) {
    const preset = DEVICE_PRESETS[device] || DEVICE_PRESETS.web;
    const params = new URLSearchParams();
    params.set('preview', '1');
    params.set('view', preset.initialView);
    for (const [k, v] of Object.entries(extraParams)) params.set(k, v);
    return `index.html?${params.toString()}`;
}
