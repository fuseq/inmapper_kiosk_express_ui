/**
 * Interface structural profile.
 *
 * Single source of truth for the *structural* differences between the four
 * interfaces. Settings are global (shared across every interface); only the
 * known structural divergences below switch on/off per interface — e.g. the
 * web interface has no kiosk start screen and no navbar, mobile uses the
 * bottom sheet, the kiosk store-detail tab surface only exists on kiosk.
 *
 * Consumers read `getInterfaceProfile(config.initialView)` (or the
 * `interfaceProfile()` helper re-exported from app.js).
 *
 * Fields:
 *   home           — kiosk start/home screen + idle→home + slideshow
 *   navbar         — floating glass navbar
 *   storeDetailTab — kiosk search-tab store-detail surface (vs inline island
 *                    detail / mobile bottom sheet)
 *   bottomSheet    — mobile bottom sheet shell
 *   portraitRail   — kiosk-portrait floating rail chrome
 *   keyboard       — on-screen virtual keyboard eligible
 */

export const INTERFACE_PROFILE = {
    web: {
        home: false,
        navbar: false,
        storeDetailTab: false,
        bottomSheet: false,
        portraitRail: false,
        keyboard: true,
    },
    kiosk: {
        home: true,
        navbar: true,
        storeDetailTab: true,
        bottomSheet: false,
        portraitRail: false,
        keyboard: true,
    },
    'kiosk-portrait': {
        home: true,
        navbar: true,
        storeDetailTab: true,
        bottomSheet: false,
        portraitRail: true,
        keyboard: true,
    },
    mobile: {
        home: false,
        navbar: false,
        storeDetailTab: false,
        bottomSheet: true,
        portraitRail: false,
        keyboard: false,
    },
};

export function getInterfaceProfile(view) {
    return INTERFACE_PROFILE[view] || INTERFACE_PROFILE.web;
}
