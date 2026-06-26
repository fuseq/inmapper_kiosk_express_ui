/**
 * Scene definitions for the Config Editor preview.
 *
 * A "scene" is a named UI state inside the kiosk app (e.g. home idle,
 * map with a selected location, route drawn, mobile detail view, …).
 * The editor uses scenes to:
 *   - Show a dedicated scene switcher above the preview.
 *   - Auto-navigate the preview when the user focuses a field whose
 *     affected components are only visible in a specific scene.
 *
 * Each scene has:
 *   - id: string
 *   - label: human label
 *   - device: which device presets the scene applies to ('web'|'kiosk'|'mobile'|'all')
 *   - description: short hint
 *   - commands: list of bridge commands (goToScene uses these to drive
 *     the preview). The preview-bridge knows how to execute each type.
 */

export const SCENES = [
    // -------------------- KIOSK (yatay + dikey) --------------------
    // Kiosk açılışta bir home ekranı gösterir. Web ve mobilde böyle bir
    // ekran yok, o yüzden bu sahneler yalnızca kiosk cihazlarında.
    {
        id: 'home-idle',
        label: 'Kiosk — Boşta',
        device: ['kiosk', 'kiosk-portrait'],
        description: 'Kiosk başlangıç ekranı. Yatay: arama tetikleyici + kategori kartları. Dikey: brand header + yüzen arama pill + "Haritayı Keşfet" butonu.',
        commands: [
            { type: 'closeSearch' },
            { type: 'showHome' },
        ],
    },
    {
        id: 'kiosk-map-explore',
        label: 'Kiosk — Haritayı Keşfet',
        device: ['kiosk', 'kiosk-portrait'],
        description: 'Kiosk\'a özel: side-panel/island gizli, sadece harita + kat seçici + geri dön butonu görünür. Home ekranındaki "Haritayı Keşfet" butonuyla açılır.',
        commands: [
            { type: 'closeSearch' },
            { type: 'goToExplore' },
            { type: 'clearSelection' },
        ],
    },
    {
        id: 'home-search',
        label: 'Kiosk — Arama Açık',
        device: ['kiosk', 'kiosk-portrait'],
        description: 'Arama paneli açık; keyboard + kategori chip\'leri görünür.',
        commands: [
            { type: 'showHome' },
            { type: 'openSearch' },
        ],
    },

    // -------------------- KIOSK + WEB --------------------
    {
        id: 'map-default',
        label: 'Harita — Varsayılan',
        device: ['kiosk', 'kiosk-portrait', 'web'],
        description: 'Harita varsayılan görünümü: panel/island + kat seçici görünür, geri dön butonu yok. Web bu ekranla açılır.',
        commands: [
            { type: 'closeSearch' },
            { type: 'goToMap' },
            { type: 'clearSelection' },
        ],
    },
    {
        id: 'map-location',
        label: 'Harita — Birim Seçili',
        device: ['kiosk', 'kiosk-portrait', 'web'],
        description: 'Bir birim seçilmiş; detay kartı, benzer mağazalar, rota butonu.',
        commands: [
            { type: 'closeSearch' },
            { type: 'goToMap' },
            { type: 'selectFirstLocation' },
        ],
    },
    {
        id: 'map-route',
        label: 'Harita — Rota Çizili',
        device: ['kiosk', 'kiosk-portrait', 'web'],
        description: 'Başlangıç & hedef belirlenmiş, rota çizilmiş hali.',
        commands: [
            { type: 'closeSearch' },
            { type: 'goToMap' },
            { type: 'drawSampleRoute' },
        ],
    },

    // -------------------- MOBILE --------------------
    {
        id: 'mobile-home',
        label: 'Mobil — Home',
        device: ['mobile'],
        description: 'Alt sayfa home görünümü: arama + kategori ızgarası.',
        commands: [
            { type: 'goToMap' },
            { type: 'mobileHome' },
        ],
    },
    {
        id: 'mobile-detail',
        label: 'Mobil — Detay',
        device: ['mobile'],
        description: 'Alt sayfa, bir birim seçili; store detay bölümü.',
        commands: [
            { type: 'goToMap' },
            { type: 'selectFirstLocation' },
        ],
    },
    {
        id: 'mobile-route',
        label: 'Mobil — Rota',
        device: ['mobile'],
        description: 'Alt sayfa, rota çizilmiş; adım listesi / progress bar.',
        commands: [
            { type: 'goToMap' },
            { type: 'drawSampleRoute' },
        ],
    },
];

export function getScenesForDevice(device) {
    return SCENES.filter(s =>
        s.device === 'all' ||
        (Array.isArray(s.device) && s.device.includes(device))
    );
}

export function getSceneById(id) {
    return SCENES.find(s => s.id === id) || null;
}

/**
 * Pick a sensible default scene for a device when no scene has been
 * explicitly chosen yet.
 */
export function defaultSceneForDevice(device) {
    if (device === 'mobile') return 'mobile-home';
    if (device === 'kiosk' || device === 'kiosk-portrait') return 'home-idle';
    return 'map-default';   // web
}
