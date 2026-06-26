/**
 * Renders the static skeleton of the Map Builder tab.
 *
 * Layout:
 *   ┌────────────────────────┬────────────────────────────────────────────┐
 *   │  sidebar (controls)    │  content area: Original | Processed | …    │
 *   │   - Upload SVG         │  (managed by upload.js / process.js / …)   │
 *   │   - 3D heights         │                                            │
 *   │   - Advanced (lat/lng) │                                            │
 *   │   - Labels             │                                            │
 *   │   - Icons              │                                            │
 *   └────────────────────────┴────────────────────────────────────────────┘
 *
 * Each module wires its events to the IDs declared here.
 */

const HTML = `
<div class="ed-mb-grid">
  <aside class="ed-mb-sidebar">

    <section class="ed-mb-section ed-mb-section-data" id="mbSection-data">
      <header class="ed-mb-section-head">
        <span class="ed-mb-section-title">Veri Kaynağı</span>
        <button type="button" class="ed-mb-icon-btn" id="mbDataTest" title="Bağlantıyı test et" aria-label="Bağlantıyı test et">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
        </button>
      </header>
      <div class="ed-mb-data-form">
        <label class="ed-mb-field">
          <span>Kaynak</span>
          <select id="mbDataSource">
            <option value="sheets">Google Sheets</option>
            <option value="api">API</option>
          </select>
        </label>

        <div class="ed-mb-data-group">
          <span class="ed-mb-field-group-label">Google Sheets</span>
          <div class="ed-mb-data-sheets" id="mbDataSheets">
            <label class="ed-mb-field">
              <span>Sheet ID
                <a class="ed-mb-field-hint" href="https://docs.google.com/spreadsheets" target="_blank" rel="noopener">aç ↗</a>
              </span>
              <input type="text" id="mbDataSheetId" placeholder="1abcDEF…" autocomplete="off" spellcheck="false">
            </label>
            <div class="ed-mb-data-tabs-grid">
              <label class="ed-mb-field">
                <span>Birim Listesi</span>
                <input type="text" id="mbDataTabList" placeholder="Zorlu_List" autocomplete="off">
              </label>
              <label class="ed-mb-field">
                <span>Kategoriler</span>
                <input type="text" id="mbDataTabCategories" placeholder="Zorlu_Categories" autocomplete="off">
              </label>
              <label class="ed-mb-field">
                <span>Info (opsiyonel)</span>
                <input type="text" id="mbDataTabInfo" placeholder="Info" autocomplete="off">
              </label>
              <label class="ed-mb-field">
                <span>GID (legacy)</span>
                <input type="text" id="mbDataGid" placeholder="0" autocomplete="off">
              </label>
            </div>
            <label class="ed-mb-field">
              <span>Yazma Endpoint (Apps Script)</span>
              <input type="text" id="mbDataWriteEndpoint" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" spellcheck="false">
            </label>
          </div>
        </div>

        <div class="ed-mb-data-group">
          <span class="ed-mb-field-group-label">API</span>
          <div class="ed-mb-data-api" id="mbDataApi">
            <label class="ed-mb-field">
              <span>Birim Listesi URL</span>
              <input type="text" id="mbDataApiBase" placeholder="https://api.inmapper.com/zorlu-center" autocomplete="off" spellcheck="false">
            </label>
            <p class="ed-mb-data-hint">Kaynak = API seçildiğinde birimler bu URL'den JSON olarak çekilir. Sheets ayarları yedek / düzenleme için kalır.</p>
          </div>
        </div>

        <label class="ed-mb-field">
          <span>GeoJSON Yolu (production)</span>
          <input type="text" id="mbDataGeojson" placeholder="assets/terminal.geojson" autocomplete="off">
        </label>

        <div class="ed-mb-data-routing">
          <span class="ed-mb-field-group-label">Rota API</span>
          <label class="ed-mb-field">
            <span>Venue (API)</span>
            <input type="text" id="mbDataRoutingVenue" placeholder="zorlu" autocomplete="off" spellcheck="false">
          </label>
          <label class="ed-mb-field">
            <span>Rota Hesaplama URL</span>
            <input type="text" id="mbDataRoutingRouteUrl" placeholder="http://localhost:5002/api/route" autocomplete="off" spellcheck="false">
          </label>
          <label class="ed-mb-field">
            <span>Aşamalı Tarif URL</span>
            <input type="text" id="mbDataRoutingDescribeUrl" placeholder="http://localhost:5002/api/describe" autocomplete="off" spellcheck="false">
          </label>
          <label class="ed-mb-field">
            <span>Tarif Motoru</span>
            <select id="mbDataRoutingDescEngine">
              <option value="ml">ML insan tarifi (API)</option>
              <option value="metric">Metrik tarif (plugin)</option>
            </select>
          </label>
          <p class="ed-mb-field-hint" id="mbDataRoutingDescEngineHint"></p>
        </div>

        <div class="ed-mb-data-status" id="mbDataStatus" hidden></div>
      </div>
    </section>

    <section class="ed-mb-section" id="mbSection-floors">
      <header class="ed-mb-section-head">
        <span class="ed-mb-section-title">Katlar</span>
        <button type="button" class="ed-mb-icon-btn" id="mbFloorAdd" title="Yeni kat ekle" aria-label="Kat ekle">+</button>
      </header>
      <div class="ed-mb-floor-list" id="mbFloorList"></div>
      <div class="ed-mb-floor-hint">Bir katı seçin · İsme çift tıklayarak yeniden adlandırın · Sürükle-bırak ile sıralayın</div>
      <div class="ed-mb-floor-hint" style="color: var(--ed-accent); margin-top:4px;">Hizalama varsayılan olarak tüm katlarla paylaşılır. Üst katların oturmadığı durumlarda Hizala sekmesinden o kat için özel hizalama açabilirsiniz.</div>
    </section>

    <section class="ed-mb-section" id="mbSection-upload">
      <header class="ed-mb-section-head">
        <span class="ed-mb-section-title">SVG Yükle <span class="ed-mb-floor-tag" id="mbActiveFloorTag"></span></span>
      </header>
      <div class="ed-mb-upload" id="mbUploadArea">
        <div class="ed-mb-upload-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div class="ed-mb-upload-text">
          <strong>.svg</strong> dosyasını sürükleyin<br>veya tıklayıp seçin
        </div>
        <div class="ed-mb-upload-name" id="mbUploadName"></div>
        <input type="file" id="mbUploadInput" accept=".svg" hidden>
      </div>
      <div class="ed-mb-stats" id="mbStats" hidden></div>
    </section>

    <section class="ed-mb-section" id="mbSection-process">
      <header class="ed-mb-section-head">
        <span class="ed-mb-section-title">Dönüştürme <span class="ed-mb-floor-tag" id="mbProcessScopeTag" title="Bu parametrelerin hangi katları etkilediğini gösterir">tüm katlar</span></span>
      </header>
      <div class="ed-mb-collapsible" id="mbAdvanced">
        <div class="ed-mb-row">
          <label>Center Lat
            <input type="number" id="mbCenterLat" step="0.000001" value="0">
          </label>
          <label>Center Lng
            <input type="number" id="mbCenterLng" step="0.000001" value="0">
          </label>
        </div>
        <div class="ed-mb-row">
          <label>Scale (m/SVG)
            <input type="number" id="mbScale" step="0.001" min="0.001" value="0.03">
          </label>
          <label>Rotation (°)
            <input type="number" id="mbRotation" step="1" value="0">
          </label>
        </div>
      </div>
      <button type="button" class="ed-mb-btn ed-mb-btn-primary" id="mbProcessBtn" disabled>
        SVG'yi İşle
      </button>
      <div class="ed-mb-floor-hint">İşlendiğinde önizleme otomatik güncellenir.</div>
    </section>

    <section class="ed-mb-section" id="mbSection-heights" hidden>
      <header class="ed-mb-section-head">
        <span class="ed-mb-section-title">3D Yükseklikler</span>
      </header>
      <div class="ed-mb-mode-toggle">
        <button type="button" class="ed-mb-mode is-active" data-mode="auto">Auto (uniform)</button>
        <button type="button" class="ed-mb-mode" data-mode="manual">Manuel</button>
      </div>
      <div id="mbHeightAuto">
        <label class="ed-mb-slider-row">
          <span>Genel yükseklik <em id="mbHeightVal">0.1×</em></span>
          <input type="range" id="mbHeightScale" min="0" max="30" value="1" step="1">
        </label>
      </div>
      <div id="mbHeightManual" hidden>
        <div class="ed-mb-height-grid" id="mbHeightGrid"></div>
      </div>
    </section>

    <section class="ed-mb-section" id="mbSection-render" hidden>
      <header class="ed-mb-section-head">
        <span class="ed-mb-section-title">Birim Görünümü</span>
      </header>
      <div class="ed-mb-mode-toggle">
        <button type="button" class="ed-mb-mode is-active" data-rendermode="solid">Dolu Blok</button>
        <button type="button" class="ed-mb-mode" data-rendermode="walls">Duvar (Pointr)</button>
      </div>
      <div id="mbWallOpts" hidden>
        <label class="ed-mb-slider-row">
          <span>Duvar kalınlığı <em id="mbWallThickVal">0.6 m</em></span>
          <input type="range" id="mbWallThick" min="2" max="30" value="6" step="1">
        </label>
        <label class="ed-mb-slider-row">
          <span>Birimler arası boşluk <em id="mbWallGapVal">0.15 m</em></span>
          <input type="range" id="mbWallGap" min="0" max="20" value="3" step="1">
        </label>
        <div class="ed-mb-mode-toggle" id="mbDoorGapToggle">
          <button type="button" class="ed-mb-mode is-active" data-doorgap="on">Kapı Boşluğu</button>
          <button type="button" class="ed-mb-mode" data-doorgap="off">Düz Duvar</button>
        </div>
        <label class="ed-mb-slider-row" id="mbDoorGapRow">
          <span>Kapı boşluğu genişliği <em id="mbDoorGapVal">1.2 m</em></span>
          <input type="range" id="mbDoorGapWidth" min="6" max="40" value="12" step="1">
        </label>
        <div class="ed-mb-mode-toggle" id="mbDoorGapModeToggle">
          <button type="button" class="ed-mb-mode is-active" data-doorgapmode="doors" title="Kapının bağlı olduğu path'in duvarı kestiği yere boşluk açılır">Kapılara Göre</button>
          <button type="button" class="ed-mb-mode" data-doorgapmode="paths" title="Kapı gözetmeksizin tüm path'lerin duvarı kestiği her yere boşluk açılır">Tüm Path Kesişimleri</button>
        </div>
        <div class="ed-mb-mode-toggle">
          <button type="button" class="ed-mb-mode is-active" data-wallcolor="unit">Birim Rengi</button>
          <button type="button" class="ed-mb-mode" data-wallcolor="fixed">Sabit Renk</button>
        </div>
        <label class="ed-mb-slider-row" id="mbWallColorRow" hidden>
          <span>Sabit duvar rengi</span>
          <input type="color" id="mbWallColor" value="#d9d3d2">
        </label>
      </div>
    </section>

    <section class="ed-mb-section" id="mbSection-labels" hidden>
      <header class="ed-mb-section-head">
        <span class="ed-mb-section-title">Etiket Boyutları</span>
      </header>
      <div class="ed-mb-norm">
        <div class="ed-mb-mode-toggle" id="mbLabelNormToggle">
          <button type="button" class="ed-mb-mode is-active" data-norm="on">Normalizasyon</button>
          <button type="button" class="ed-mb-mode" data-norm="off">Hep Görünür</button>
        </div>
        <div id="mbLabelNormOpts">
          <p class="ed-mb-hint">Her etiket boyutu, seçilen zoom seviyesinden itibaren görünür olur.</p>
          <label class="ed-mb-slider-row">
            <span>Büyük etiketler (L) <em id="mbLabelZoomLgVal">15</em></span>
            <input type="range" id="mbLabelZoomLg" min="12" max="22" value="15" step="0.5">
          </label>
          <label class="ed-mb-slider-row">
            <span>Orta etiketler (M) <em id="mbLabelZoomMdVal">17</em></span>
            <input type="range" id="mbLabelZoomMd" min="12" max="22" value="17" step="0.5">
          </label>
          <label class="ed-mb-slider-row">
            <span>Küçük etiketler (S) <em id="mbLabelZoomSmVal">19</em></span>
            <input type="range" id="mbLabelZoomSm" min="12" max="22" value="19" step="0.5">
          </label>
        </div>
      </div>
      <div class="ed-mb-label-toolbar">
        <input type="text" id="mbLabelSearch" placeholder="Etiket ara…">
        <div class="ed-mb-label-bulk">
          <button type="button" data-fs="8" title="Hepsi Küçük">S</button>
          <button type="button" data-fs="12" title="Hepsi Orta">M</button>
          <button type="button" data-fs="18" title="Hepsi Büyük">L</button>
          <span class="ed-mb-label-bulk-sep">·</span>
          <input type="number" id="mbLabelBulkCustom" min="4" max="96" step="1" placeholder="px" title="Tüm etiketlere özel boyut">
          <button type="button" id="mbLabelBulkApply" title="Tüm etiketlere uygula">Uygula</button>
        </div>
      </div>
      <div class="ed-mb-label-grid" id="mbLabelGrid"></div>
    </section>

    <section class="ed-mb-section" id="mbSection-icons" hidden>
      <header class="ed-mb-section-head">
        <span class="ed-mb-section-title">POI İkonları</span>
      </header>
      <div class="ed-mb-icon-palette" id="mbIconPalette"></div>
      <input type="file" id="mbCustomIconInput" accept=".png,.jpg,.jpeg,.svg,.webp,.gif" hidden>
      <div class="ed-mb-icon-hint" id="mbIconHint" hidden>
        Haritaya tıklayarak yerleştirin · Esc ile iptal
      </div>
      <div class="ed-mb-placed-list" id="mbPlacedList"></div>
    </section>

    <section class="ed-mb-section" id="mbSection-models" hidden>
      <header class="ed-mb-section-head">
        <span class="ed-mb-section-title">3D Modeller</span>
      </header>
      <div class="ed-mb-models-library" id="mbModelLibrary"></div>
      <div class="ed-mb-field">
        <span>Model ekle (GLB URL / yol)</span>
        <div class="ed-mb-models-add">
          <input type="text" id="mbModelUrlInput" placeholder="assets/models/Town Hall.glb" autocomplete="off" spellcheck="false">
          <button type="button" class="ed-mb-btn ed-mb-btn-ghost" id="mbModelUrlAdd">Ekle</button>
        </div>
      </div>
      <div class="ed-mb-models-hint" id="mbModelHint" hidden>
        Haritaya tıklayarak yerleştirin · Esc ile iptal
      </div>
      <div class="ed-mb-models-placed" id="mbModelPlacedList"></div>
    </section>

  </aside>

  <main class="ed-mb-content">
    <nav class="ed-mb-tabs" role="tablist" aria-label="Harita görünümü">
      <button type="button" class="ed-mb-tab is-active" data-mb-tab="original">Orijinal</button>
      <button type="button" class="ed-mb-tab" data-mb-tab="processed">İşlenmiş</button>
      <button type="button" class="ed-mb-tab" data-mb-tab="align">Hizala</button>
      <button type="button" class="ed-mb-tab" data-mb-tab="routing">Rota Testi</button>
    </nav>

    <div class="ed-mb-panes">
      <div class="ed-mb-pane is-active" data-mb-tab="original">
        <div class="ed-mb-empty" id="mbOriginalEmpty">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <p>SVG yükleyin önizleme görsün</p>
          <button type="button" class="ed-mb-btn ed-mb-btn-ghost" id="mbLoadSampleBtn">Örnek harita yükle (terminal.svg)</button>
          <ol class="ed-mb-onboarding">
            <li>Solda <b>SVG Yükle</b> ile bir <code>.svg</code> bırakın.</li>
            <li><b>Dönüştürme</b> bölümünde merkez/lat-lng ve ölçek bilgisini girin, <i>SVG'yi İşle</i>'ye basın.</li>
            <li><b>Hizala</b> sekmesinden dünya haritasında konumlandırın.</li>
            <li><b>3D Yükseklikler</b>, <b>Etiketler</b> ve <b>İkonlar</b> ile son rötuşları yapın.</li>
            <li><b>Önizleme iframe'ine uygula</b> ya da Dışa Aktar sekmesinde <i>ZIP</i> alın.</li>
          </ol>
        </div>
        <div class="ed-mb-svg-preview" id="mbSvgPreview" hidden></div>
      </div>

      <div class="ed-mb-pane" data-mb-tab="processed">
        <div class="ed-mb-empty" id="mbProcessedEmpty">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <p>SVG'yi işleyin GeoJSON'u görün</p>
        </div>
        <div class="ed-mb-edit-toolbar" id="mbEditToolbar" hidden>
          <button class="ed-mb-edit-btn" id="mbEditDelete" disabled title="Seçili birim(ler)i sil">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Sil
          </button>
          <button class="ed-mb-edit-btn" id="mbEditMerge" disabled title="Seçili birimleri birleştir (≥2)">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v6a2 2 0 0 0 2 2h6a2 2 0 0 1 2 2v6"/><polyline points="14 17 17 20 20 17"/><polyline points="10 7 7 4 4 7"/></svg>
            Birleştir
          </button>
          <button class="ed-mb-edit-btn" id="mbEditSplit" disabled title="Seçili birimi bir kesme çizgisiyle parçala">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3v18"/><path d="M19 3v18"/><path d="M9 12h6"/></svg>
            <span id="mbEditSplitLabel">Parçala</span>
          </button>
          <button class="ed-mb-edit-btn" id="mbEditReshape" disabled title="Seçili birimin köşelerini düzenle: köşeleri sürükle, + ile köşe ekle, çift tık ile sil">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 7-6 2-2 6z"/><circle cx="5" cy="3" r="1.6" fill="currentColor"/><circle cx="19" cy="10" r="1.6" fill="currentColor"/></svg>
            <span id="mbEditReshapeLabel">Şekil</span>
          </button>
          <button class="ed-mb-edit-btn" id="mbEditMoveLabel" title="Yazı etiketlerini sürükleyerek taşı">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/><path d="M3 21h4l-2 2z" fill="currentColor"/></svg>
            Yazı Taşı
          </button>
          <button class="ed-mb-edit-btn" id="mbEditAddLabel" title="Haritaya yeni yazı/etiket ekle">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/></svg>
            Etiket
          </button>
          <button class="ed-mb-edit-btn" id="mbEditDisable" disabled title="Seçili birim(ler)i devre dışı bırak / etkinleştir (rota, tıklama ve kapı boşluğu kapanır)">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            <span id="mbEditDisableLabel">Devre dışı</span>
          </button>
          <span class="ed-mb-edit-sep"></span>
          <div class="ed-mb-edit-legend">
            <span class="ed-mb-edit-legend-item"><i class="ed-mb-edit-dot move"></i>Taşı</span>
            <span class="ed-mb-edit-legend-item"><i class="ed-mb-edit-dot scale"></i>Boyut</span>
            <span class="ed-mb-edit-legend-item"><i class="ed-mb-edit-dot rotate"></i>Döndür</span>
            <span class="ed-mb-edit-sep"></span>
            <span class="ed-mb-edit-sel" id="mbEditSel">Bir birime tıklayın</span>
            <span class="ed-mb-edit-metric" id="mbEditMetric"></span>
          </div>
        </div>
        <div class="ed-mb-map" id="mbProcessedMap" hidden></div>
      </div>

      <div class="ed-mb-pane" data-mb-tab="align">
        <div class="ed-mb-empty" id="mbAlignEmpty">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2v20"/></svg>
          <p>Önce SVG'yi işleyin, sonra dünya haritasında hizalayın</p>
        </div>
        <div class="ed-mb-map" id="mbAlignMap" hidden></div>
        <div class="ed-mb-align-controls" id="mbAlignControls" hidden>
          <div class="ed-mb-align-title">Geo-Hizalama <span class="ed-mb-floor-tag" id="mbAlignScopeTag">tüm katlar</span></div>
          <div class="ed-mb-align-search">
            <input type="text" id="mbAlignSearch" placeholder="Konum ara (Nominatim)…">
            <button type="button" id="mbAlignSearchBtn">Git</button>
          </div>
          <label class="ed-mb-slider-row">
            <span>Saydamlık <em id="mbAlignOpacityVal">65%</em></span>
            <input type="range" id="mbAlignOpacity" min="0" max="100" value="65">
          </label>
          <div class="ed-mb-align-coords" id="mbAlignCoords">lat: 0, lng: 0</div>
          <div class="ed-mb-align-coords" id="mbAlignParams">scale: 0.030 · rot: 0°</div>

          <div class="ed-mb-align-override" id="mbAlignOverrideRow">
            <label class="ed-mb-toggle">
              <input type="checkbox" id="mbAlignOverrideToggle">
              <span>Bu kat için özel hizalama</span>
            </label>
            <div class="ed-mb-align-hint" id="mbAlignOverrideHint">
              Açıkken bu katın hizalaması diğerlerinden bağımsızdır;
              kapatıldığında tüm katlarla aynı hizalamayı kullanır.
            </div>
          </div>

          <details class="ed-mb-corner-align">
            <summary>Köşe koordinatlarından hizala</summary>
            <div class="ed-mb-corner-hint">
              SVG'nin <b>sağ üst (TR)</b> ve <b>sol alt (BL)</b> köşelerinin
              gerçek dünya koordinatlarını <code>lat, lng</code> olarak girin;
              merkez ve ölçek otomatik hesaplanır (rotasyon 0 varsayılır).
            </div>
            <div class="ed-mb-corner-row">
              <span class="ed-mb-corner-label">TR</span>
              <input type="text" id="mbCornerTr" placeholder="41.067862, 29.018664" autocomplete="off" spellcheck="false">
            </div>
            <div class="ed-mb-corner-row">
              <span class="ed-mb-corner-label">BL</span>
              <input type="text" id="mbCornerBl" placeholder="41.065189, 29.014270" autocomplete="off" spellcheck="false">
            </div>
            <div class="ed-mb-corner-actions">
              <button type="button" class="ed-mb-btn ed-mb-btn-ghost ed-mb-corner-apply" id="mbCornerApply">
                Köşelerden hesapla & uygula
              </button>
              <button type="button" class="ed-mb-btn ed-mb-btn-ghost" id="mbCornerInfoFill" title="Info sekmesindeki Lat1/Long1, Lat2/Long2 değerleriyle TR/BL alanlarını doldurur">
                Info'dan doldur
              </button>
            </div>
            <div class="ed-mb-align-hint" id="mbCornerStatus"></div>
          </details>

          <button type="button" class="ed-mb-btn ed-mb-btn-primary" id="mbAlignApply">Uygula & Yeniden işle</button>
          <div class="ed-mb-align-hint">Gövdeyi sürükle: taşı · Köşeler: ölçek · Üstteki yuvarlak: döndür (Shift = 15° snap)</div>
          <div class="ed-mb-align-hint" id="mbAlignApplyScopeHint" style="color: var(--ed-accent);">Uygulandığında tüm katlar bu konuma yeniden işlenir.</div>
        </div>
      </div>

      <div class="ed-mb-pane" data-mb-tab="routing">
        <div class="ed-mb-empty" id="mbRoutingEmpty">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <p>Önce SVG'yi işleyin, sonra iki oda seçip rota deneyin</p>
        </div>
        <div class="ed-mb-map" id="mbRoutingMap" hidden></div>
        <div class="ed-mb-routing-bar" id="mbRoutingBar" hidden>
          <div class="ed-mb-routing-chip" id="mbChipStart">
            <span class="dot start"></span>
            <span id="mbLabelStart">Bir oda seç</span>
          </div>
          <span class="ed-mb-routing-arrow">→</span>
          <div class="ed-mb-routing-chip" id="mbChipEnd">
            <span class="dot end"></span>
            <span id="mbLabelEnd">Bir oda seç</span>
          </div>
          <button type="button" class="ed-mb-btn ed-mb-btn-ghost" id="mbClearRoute">Temizle</button>
        </div>
      </div>
    </div>
  </main>
</div>
`;

