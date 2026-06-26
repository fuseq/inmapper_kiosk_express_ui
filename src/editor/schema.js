/**
 * Config editor schema — declarative description of every editable config path.
 *
 * Field shape:
 *   {
 *     path:   'theme.accentColor',         // dot path into config
 *     type:   'color'|'text'|'number'|'slider'|'toggle'|'select'|
 *             'gradient3'|'cssLength'|'numberArray',
 *     label:  'Display name',              // short, human title
 *     description?: 'What this affects, where it is visible.',
 *     hint?:  'Example value or caveat',   // shown as smaller muted line
 *
 *     // Layout / form behaviour
 *     options?: [{value,label}|'str'],     // for select
 *     min?, max?, step?,                   // for number / slider / cssLength
 *     unit?: 'px'|'ms'|…,                  // for cssLength
 *     placeholder?: '…',                   // for text
 *
 *     // Preview behaviour
 *     requiresReload?: true,               // true ⇒ cold-path (iframe reload)
 *     reapply?: 'theme'|'branding'|'navbar'|'island',  // hot-path event
 *     primaryScene?: 'home-idle'|…,        // preview auto-navigates here
 *     scenes?: ['home-idle','map-route'],  // additional scenes where the
 *                                          // change is visible
 *     selectors?: ['.isl-search-field',…], // CSS selectors highlighted on
 *                                          // focus, inside the preview iframe
 *   }
 *
 * Groups are shown as collapsible accordions and organised around the
 * user's journey through the app, NOT around internal config shape.
 */

