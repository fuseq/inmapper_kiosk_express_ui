export const config = {
    /* Which interfaces this deployment ships. The runtime picks one of these
     * at load via `resolveInterface()`: web<->mobile is auto-detected by
     * viewport; kiosk / kiosk-portrait are fixed (hardware installs). The
     * editor's export writes this list based on the selected interfaces. */
    interfaces: ['web', 'kiosk', 'kiosk-portrait', 'mobile'],

    /* Forced interface. A concrete value ('web'|'kiosk'|'kiosk-portrait'|
     * 'mobile') pins the app to that interface (e.g. a kiosk install).
     * 'auto' lets `resolveInterface()` choose within `interfaces` (used for
     * combined web+mobile bundles). Kept as 'kiosk' by default for backward
     * compatibility with existing single-config deployments. */
    initialView: 'kiosk',  // 'auto' | 'kiosk' | 'kiosk-portrait' | 'web' | 'mobile'

    branding: {
        logo: 'assets/terminal.png',
        title: 'TERMİNAL',
        subtitle: 'KADIKÖY',
    },

    navbar: {
        enabled: true,
        clock: true,
        logo: true,
        langSwitcher: true,
    },

    theme: {
        backgroundGradient: ['#214eaf', '#3863be', '#3b82f6'],
        solidSurface: 'rgb(248, 245, 245)',
        accentColor: '#111111',
        accentHover: '#4f46e5',
        textPrimary: 'rgba(19, 18, 18, 0.95)',
        textSecondary: 'rgba(255, 255, 255, 0.75)',
        textMuted: 'rgba(255, 255, 255, 0.5)',
        glassEnabled: true,
        glassBackground: 'rgba(255, 255, 255, 0.12)',
        glassBorder: 'rgba(255, 255, 255, 0.18)',
        glassBlur: '25px',
        // Kart kenarlığı — yüzey renginden bağımsız; solid/glass modda kartları
        // zeminden ayırmak için kontrastlı bir değer seçin.
        cardBorder: 'rgba(0, 0, 0, 0.14)',
        // Card/chip/input surfaces derive from the base theme surface
        // (glassBackground in glass mode, solidSurface in no-glass mode).
        // Active-chip fill derives from accentColor.

        
        // Mobile bottom-sheet theme (optional — sensible defaults used when omitted)
        mobile: {
            sheetBackground: '#ffffff',         // bottom sheet bg
            sheetShadow: 'rgba(0, 0, 0, 0.12)',// sheet box-shadow color
            cardBackground: '#f3f4f6',          // input fields, buttons, cards
            cardBorder: '#e5e7eb',              // borders & dividers
            surfaceBackground: '#f9fafb',       // secondary surface (step card, etc.)
            // null = inherit the general theme text color (theme.textPrimary).
            // Set a value here to override mobile text independently. Secondary
            // / muted are derived from primary when left null (the general
            // secondary/muted are tuned for the dark kiosk bg, so reusing them
            // on the light sheet would be illegible).
            textPrimary: null,                  // headings / main text
            textSecondary: null,                // secondary labels
            textMuted: null,                    // placeholders, hints
            dangerBackground: '#fef2f2',        // cancel button bg
            dangerColor: '#dc2626',             // cancel button text
            progressGradientEnd: null,          // null = auto-derive from accentColor

            // Category grid layout — controls how many cards per row.
            // Each number = how many cards in that row; remaining cards use defaultColumns.
            // Cards in a row share the full width equally, so 1 = full-width banner card.
            categoryGrid: {
                defaultColumns: 3,              // fallback column count for rows not listed
                rows: [],                // e.g. [1, 2, 3] → first row 1 card (full-width), second row 2 cards, third row 3 cards …
            },
        },

        /* Kiosk Dikey (Portrait) — Mappedin-style full-screen map with
         * floating overlay chrome. All theme variables here only affect
         * `initialView: 'kiosk-portrait'`. */
        /* Portrait reuses the horizontal kiosk DOM (.initial-home,
         * .search-tab, .store-detail-content). These knobs control:
         *   • vertical offset of each home overlay (logo / search / cards
         *     / explore button) — measured from viewport center.
         *   • where the search-tab drops down from (top offset).
         *   • how many rows of search results are visible at once
         *     (others scroll).
         *   • the small right-edge rail of utility actions that replaces
         *     the top navbar.
         * All overrides emitted as CSS vars by `applyKioskPortraitTheme`. */
        kioskPortrait: {
            edgePadding: 24,
            railWidth: 84,
            railItems: ['home', 'findMe'],

            /* Home-screen element offsets relative to viewport center.
             * Logo height in portrait is ~260px (160 image + 16 gap +
             * 80 for title + subtitle). With these values:
             *   • logo:    top 500–758
             *   • search:  top 840–924
             *   • cards:   top ~1020–1160
             *   • explore: top ~1180–1240
             * Each element clears the next by a 60–80px gap. */
            logoTopOffset:    -460,
            searchTopOffset:  -120,
            cardsTopOffset:   60,
            exploreTopOffset: 220,

            searchTabTopOffset: -720,
            searchListMaxRows:  3,
        },
    },

    venue: {
        name: 'Terminal Kadıköy',
        dataSource: 'sheets',
        api: {
            /* Birim listesi JSON endpoint'i. Kaynak = 'api' iken kullanılır.
             * Ör. Zorlu: https://api.inmapper.com/zorlu-center */
            baseUrl: '',
        },
        sheets: {
            sheetId: '1oyRNQNzcZ46pvV76rH8hK-k3QkUNfGqZ',

            /* Multi-tab layout (preferred). Each value is either a tab
             * NAME ("Zorlu_List") or a numeric gid ("959188093"). Tab
             * names are easier to maintain — but renaming the tab will
             * break the link, so for stable deployments stick to gids.
             *
             *   list       → birim listesi (ID, Title, Category, Floor …)
             *   categories → kategori → renk + display name + icon
             *   info       → opsiyonel: hizalama anchor + rotation
             */
            tabs: {
                /* Boş → eski `gid` alanı kullanılır (geriye uyumluluk).
                 * Yeni venue'lar için sayfa adlarını editor → Ayarlar →
                 * Sheets sekmesinden doldurun. */
                list:       '',
                categories: '',
                info:       '',
            },

            /* Apps Script web app endpoint (deploy via instructions in
             * apps-script/sheet-writer.gs). When set, the editor pushes
             * Title/Category/etc edits straight back to the sheet. When
             * unset, edits stay local and need to be copied manually. */
            writeEndpointUrl: '',

            /* Legacy single-tab field. Used as a fallback when `tabs.list`
             * is empty — keeps existing deployments working without a
             * config update. */
            gid: '959188093',
        },
        geojsonPath: 'assets/terminal.geojson',
        /* Server-side routing (replaces in-browser pathfinder). */
        routing: {
            venueSlug: 'zorlu',
            routeUrl: 'http://localhost:5002/api/route',
            describeUrl: 'http://localhost:5002/api/describe',
        },
        /* Legacy local fallback for the categories list. Now optional — when
         * the sheets `categories` tab is configured, the live sheet wins and
         * this file is only consulted on first paint / offline boot. */
        categoryMappingFile: 'category-mapping.json',
        cacheDuration: 5 * 60 * 1000,
        floorMap: {
            '0': 'Zemin Kat',

        },
        // Floor that should be active when the app first opens. Falls back
        // to the first key in `floorMap` if not explicitly set.
        defaultFloor: '0',
        kioskLocation: {
            id: 0,
            name: 'Bulunduğunuz Konum',
            category: 'Kiosk',
            floor: 'Zemin Kat',
            type: 'kiosk',
            icon: '📍',
        },
    },
    features: {
        data: { enabled: true },
        map: {
            enabled: true,
            center: [29.036874, 40.991633],
            pitch: 60,
            bearing: -20,
            zoom: 17,
            sublayerColors: {
                walking: '#f5f5f5', building: '#e6e6e6', stand: '#d9d3d2',
                service: '#e9dad0', food: '#d1bbbc', water: '#cfe2f3',
                other: '#e9dad0', shop: '#d9d3d2', green: '#a8d08d',
                medical: '#ff9999', commercial: '#ffe0b2', social: '#c5cae9',
                structure: '#d0d0d0',
            },
            sublayerHeights: {
                walking: 0, building: 3, stand: 3, service: 3,
                food: 3, water: 3, other: 3, shop: 3,
                green: 1, medical: 3, commercial: 3, social: 3,
                structure: 3,
            },
            shrinkFactor: 0.99,
            /* Birim render modu:
             *   'solid' — birimler dolu blok olarak yükseltilir (varsayılan).
             *   'walls' — Pointr tarzı: sadece çevre duvarı yükseltilir,
             *             içeride zemin renkli kalır (içi boş oda görünümü). */
            roomRenderMode: 'solid',
            /* Sublayer (grup) bazında render modu override'ı. Boş = tüm
             * gruplar global `roomRenderMode`'u kullanır. Bir gruba değer
             * verilirse o grup ondan bağımsız çizilir, ör:
             *   { stand: 'walls', event: 'solid', area: 'walls' }
             * Editör → 3D Yükseklikler panelindeki grup satırlarından
             * (Duvar / Dolu Blok) ayarlanır. */
            renderModeBySublayer: {},
            /* 'walls' modunda duvar bandı kalınlığı (metre). turf ile içe
             * ofset uygulanır; çok küçük birimlerde inset başarısız olursa
             * o birim dolu bloğa düşülerek korunur. */
            wallThickness: 0.6,
            /* 'walls' modunda duvar rengi kaynağı:
             *   'unit'  — birimin kategori rengini kullan (varsayılan).
             *   'fixed' — aşağıdaki sabit `wallColor` rengini kullan. */
            wallColorMode: 'unit',
            wallColor: '#d9d3d2',
            /* 'walls' modunda: kapıların olduğu yerde duvar bandında boşluk aç
             * (Pointr tarzı açık kapı görünümü). Kapılar nav-mesh'teki 'doors'
             * çizgileridir ve ait oldukları birime id ön ekiyle bağlanır
             * (ID001_1_ → ID001). Her kapı, biriminin duvarından
             * `doorGapWidth` metre genişliğinde bir açıklık keser. */
            doorGaps: true,
            doorGapWidth: 1.2,
            /* When false (default), only the active floor is drawn. Other
             * floors' plan outlines are hidden — required for stacked multi-
             * floor venues (e.g. malls) where lower-floor walking lines would
             * otherwise bleed through. Enable for a faint dashed context. */
            showOtherFloorOutlines: false,
            tileOpacity: 0.6,
            overlayOpacity: 0.35,
            interaction: {
                hover: true,
                click: true,
                hoverColor: '#93c5fd',
                selectedColor: '#3b82f6',
                routeStartColor: '#22c55e',
                routeEndColor: '#3b82f6',
                flyToDuration: 800,
                flyToMaxZoom: 20,
                flyToPadding: 120,
            },
            labels: {
                normalization: true,
                minZoom: { sm: 19, md: 17, lg: 15 },
                collisionEnabled: true,
                textColor: '#1a1a1a',
                haloColor: 'rgba(255,255,255,0.9)',
                pitchAlignment: 'viewport',     // 'viewport' = always face camera | 'map' = lay flat on surface
                translateAnchor: 'viewport',     // 'viewport' = pixel offset | 'map' = map-unit offset
                // Upward Y offset per zoom level to position labels above polygons.
                // Format: [zoom1, y1, zoom2, y2, ...] — negative = upward
                translateStops: [15, 0, 17, -12, 18, -20, 19, -30, 20, -45, 21, -65],
            },

            route: {
                color: '#2563EB',
                glowColor: '#2563EB',
                glowOpacity: 0.25,
                outlineColor: '#1e40af',
                animateDraw: true,
                drawDuration: 2000,
                drawEasing: 'easeInOutCubic',

                arrows: {
                    enabled: true,
                    animated: true,
                    count: 6,
                    speed: 0.06,
                    color: '#ffffff',
                    opacity: 0.9,
                    // Custom marching icon along the route. When set (PNG/SVG
                    // path or URL / data-URL), it replaces the built-in arrow
                    // glyph. `rotateWithPath` keeps directional icons aligned
                    // to travel direction; turn it off for symmetric icons
                    // (dots, logos). `size` scales the icon (1 = default).
                    iconUrl: null,
                    rotateWithPath: true,
                    size: 1,
                },

                overviewFirst: true,
                navCameraZoom: 20,
                navCameraPitch: 65,
            },
        },
        models3d: {
            enabled: true,
            models: [
                {
                    id: 'chobani-stadium',
                    url: 'assets/models/Football Stadium.glb',
                    origin: [29.036546, 40.988108],
                    altitude: 0,
                    rotation: [Math.PI / 2, 0, 0],
                    scale: 3,
                },
                {
                    id: 'kadikoy-belediyesi',
                    url: 'assets/models/Town Hall.glb',
                    origin: [29.0372, 40.9933],
                    altitude: 0,
                    rotation: [Math.PI / 2, 0, 0],
                    scale: 0.02,
                },
            ],
        },
        search: { enabled: true },
        navigation: {
            enabled: true,
            qrBaseUrl: 'https://zorlu.center/route',
            startPointMode: 'manual',   // 'auto' (kioskLocation) | 'manual' (user picks)
            routeTypes: [
                { key: 'shortest',    label: 'En Kısa',     icon: 'stepStraight' },
                { key: 'least_turns', label: 'Az Dönüş', icon: 'stepRight' },
            ],
            droppedPin: {
                enabled: true,
                pinColor: '#3b82f6',
                cursorColor: '#f97316',
                snapToPath: true,
            },
        },
        sidePanel: {
            enabled: true,
            defaultSide: 'right',
            layout: 'island',           // 'panel' | 'island'
            island: {
                position: 'top-left', // 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
                width: 500,              // px
                maxHeight: '70vh',
                compactVisibleRows: 3,    // number of category grid rows visible in compact (home) state
                margin: 20,              // px — distance from screen edges
                borderRadius: 20,        // px
            },
        },
        keyboard: {
            enabled: true,
            defaultLanguage: 'tr',
            languages: ['tr', 'en', 'zh', 'ar'],
        },
        home: {
            enabled: true,
            slideshow: true,
            searchBar: true,
            categoryCards: true,
            exploreMapBtn: true,
            /* KIOSK-ONLY: which category cards are shown on the kiosk start
             * screens (yatay + dikey). Does not affect the mobile grid or the
             * web island/panel. null or [] = all available categories (from
             * Sheets). Otherwise an array of apiKeys, e.g. ['fashion','food']. */
            visibleCategories: null,
        },
        floorSelector: { enabled: true },
        clock: { enabled: true },
        idle: {
            enabled: true,
            timeout: 90000,
        },
        storeDetail: { enabled: true },
        messaging: { enabled: true },
        /* Mobile conversational assistant (voice + NLP). Lives inside the
         * bottom sheet as a toggleable panel. Coexists with the classic
         * navigation flow. `suggestions` overrides the default quick chips. */
        assistant: {
            enabled: true,
            voice: true,
            language: 'tr',     // 'tr' | 'en' — initial assistant language
            suggestions: null,  // null = sensible defaults; or string[]
        },
        editMode: { enabled: false },
    },
};