let cdnLoading = null;
const CDN = {
    maplibreJs: 'https://unpkg.com/maplibre-gl@5.20.0/dist/maplibre-gl.js',
    maplibreCss: 'https://unpkg.com/maplibre-gl@5.20.0/dist/maplibre-gl.css',
    panZoom:   'https://unpkg.com/svg-pan-zoom@3.6.1/dist/svg-pan-zoom.min.js',
    jszip:     'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
    // Turf powers the geometry-edit transforms (translate / scale / rotate /
    // vertex reshape) used when editing units directly on the processed map.
    turf:      'https://unpkg.com/@turf/turf@7.2.0/turf.min.js',
};

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load ' + src));
        document.head.appendChild(s);
    });
}
function loadCss(href) {
    return new Promise((resolve, reject) => {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = href;
        l.onload = resolve;
        l.onerror = () => reject(new Error('Failed to load ' + href));
        document.head.appendChild(l);
    });
}

/** Lazy-load CDN libs needed by Map Builder. */
export function loadMapBuilderCdns() {
    if (cdnLoading) return cdnLoading;
    cdnLoading = (async () => {
        await Promise.all([
            loadCss(CDN.maplibreCss),
            loadScript(CDN.maplibreJs),
        ]);
        await Promise.all([
            loadScript(CDN.panZoom),
            loadScript(CDN.jszip),
            loadScript(CDN.turf),
        ]);
    })().catch(err => {
        console.error('[map-builder] CDN load failed', err);
        cdnLoading = null;
        throw err;
    });
    return cdnLoading;
}

export async function renderShell(host) {
    host.innerHTML = HTML;
    // Sub-tab switching is handled here, before any module wires its events.
    const tabBtns = [...host.querySelectorAll('.ed-mb-tab')];
    const panes   = [...host.querySelectorAll('.ed-mb-pane')];
    tabBtns.forEach(b => b.addEventListener('click', () => {
        const t = b.dataset.mbTab;
        tabBtns.forEach(x => x.classList.toggle('is-active', x === b));
        panes.forEach(p => p.classList.toggle('is-active', p.dataset.mbTab === t));
        host.dispatchEvent(new CustomEvent('mb:tab', { detail: { tab: t } }));
    }));

    // Kick off CDN download in the background — non-blocking. Modules that
    // need maplibre/jszip should await loadMapBuilderCdns() themselves.
    loadMapBuilderCdns().catch(() => {});
}