export const schema = [
    /* ============================================================
     * General & initialisation
     * ============================================================ */
    {
        id: 'general',
        label: 'Genel',
        icon: 'settings',
        description: 'Uygulamanın hangi modda ve hangi deneyimle başlayacağı.',
        fields: [
            {
                path: 'initialView',
                type: 'select',
                label: 'Başlangıç Görünümü',
                description: 'Uygulama açılışta hangi moda girer. "Otomatik" web↔mobil arasında ekran boyutuna göre seçer. Editörde cihaz seçtiğinizde önizleme otomatik override edilir. Dışa aktarımda arayüz seçimi bu değeri belirler.',
                options: [
                    { value: 'auto',           label: 'Otomatik (web ↔ mobil)' },
                    { value: 'web',            label: 'Web — direkt harita' },
                    { value: 'kiosk',          label: 'Kiosk — başlangıç ekranı' },
                    { value: 'kiosk-portrait', label: 'Kiosk Dikey' },
                    { value: 'mobile',         label: 'Mobil — bottom sheet' },
                ],
                requiresReload: true,
            },
            {
                path: 'features.idle.enabled',
                type: 'toggle',
                label: 'Boşta Kalma (Idle) Timeout',
                description: 'Kiosk\'ta kullanıcı hareketsiz kalırsa başlangıç ekranına döner.',
                requiresReload: true,
            },
            {
                path: 'features.idle.timeout',
                type: 'slider',
                label: 'Idle Süresi',
                description: 'Kullanıcı hareketsiz kaldığında başlangıç ekranına kaç ms sonra dönülsün.',
                hint: 'Varsayılan 90 saniye',
                min: 10000, max: 600000, step: 5000,
            },
        ],
    },

    /* ============================================================
     * Marka
     * ============================================================ */
    {
        id: 'branding',
        label: 'Marka & Logo',
        icon: 'tag',
        description: 'Kiosk başlangıç ekranı başlığı ve logo.',
        fields: [
            {
                path: 'branding.title',
                type: 'text',
                label: 'Başlık',
                description: 'Kiosk başlangıç ekranında ve splash / loader\'da büyük harflerle görünür. Ör. "TERMİNAL".',
                reapply: 'branding',
                primaryScene: 'home-idle',
                selectors: ['.home-title', '#appLoader .loader-title'],
            },
            {
                path: 'branding.subtitle',
                type: 'text',
                label: 'Alt Başlık',
                description: 'Başlığın altında konum/alt brand olarak görünür. Ör. "KADIKÖY".',
                reapply: 'branding',
                primaryScene: 'home-idle',
                selectors: ['.home-title-location', '#appLoader .loader-subtitle'],
            },
            {
                path: 'branding.logo',
                type: 'text',
                label: 'Logo URL',
                description: 'Kiosk başlangıç ekranı, navbar ve loader\'da kullanılır. PNG/SVG yolu veya URL.',
                placeholder: 'assets/terminal.png',
                reapply: 'branding',
                primaryScene: 'home-idle',
                selectors: ['.logo-image', '.nav-logo img', '#appLoader .loader-logo'],
            },
            {
                path: 'venue.name',
                type: 'text',
                label: 'Venue Adı',
                description: 'Veri içinde geçen mekân adı. Bazı bileşenlerde gösterilir.',
                reapply: 'branding',
            },
        ],
    },

    /* ============================================================
     * Genel tema — renk paleti
     * ============================================================ */
    {
        id: 'palette',
        label: 'Renkler & Palet',
        icon: 'paint',
        description: 'Tüm uygulamayı etkileyen ana renk değişkenleri.',
        fields: [
            {
                path: 'theme.backgroundGradient',
                type: 'gradient3',
                label: 'Arkaplan Gradient',
                description: 'Yalnızca arkaplan yüzeyleri (başlangıç ekranı, island, loader). Kart/buton gölgelerini etkilemez.',
                reapply: 'theme',
                primaryScene: 'home-idle',
                selectors: ['body', '.initial-home', '#appLoader'],
            },
            {
                path: 'theme.accentColor',
                type: 'color',
                label: 'Vurgu Rengi (Accent)',
                description: 'Butonlar, aktif chip\'ler, focus efektleri, progress bar, ikonlar ve kart parlama vurguları.',
                hint: 'Ör. #4f46e5',
                reapply: 'theme',
                primaryScene: 'home-search',
                selectors: ['.category-card.active', '.isl-cat-card.active', '.accent'],
            },
            {
                path: 'theme.solidSurface',
                type: 'color',
                label: 'Solid Yüzey (Glass kapalıyken)',
                description: 'Cam efekti kapatıldığında kart/chip/input yüzey rengi. Kenarlık için ayrıca "Kart Kenarlığı" kullanın.',
                hint: 'Yalnızca "Cam Efekti Aktif" kapalıyken etkindir',
                reapply: 'theme',
                primaryScene: 'home-search',
                selectors: ['.search-tab', '.map-side-panel.island-layout', '.isl-search-field'],
            },
            {
                path: 'theme.cardBorder',
                type: 'color',
                label: 'Kart Kenarlığı',
                description: 'Kategori kartları, arama çubuğu ve panel kartlarının kenar çizgisi. Yüzey rengine çok yakınsa kartlar zeminden ayrılmaz — kontrastlı bir renk seçin.',
                hint: 'Açık yüzey: rgba(0,0,0,0.14) · Koyu cam: rgba(255,255,255,0.28)',
                reapply: 'theme',
                primaryScene: 'home-search',
                selectors: ['.category-card', '.home-search-trigger', '.search-tab', '.location-item', '.category-tab', '.inline-key'],
            },
            {
                path: 'theme.textPrimary',
                type: 'color',
                label: 'Ana Yazı Rengi',
                description: 'Kiosk başlıkları ve harita üstündeki bileşenlerde ana metin.',
                reapply: 'theme',
                primaryScene: 'home-idle',
                selectors: ['.home-title', '.isl-search-input', '.search-placeholder'],
            },
            {
                path: 'theme.textSecondary',
                type: 'color',
                label: 'İkincil Yazı',
                description: 'Alt başlık, yardımcı etiketler.',
                reapply: 'theme',
            },
            {
                path: 'theme.textMuted',
                type: 'color',
                label: 'Soluk Yazı',
                description: 'Placeholder, pasif etiketler.',
                reapply: 'theme',
            },
        ],
    },

    /* ============================================================
     * Cam efekti
     * ============================================================ */
    {
        id: 'glass',
        label: 'Cam (Glass) Efekti',
        icon: 'glass',
        description: 'Kiosk başlangıç, island ve paneller için frosted-glass görünümü. Kapatılırsa "Solid Yüzey" rengi devreye girer.',
        fields: [
            {
                path: 'theme.glassEnabled',
                type: 'toggle',
                label: 'Cam Efekti Aktif',
                description: 'Kapalı ⇒ tüm glass yüzeyler solid renkle çizilir.',
                reapply: 'theme',
                primaryScene: 'home-search',
            },
            {
                path: 'theme.glassBackground',
                type: 'color',
                label: 'Cam Arkaplan',
                description: 'Kiosk search panel ve island ana arkaplan rengi. Düşük alfa + blur ile cam hissi verir.',
                hint: 'Genelde rgba(255,255,255,0.12) civarı',
                reapply: 'theme',
                primaryScene: 'home-search',
                selectors: ['.search-tab', '.map-side-panel.island-layout'],
            },
            {
                path: 'theme.glassBorder',
                type: 'color',
                label: 'Cam Kenarlık',
                description: 'Island ve cam panellerin kenarlığı. Kart kenarlığı için "Kart Kenarlığı" alanını kullanın.',
                reapply: 'theme',
                primaryScene: 'home-search',
                selectors: ['.map-side-panel.island-layout', '.isl-search-field', '.isl-cat-card'],
            },
            {
                path: 'theme.glassBlur',
                type: 'cssLength',
                label: 'Cam Blur',
                description: 'backdrop-filter blur yoğunluğu. Yüksek değer = daha bulanık.',
                unit: 'px', min: 0, max: 60,
                reapply: 'theme',
                primaryScene: 'home-search',
            },
        ],
    },

    /* ============================================================
     * Navbar
     * ============================================================ */
    {
        id: 'navbar',
        label: 'Navbar (Üst Bar)',
        icon: 'nav',
        description: 'Kiosk/web modunda en üstteki bar. Mobilde görünmez.',
        fields: [
            {
                path: 'navbar.enabled',
                type: 'toggle', label: 'Navbar Aktif',
                description: 'Kapatılırsa üst bar tamamen gizlenir ve içerik yukarı kayar.',
                reapply: 'navbar',
                primaryScene: 'home-idle',
                selectors: ['.glass-navbar'],
            },
            { path: 'navbar.clock',        type: 'toggle', label: 'Saat',           reapply: 'navbar',
              description: 'Sol tarafta dijital saat.', primaryScene: 'home-idle', selectors: ['.nav-clock'] },
            { path: 'navbar.logo',         type: 'toggle', label: 'Logo',           reapply: 'navbar',
              primaryScene: 'home-idle', selectors: ['.nav-logo'] },
            { path: 'navbar.langSwitcher', type: 'toggle', label: 'Dil Seçici',     reapply: 'navbar',
              primaryScene: 'home-idle', selectors: ['.lang-switcher'] },
        ],
    },

    /* ============================================================
     * Kiosk başlangıç ekranı
     * ============================================================ */
    {
        id: 'home',
        label: 'Kiosk Ekranı',
        icon: 'home',
        description: 'Kiosk başlangıç ekranının içeriği ve kompozisyonu. Yalnızca kiosk görünümünde gösterilir.',
        fields: [
            { path: 'features.home.enabled',       type: 'toggle', label: 'Kiosk Başlangıç Modülü',
              description: 'Tamamen kapatılırsa kiosk direkt haritaya açılır.',
              requiresReload: true },
            { path: 'features.home.slideshow',     type: 'toggle', label: 'Slideshow (alt film şeridi)',
              requiresReload: true, primaryScene: 'home-idle', selectors: ['.home-mini-slideshow'] },
            { path: 'features.home.searchBar',     type: 'toggle', label: 'Arama Çubuğu',
              description: 'Ortadaki "Nereye gitmek istersiniz?" tetikleyicisi.',
              requiresReload: true, primaryScene: 'home-idle', selectors: ['.home-search-trigger'] },
            { path: 'features.home.categoryCards', type: 'toggle', label: 'Kategori Kartları',
              description: 'Kiosk ekranındaki Alışveriş / Yeme-İçme … kartları.',
              requiresReload: true, primaryScene: 'home-idle', selectors: ['.home-category-cards'] },
            { path: 'features.home.visibleCategories', type: 'categorySelect', label: 'Görünür Kategori Kartları',
              description: 'Yalnızca kiosk başlangıç ekranındaki kartları etkiler — mobil ızgara ve web island/panel etkilenmez. Kategoriler Sheets\'ten gelir; hepsi işaretliyse tümü gösterilir.',
              requiresReload: true, primaryScene: 'home-idle', selectors: ['.home-category-cards'] },
            { path: 'features.home.exploreMapBtn', type: 'toggle', label: 'Haritayı Keşfet Butonu',
              description: 'Kiosk ekranının alt kısmındaki CTA butonu.',
              requiresReload: true, primaryScene: 'home-idle', selectors: ['.explore-map-btn'] },
        ],
    },

    /* ============================================================
     * Search panel (home-search ekranı)
     * ============================================================ */
    {
        id: 'search',
        label: 'Arama Paneli',
        icon: 'search',
        description: 'Kiosk\'ta arama açıldığında görünen büyük panel.',
        fields: [
            { path: 'features.search.enabled',   type: 'toggle', label: 'Arama Modülü',
              requiresReload: true },
            { path: 'features.keyboard.enabled', type: 'toggle', label: 'Sanal Klavye',
              description: 'Arama açıkken alt kısımda çıkan klavye.',
              requiresReload: true, primaryScene: 'home-search', selectors: ['.virtual-keyboard'] },
            {
                path: 'features.keyboard.defaultLanguage',
                type: 'select', label: 'Klavye Başlangıç Dili',
                options: [
                    { value: 'tr', label: 'Türkçe' },
                    { value: 'en', label: 'English' },
                    { value: 'zh', label: '中文' },
                    { value: 'ar', label: 'العربية' },
                ],
                requiresReload: true,
                primaryScene: 'home-search',
            },
        ],
    },

    /* ============================================================
     * Side panel / island
     * ============================================================ */
    {
        id: 'sidepanel',
        label: 'Side Panel / Island',
        icon: 'panel',
        description: 'Harita üzerindeki detay ve arama bileşeninin şekli.',
        fields: [
            { path: 'features.sidePanel.enabled', type: 'toggle', label: 'Side Panel Modülü',
              requiresReload: true },
            {
                path: 'features.sidePanel.layout',
                type: 'select',
                label: 'Layout',
                description: '"Island" = küçük yüzen kart, "Panel" = tam boy yan panel.',
                options: [
                    { value: 'island', label: 'Island (yüzen)' },
                    { value: 'panel',  label: 'Panel (tam boy)' },
                ],
                requiresReload: true,
                primaryScene: 'map-default',
            },
            {
                path: 'features.sidePanel.defaultSide',
                type: 'select',
                label: 'Varsayılan Taraf',
                options: [
                    { value: 'right', label: 'Sağ' },
                    { value: 'left',  label: 'Sol' },
                ],
                reapply: 'island',
                primaryScene: 'map-default',
                selectors: ['#mapSidePanel'],
            },
            {
                path: 'features.sidePanel.island.position',
                type: 'select',
                label: 'Island Pozisyonu',
                description: 'Island layout\'ta haritanın hangi köşesinde yer alır.',
                options: [
                    { value: 'top-left',     label: 'Sol Üst' },
                    { value: 'top-right',    label: 'Sağ Üst' },
                    { value: 'bottom-left',  label: 'Sol Alt' },
                    { value: 'bottom-right', label: 'Sağ Alt' },
                ],
                reapply: 'island',
                primaryScene: 'map-default',
                selectors: ['#mapSidePanel.island-layout'],
            },
            { path: 'features.sidePanel.island.width', type: 'slider', label: 'Island Genişliği',
              description: 'Island kartının piksel genişliği.',
              min: 320, max: 720, step: 10, unit: 'px',
              reapply: 'island', primaryScene: 'map-default', selectors: ['.map-side-panel.island-layout'] },
            { path: 'features.sidePanel.island.compactVisibleRows', type: 'number', label: 'Kompakt Görünür Satır',
              description: 'Island ilk açıldığında (home modu) yüksekliği kaç satır kategori kartını gösterecek kadar olsun. Daha fazla kategori varsa kullanıcı aşağı kaydırarak görür.',
              hint: 'Ör. 3 = island yüksekliği ~3 satıra göre ayarlanır. Arama açılınca island zaten genişler.',
              min: 1, max: 6, reapply: 'island', primaryScene: 'map-default',
              selectors: ['.map-side-panel.island-layout.island-compact'] },
            { path: 'features.sidePanel.island.margin', type: 'slider', label: 'Kenar Boşluğu',
              description: 'Island\'ın ekran kenarından uzaklığı.',
              min: 0, max: 60, unit: 'px', reapply: 'island', primaryScene: 'map-default' },
            { path: 'features.sidePanel.island.borderRadius', type: 'slider', label: 'Köşe Yuvarlaklığı',
              min: 0, max: 40, unit: 'px', reapply: 'island', primaryScene: 'map-default',
              selectors: ['.map-side-panel.island-layout'] },
        ],
    },

    /* ============================================================
     * Harita — kamera & görüntü
     * ============================================================ */
    {
        id: 'map-camera',
        label: 'Harita — Kamera',
        icon: 'map',
        description: 'Açılıştaki bakış açısı ve kamera ayarları.',
        fields: [
            { path: 'features.map.enabled', type: 'toggle', label: 'Harita Modülü', requiresReload: true },
            { path: 'features.map.pitch',   type: 'slider', label: 'Pitch (eğim)',
              description: '0 = yukardan bakış, 85 = yataya yakın.',
              min: 0, max: 85, step: 1, requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.bearing', type: 'slider', label: 'Bearing (dönüş)',
              min: -180, max: 180, step: 1, requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.zoom',    type: 'slider', label: 'Başlangıç Zoom',
              min: 12, max: 22, step: 0.5, requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.tileOpacity',    type: 'slider', label: 'Tile Opacity',
              description: 'Alttaki harita baz katmanının opaklığı.',
              min: 0, max: 1, step: 0.05, requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.overlayOpacity', type: 'slider', label: 'Overlay Opacity',
              description: 'Harita üstü overlay opaklığı (building/path vb.).',
              min: 0, max: 1, step: 0.05, requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.shrinkFactor',   type: 'slider', label: 'Shrink Factor',
              description: 'Poligonların iç kenardan biraz küçültülmesi. 0.99 etrafında.',
              min: 0.9, max: 1, step: 0.005, requiresReload: true, primaryScene: 'map-default' },
            {
                path: 'features.map.roomRenderMode',
                type: 'select', label: 'Birim Görünümü',
                description: '"Dolu" birimleri dolu blok olarak yükseltir. "Duvar" (Pointr tarzı) sadece çevre duvarını yükseltir, içeride zemin renkli kalır.',
                options: [
                    { value: 'solid', label: 'Dolu Blok' },
                    { value: 'walls', label: 'Duvar (Pointr tarzı)' },
                ],
                requiresReload: true, primaryScene: 'map-default',
            },
            { path: 'features.map.wallThickness',  type: 'slider', label: 'Duvar Kalınlığı (m)',
              description: 'Yalnızca "Duvar" modunda. Çevre duvar bandının metre cinsinden kalınlığı.',
              min: 0.2, max: 3, step: 0.1, requiresReload: true, primaryScene: 'map-default' },
            {
                path: 'features.map.wallColorMode',
                type: 'select', label: 'Duvar Rengi Kaynağı',
                description: 'Yalnızca "Duvar" modunda. "Birim Renginden" her duvarı kategori rengiyle boyar; "Sabit Renk" aşağıdaki tek rengi kullanır (zemin yine birim rengini korur).',
                options: [
                    { value: 'unit',  label: 'Birim Renginden' },
                    { value: 'fixed', label: 'Sabit Renk' },
                ],
                requiresReload: true, primaryScene: 'map-default',
            },
            { path: 'features.map.wallColor', type: 'color', label: 'Duvar Rengi (Sabit)',
              description: 'Yalnızca "Duvar" modu + "Sabit Renk" seçiliyken kullanılır.',
              requiresReload: true, primaryScene: 'map-default' },
            {
                path: 'features.map.showOtherFloorOutlines',
                type: 'toggle',
                label: 'Diğer Kat Plan Çizgileri',
                description: 'Kapalıyken yalnızca seçili kat görünür; üst üste hizalanmış çoklu kat projelerinde alt katların plan çizgileri üst kata taşmaz. Açıkken diğer katların zemin/koridor konturları soluk kesik çizgi olarak gösterilir.',
                reapply: 'map-floors',
                primaryScene: 'map-default',
            },
        ],
    },

    /* Harita — Katman Renkleri grubu kaldırıldı:
     * birim renkleri artık Categories sekmesinden (Sheets) gelir;
     * geri kalan zemin sublayer renkleri (water/walking/building/…)
     * `features.map.sublayerColors` üzerinden hâlâ override edilebilir,
     * ama editor UI'sinde bu detay seviyesine artık gerek yok. */

    /* ============================================================
     * Harita — etkileşim
     * ============================================================ */
    {
        id: 'map-interaction',
        label: 'Harita — Etkileşim',
        icon: 'target',
        description: 'Hover / seçim / fly-to davranışı.',
        fields: [
            { path: 'features.map.interaction.hoverColor',      type: 'color',  label: 'Hover Rengi',       requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.interaction.selectedColor',   type: 'color',  label: 'Seçili Rengi',      requiresReload: true, primaryScene: 'map-location' },
            { path: 'features.map.interaction.routeStartColor', type: 'color',  label: 'Rota Başlangıç',    requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.interaction.routeEndColor',   type: 'color',  label: 'Rota Hedef',        requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.interaction.flyToDuration',   type: 'slider', label: 'Fly-to Süresi',
              hint: 'ms', min: 0, max: 3000, step: 50, requiresReload: true, primaryScene: 'map-location' },
            { path: 'features.map.interaction.flyToMaxZoom',    type: 'slider', label: 'Fly-to Max Zoom',
              min: 15, max: 22, step: 0.5, requiresReload: true, primaryScene: 'map-location' },
            { path: 'features.map.interaction.flyToPadding',    type: 'slider', label: 'Fly-to Padding',
              min: 0, max: 300, step: 10, requiresReload: true, primaryScene: 'map-location' },
            { path: 'features.map.disabledUnits.colored', type: 'toggle', label: 'Devre dışı birimleri göster',
              description: 'Kapalı: devre dışı birimler tamamen görünmez. Açık: belirtilen renkte düz blok olarak gösterilir (örn. kapalı mağazalar).',
              requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.disabledUnits.color', type: 'color', label: 'Devre dışı rengi',
              requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.disabledUnits.showLabel', type: 'toggle', label: 'Devre dışı başlığını göster',
              description: 'Yalnızca "Devre dışı birimleri göster" açıkken geçerlidir.',
              requiresReload: true, primaryScene: 'map-default' },
        ],
    },

    /* ============================================================
     * Harita — etiketler
     * ============================================================ */
    {
        id: 'map-labels',
        label: 'Harita — Etiketler',
        icon: 'label',
        description: 'POI etiket yazılarının stil ve yerleşimi.',
        fields: [
            { path: 'features.map.labels.textColor',        type: 'color',  label: 'Yazı Rengi',        requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.labels.haloColor',        type: 'color',  label: 'Halo Rengi',        requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.labels.collisionEnabled', type: 'toggle', label: 'Çarpışma Kontrolü', requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.map.labels.normalization',    type: 'toggle', label: 'İsim Normalizasyonu', requiresReload: true, primaryScene: 'map-default' },
            {
                path: 'features.map.labels.pitchAlignment',
                type: 'select', label: 'Pitch Hizalama',
                description: '"Viewport" = kamaraya dönük yazı, "Map" = yere yatmış yazı.',
                options: [
                    { value: 'viewport', label: 'Viewport' },
                    { value: 'map',      label: 'Map' },
                ],
                requiresReload: true, primaryScene: 'map-default',
            },
        ],
    },

    /* ============================================================
     * Harita — rota çizimi
     * ============================================================ */
    {
        id: 'map-route',
        label: 'Rota Çizimi',
        icon: 'route',
        description: 'Başlangıç-hedef rotasının harita üzerinde görünümü.',
        fields: [
            { path: 'features.map.route.color',        type: 'color', label: 'Rota Rengi',     requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.glowColor',    type: 'color', label: 'Glow Rengi',     requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.glowOpacity',  type: 'slider', label: 'Glow Opacity',  min: 0, max: 1, step: 0.05, requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.outlineColor', type: 'color', label: 'Kenarlık Rengi', requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.width',        type: 'slider', label: 'Çizgi Kalınlığı',
              hint: '× çarpan', min: 0.2, max: 4, step: 0.1, requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.animateDraw',  type: 'toggle', label: 'Çizim Animasyonu', requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.drawDuration', type: 'slider', label: 'Çizim Süresi (ms)',
              min: 0, max: 5000, step: 100, requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.arrows.enabled',  type: 'toggle', label: 'Akış İşaretçileri',      requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.arrows.animated', type: 'toggle', label: 'Animasyonlu (ilerlesin)', requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.arrows.iconUrl',  type: 'text',   label: 'Özel İkon (URL / yol)',
              description: 'Çizgi boyunca ilerleyen işaretçi için özel ikon. Boş bırakılırsa varsayılan yön oku kullanılır. PNG/SVG yolu, URL veya data-URL.',
              placeholder: 'assets/route-marker.png', requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.arrows.rotateWithPath', type: 'toggle', label: 'Yöne Göre Döndür',
              description: 'Açık: ikon ilerleme yönüne döner (oklar için). Kapalı: simetrik ikonlar (nokta, logo) için sabit kalır.',
              requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.arrows.size',     type: 'slider', label: 'İkon Boyutu',            min: 0.2, max: 3, step: 0.1, requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.arrows.count',    type: 'number', label: 'İşaretçi Sayısı',        min: 1, max: 20, requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.arrows.speed',    type: 'slider', label: 'Akış Hızı',              min: 0, max: 0.2, step: 0.005, requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.arrows.color',    type: 'color',  label: 'İkon Rengi',
              description: 'Varsayılan oka ve "currentColor" kullanan SVG ikonlara (ör. Iconify) uygulanır. Renkleri gömülü olan PNG/SVG\'ler etkilenmez.',
              requiresReload: true, primaryScene: 'map-route' },
            { path: 'features.map.route.arrows.opacity',  type: 'slider', label: 'Opaklık',                min: 0, max: 1, step: 0.05, requiresReload: true, primaryScene: 'map-route' },
        ],
    },

    /* ============================================================
     * Navigasyon akışı
     * ============================================================ */
    {
        id: 'navigation',
        label: 'Navigasyon Akışı',
        icon: 'nav',
        description: 'Rota kurgusu ve başlangıç noktası davranışı.',
        fields: [
            {
                path: 'features.navigation.enabled',
                type: 'toggle', label: 'Navigasyon Modülü',
                requiresReload: true,
            },
            {
                path: 'features.navigation.startPointMode',
                type: 'select',
                label: 'Başlangıç Noktası Modu',
                description: '"Auto" = her zaman kiosk konumu. "Manual" = kullanıcı seçer.',
                options: [
                    { value: 'auto',   label: 'Auto (Kiosk konumu)' },
                    { value: 'manual', label: 'Manual (kullanıcı seçer)' },
                ],
                requiresReload: true,
                primaryScene: 'map-default',
            },
            { path: 'features.navigation.qrBaseUrl', type: 'text', label: 'QR Base URL',
              description: 'Rotayı telefona göndermek için QR\'da kullanılan base URL.',
              placeholder: 'https://…/route' },
            { path: 'features.navigation.droppedPin.enabled',    type: 'toggle', label: 'Pin Bırakma Modu',
              description: 'Kullanıcı haritaya pin bırakarak başlangıç/hedef seçebilir.', requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.navigation.droppedPin.pinColor',    type: 'color',  label: 'Pin Rengi',    requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.navigation.droppedPin.cursorColor', type: 'color',  label: 'İmleç Rengi',  requiresReload: true, primaryScene: 'map-default' },
            { path: 'features.navigation.droppedPin.snapToPath',  type: 'toggle', label: 'Path\'e Snap', requiresReload: true, primaryScene: 'map-default' },
        ],
    },

    /* ============================================================
     * Mobile — bottom sheet
     * ============================================================ */
    {
        id: 'mobile',
        label: 'Mobil — Alt Sayfa (Bottom Sheet)',
        icon: 'phone',
        description: 'Telefon görünümündeki bottom sheet\'in teması ve tipografisi.',
        fields: [
            { path: 'theme.mobile.sheetBackground',   type: 'color', label: 'Sheet Arkaplanı',   reapply: 'theme', primaryScene: 'mobile-home' },
            { path: 'theme.mobile.sheetShadow',       type: 'color', label: 'Sheet Gölgesi',     reapply: 'theme', primaryScene: 'mobile-home' },
            { path: 'theme.mobile.cardBackground',    type: 'color', label: 'Kart Arkaplanı',    reapply: 'theme', primaryScene: 'mobile-home' },
            { path: 'theme.mobile.cardBorder',        type: 'color', label: 'Kart Kenarlığı',    reapply: 'theme', primaryScene: 'mobile-home' },
            { path: 'theme.mobile.surfaceBackground', type: 'color', label: 'Yüzey Arkaplanı',   reapply: 'theme', primaryScene: 'mobile-home' },
            { path: 'theme.mobile.textPrimary',       type: 'color', label: 'Ana Yazı',          reapply: 'theme', primaryScene: 'mobile-home' },
            { path: 'theme.mobile.textSecondary',     type: 'color', label: 'İkincil Yazı',      reapply: 'theme', primaryScene: 'mobile-home' },
            { path: 'theme.mobile.textMuted',         type: 'color', label: 'Soluk Yazı',        reapply: 'theme', primaryScene: 'mobile-home' },
            { path: 'theme.mobile.dangerBackground',  type: 'color', label: 'Tehlike Arkaplan',  reapply: 'theme', primaryScene: 'mobile-route' },
            { path: 'theme.mobile.dangerColor',       type: 'color', label: 'Tehlike Renk',      reapply: 'theme', primaryScene: 'mobile-route' },
        ],
    },

    {
        id: 'mobile-grid',
        label: 'Mobil — Kategori Izgarası',
        icon: 'grid',
        description: 'Mobil home ekranındaki kategori kartlarının satır düzeni.',
        fields: [
            {
                path: 'theme.mobile.categoryGrid.defaultColumns',
                type: 'number',
                label: 'Varsayılan Kolon Sayısı',
                description: 'Satırlar için özel sayı belirtilmediyse kaç kolon.',
                min: 1, max: 6,
                requiresReload: true,
                primaryScene: 'mobile-home',
            },
            {
                path: 'theme.mobile.categoryGrid.rows',
                type: 'numberArray',
                label: 'Satır Kolonları',
                description: 'Virgülle ayrılmış satır tanımı. Ör. "1,2,3" = ilk satır 1 full-width, ikinci 2, üçüncü 3 kolon.',
                hint: 'Örn. 1, 2, 3',
                requiresReload: true,
                primaryScene: 'mobile-home',
            },
        ],
    },

    /* ============================================================
     * Kiosk Dikey (Portrait)
     * ============================================================ */
    {
        id: 'kiosk-portrait',
        label: 'Kiosk Dikey',
        icon: 'panel',
        description: 'Dikey kiosk (1080×1920) için home ekranı, search-tab ve sağ rail ince ayarları. Tüm overlay\'ler ekranın orta-üst alanına yerleştirilmiştir ve ayakta okunabilir mesafede kalır.',
        fields: [
            {
                path: 'theme.kioskPortrait.logoTopOffset',
                type: 'slider',
                label: 'Logo Dikey Konum',
                description: 'Logonun ekran merkezine göre dikey ofseti (negatif = yukarı).',
                min: -800, max: -200, step: 10, unit: 'px',
                reapply: 'kioskPortrait',
                primaryScene: 'home-idle',
                devices: ['kiosk-portrait'],
                selectors: ['.initial-home .home-logo'],
            },
            {
                path: 'theme.kioskPortrait.searchTopOffset',
                type: 'slider',
                label: 'Arama Çubuğu Dikey Konum',
                description: 'Arama trigger pill\'inin ekran merkezine göre dikey ofseti.',
                min: -500, max: 100, step: 10, unit: 'px',
                reapply: 'kioskPortrait',
                primaryScene: 'home-idle',
                devices: ['kiosk-portrait'],
                selectors: ['.initial-home .home-search-trigger'],
            },
            {
                path: 'theme.kioskPortrait.cardsTopOffset',
                type: 'slider',
                label: 'Kategori Kartları Dikey Konum',
                description: 'Kategori kart sırasının ekran merkezine göre dikey ofseti.',
                min: -200, max: 400, step: 10, unit: 'px',
                reapply: 'kioskPortrait',
                primaryScene: 'home-idle',
                devices: ['kiosk-portrait'],
                selectors: ['.initial-home .home-category-cards'],
            },
            {
                path: 'theme.kioskPortrait.exploreTopOffset',
                type: 'slider',
                label: '"Haritayı Keşfet" Dikey Konum',
                description: 'Alt CTA butonunun ekran merkezine göre dikey ofseti.',
                min: 100, max: 800, step: 10, unit: 'px',
                reapply: 'kioskPortrait',
                primaryScene: 'home-idle',
                devices: ['kiosk-portrait'],
                selectors: ['.initial-home .explore-map-btn'],
            },
            {
                path: 'theme.kioskPortrait.searchTabTopOffset',
                type: 'slider',
                label: 'Arama Paneli Üst Konum',
                description: 'Search-tab\'in açıldığında ekran merkezine göre üst kenarı. Daha negatif → daha yukarı.',
                min: -880, max: -200, step: 10, unit: 'px',
                reapply: 'kioskPortrait',
                primaryScene: 'home-search',
                devices: ['kiosk-portrait'],
                selectors: ['.search-tab'],
            },
            {
                path: 'theme.kioskPortrait.searchListMaxRows',
                type: 'slider',
                label: 'Görünür Sonuç Sırası',
                description: 'Arama sonuç listesinde tek seferde görünen kart sıra sayısı. Diğerleri scroll edilir.',
                min: 2, max: 5, step: 1,
                reapply: 'kioskPortrait',
                primaryScene: 'home-search',
                devices: ['kiosk-portrait'],
                selectors: ['.search-tab .tab-results-container'],
            },
            {
                path: 'theme.kioskPortrait.edgePadding',
                type: 'slider',
                label: 'Kenar Boşluğu',
                description: 'Rail\'in ekran kenarından uzaklığı.',
                min: 8, max: 64, step: 2, unit: 'px',
                reapply: 'kioskPortrait',
                primaryScene: 'map-default',
                devices: ['kiosk-portrait'],
            },
            {
                path: 'theme.kioskPortrait.railWidth',
                type: 'slider',
                label: 'Rail Genişliği',
                min: 64, max: 120, step: 2, unit: 'px',
                reapply: 'kioskPortrait',
                primaryScene: 'map-default',
                devices: ['kiosk-portrait'],
                selectors: ['#kpRail'],
            },
        ],
    },

    /* ============================================================
     * Modüller (ileri seviye on/off)
     * ============================================================ */
    {
        id: 'modules',
        label: 'Modüller (Aç / Kapa)',
        icon: 'toggle',
        description: 'Uygulamanın büyük parçalarını devre dışı bırakma. Değişiklik önizleme reload\'ı gerektirir.',
        fields: [
            { path: 'features.data.enabled',          type: 'toggle', label: 'Data',            requiresReload: true },
            { path: 'features.models3d.enabled',      type: 'toggle', label: '3D Modeller',     reapply: 'models3d' },
            { path: 'features.floorSelector.enabled', type: 'toggle', label: 'Kat Seçici',      requiresReload: true },
            { path: 'features.clock.enabled',         type: 'toggle', label: 'Saat',            requiresReload: true },
            { path: 'features.storeDetail.enabled',   type: 'toggle', label: 'Mağaza Detay',    requiresReload: true },
            { path: 'features.messaging.enabled',     type: 'toggle', label: 'Mesajlaşma',      requiresReload: true },
            { path: 'features.assistant.enabled',     type: 'toggle', label: 'Chatbot Asistan (Mobil)',
              description: 'Mobil bottom sheet\'teki sesli/yazılı asistan paneli ve arama satırındaki toggle butonu.',
              requiresReload: true, primaryScene: 'mobile-home' },
            { path: 'features.assistant.voice',       type: 'toggle', label: 'Asistan Ses (TTS + Mikrofon)',
              description: 'Asistanın sesli yanıt vermesi ve mikrofonla komut alması.',
              requiresReload: true },
        ],
    },

    /* "Veri Kaynağı" grubu Harita sekmesine taşındı — orada
     * (map-builder/data-source.js) Sheets bağlantısını test eden,
     * canlı önizlemesi olan bir form göstereceğiz. */
];

/* ============================================================
 * Interface scope
 * ============================================================
 * Settings are applied *globally* across every interface (web / kiosk /
 * kiosk-portrait / mobile) so a venue stays visually consistent. The map
 * below records the known *structural divergences*: groups that only affect
 * a subset of interfaces. `global` (or an absent entry) means the group
 * applies everywhere. This drives the editor scope badges and the
 * selective-export filter.
 */

export const ALL_INTERFACES = ['web', 'kiosk', 'kiosk-portrait', 'mobile'];

export const INTERFACE_LABELS = {
    web: 'Web',
    kiosk: 'Kiosk',
    'kiosk-portrait': 'Kiosk Dikey',
    mobile: 'Mobil',
};

const GROUP_SCOPES = {
    general:        'global',
    branding:       'global',
    palette:        'global',
    glass:          'global',
    navbar:         ['kiosk', 'kiosk-portrait'],
    home:           ['kiosk', 'kiosk-portrait'],
    search:         ['web', 'kiosk', 'kiosk-portrait'],
    sidepanel:      ['web', 'kiosk', 'kiosk-portrait'],
    'map-camera':   'global',
    'map-interaction': 'global',
    'map-labels':   'global',
    'map-route':    'global',
    navigation:     'global',
    mobile:         ['mobile'],
    'mobile-grid':  ['mobile'],
    'kiosk-portrait': ['kiosk-portrait'],
    modules:        'global',
};

/** Raw scope for a group: the string 'global' or an array of interface ids. */
export function getGroupScope(groupId) {
    return GROUP_SCOPES[groupId] || 'global';
}

/** Normalised interface list a group applies to (global ⇒ every interface). */
export function groupScopeInterfaces(groupId) {
    const s = getGroupScope(groupId);
    return s === 'global' ? ALL_INTERFACES.slice() : s.slice();
}

/** True if a group is relevant to at least one of the selected interfaces. */
export function groupAppliesToAny(groupId, selected) {
    if (getGroupScope(groupId) === 'global') return true;
    const set = new Set(selected || []);
    return groupScopeInterfaces(groupId).some(i => set.has(i));
}

/* ============================================================
 * Indexes & helpers
 * ============================================================ */

let _byPath = null;
function indexByPath() {
    if (_byPath) return _byPath;
    _byPath = new Map();
    for (const group of schema) {
        for (const f of (group.fields || [])) {
            _byPath.set(f.path, { ...f, groupId: group.id, groupLabel: group.label });
        }
    }
    return _byPath;
}

/** Flat list of every field (each includes groupId / groupLabel). */
export function getAllFields() {
    return [...indexByPath().values()];
}

/** Lookup a field by its dot-path. */
export function getFieldByPath(path) {
    return indexByPath().get(path) || null;
}

/** True if any of the paths in the set require a full iframe reload. */
export function changeRequiresReload(paths) {
    const idx = indexByPath();
    for (const p of paths) {
        if (idx.get(p)?.requiresReload) return true;
    }
    return false;
}

/** Whether a field affects a given device (all | kiosk | kiosk-portrait | web | mobile). */
export function fieldVisibleForDevice(field, device) {
    // Device-tagged fields opt in/out explicitly via field.devices.
    if (Array.isArray(field.devices) && field.devices.length) {
        return field.devices.includes(device);
    }
    const scenes = [field.primaryScene, ...(field.scenes || [])].filter(Boolean);
    if (!scenes.length) return true;    // no scene info ⇒ consider global
    // fields whose primaryScene starts with 'mobile-' are mobile-only.
    if (device === 'mobile') {
        return scenes.some(s => s.startsWith('mobile-'));
    }
    return scenes.some(s => !s.startsWith('mobile-'));
}
