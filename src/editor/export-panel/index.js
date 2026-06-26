/**
 * Export tab — bundle config.js + venue.geojson + category-mapping.json +
 * placed-icon assets into a single ZIP.
 *
 * Falls back to "config.js only" download when the user just wants the
 * settings (legacy behaviour).
 */

import { storage } from '../storage.js';
import { loadMapBuilderCdns } from '../map-builder/shell.js';
import { DEFAULT_HEIGHTS } from '../map-builder/state.js';

const HTML = `
<div class="ed-export-grid">
  <div class="ed-export-card">
    <h2>Tek tıkla paket</h2>
    <p>Editörde yaptığınız tüm düzenlemeler tek bir <code>.zip</code> içine konur. Çıkartıp projenize yapıştırın, hazır.</p>
    <div class="ed-export-summary" id="exportSummary"></div>
    <div class="ed-export-interfaces">
      <div class="ed-export-interfaces-title">Hangi arayüzler paketlensin?</div>
      <p class="ed-export-interfaces-hint">Ayarlar tüm arayüzlere ortak uygulanır; yalnızca seçtiğiniz arayüzlerin konfigürasyonu dışa aktarılır. Tek arayüz seçilirse paket o moda sabitlenir; birden fazla seçilirse web↔mobil otomatik algılanır.</p>
      <div class="ed-export-interfaces-grid">
        <label><input type="checkbox" class="ed-iface-opt" value="web" checked> Web</label>
        <label><input type="checkbox" class="ed-iface-opt" value="kiosk" checked> Kiosk</label>
        <label><input type="checkbox" class="ed-iface-opt" value="kiosk-portrait" checked> Kiosk Dikey</label>
        <label><input type="checkbox" class="ed-iface-opt" value="mobile" checked> Mobil</label>
      </div>
    </div>
    <div class="ed-export-options">
      <label><input type="checkbox" id="optConfig" checked> <code>config.js</code></label>
      <label><input type="checkbox" id="optGeojson" checked> <code>assets/venue.geojson</code></label>
      <label><input type="checkbox" id="optCategories" checked> <code>category-mapping.json</code></label>
      <label><input type="checkbox" id="optIcons" checked> Özel ikon dosyaları</label>
      <label><input type="checkbox" id="optSvg"> Orijinal <code>.svg</code> kaynağı</label>
      <label><input type="checkbox" id="optReadme" checked> Kurulum <code>README.md</code></label>
    </div>
    <div class="ed-export-actions">
      <button type="button" class="ed-mb-btn ed-mb-btn-primary" id="btnZip">ZIP olarak indir</button>
      <button type="button" class="ed-mb-btn ed-mb-btn-ghost" id="btnConfigOnly">Sadece config.js</button>
    </div>
    <div class="ed-export-note" id="exportNote"></div>
  </div>
</div>
`;

let started = false;
let host = null;
let app = null;
let actions = null;

export function initExportPanel(_host, _app, _actions) {
    host = _host;
    app = _app;
    actions = _actions;
    return {
        async activate() {
            if (!started) {
                started = true;
                host.innerHTML = HTML;
                wire();
            }
            await refreshSummary();
        },
    };
}

function wire() {
    host.querySelector('#btnConfigOnly').addEventListener('click', async () => {
        try {
            const text = await snapshotConfigJs();
            downloadText(text, 'config.js', 'text/javascript');
            app.setStatus(`config.js indirildi (${selectedInterfaces().join(', ')})`, 'saved');
        } catch (e) {
            console.error(e);
            app.setStatus('config.js oluşturulamadı: ' + e.message, 'dirty');
        }
    });
    host.querySelector('#btnZip').addEventListener('click', () => buildZip());

    host.querySelectorAll('.ed-iface-opt').forEach(cb =>
        cb.addEventListener('change', () => updateInterfaceNote()));
    updateInterfaceNote();
}

/** Interfaces the user ticked for export (falls back to all if none). */
function selectedInterfaces() {
    const sel = [...host.querySelectorAll('.ed-iface-opt:checked')].map(cb => cb.value);
    return sel.length ? sel : ['web', 'kiosk', 'kiosk-portrait', 'mobile'];
}

function updateInterfaceNote() {
    const sel = selectedInterfaces();
    const note = host.querySelector('#exportNote');
    if (!note) return;
    const initialView = sel.length === 1 ? sel[0] : 'auto';
    note.textContent = `Paketlenecek arayüzler: ${sel.join(', ')} · initialView = ${initialView}`;
}

function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshSummary() {
    const sum = await storage.summary();
    const floors = await storage.getFloors();
    const $sum = host.querySelector('#exportSummary');
    $sum.innerHTML = `
      <div class="ed-export-stat"><b>${sum.featureCount.toLocaleString()}</b> harita feature'ı</div>
      <div class="ed-export-stat"><b>${floors.length}</b> kat</div>
      <div class="ed-export-stat"><b>${sum.iconCount}</b> özel ikon</div>
      <div class="ed-export-stat"><b>${sum.hasCategories ? 'Özel' : 'Varsayılan'}</b> kategori listesi</div>
      <div class="ed-export-stat-mini">${floors.map(f => `${f.key} – ${f.name}`).join(' · ')}</div>
    `;
}

/**
 * Merge every floor's geojson into a single FeatureCollection,
 * tagging each feature with `properties.floor = floorKey`. This is the
 * shape the runtime expects for multi-floor venues.
 */
async function buildMergedGeojson() {
    const floors = await storage.getFloors();
    const features = [];
    for (const f of floors) {
        const gj = await storage.getFloorGeojson(f.key);
        if (!gj?.features) continue;
        // Bake the editor's per-label font-size overrides into the exported
        // writing features so production matches the editor preview.
        const sizes = await storage.getFloorLabelSizes(f.key).catch(() => ({}));
        for (const feat of gj.features) {
            const props = { ...(feat.properties || {}), floor: f.key };
            if (props.layer === 'writing' && sizes && sizes[props.id] != null) {
                props.font_size = Number(sizes[props.id]);
            }
            features.push({ ...feat, properties: props });
        }
    }
    return { type: 'FeatureCollection', features };
}

/** Editor-placed icons across every floor, flattened with a `floor` tag. */
async function buildMergedPlacedIcons() {
    const floors = await storage.getFloors();
    const out = [];
    for (const f of floors) {
        const list = await storage.getFloorPlacedIcons(f.key);
        if (!Array.isArray(list)) continue;
        for (const p of list) out.push({ ...p, floor: f.key });
    }
    return out;
}

async function buildZip() {
    try {
        await loadMapBuilderCdns();   // pulls jszip too
        if (!window.JSZip) throw new Error('JSZip yüklenemedi');
        const zip = new window.JSZip();
        const wantConfig     = host.querySelector('#optConfig').checked;
        const wantGeojson    = host.querySelector('#optGeojson').checked;
        const wantCats       = host.querySelector('#optCategories').checked;
        const wantIcons      = host.querySelector('#optIcons').checked;
        const wantSvg        = host.querySelector('#optSvg').checked;
        const wantReadme     = host.querySelector('#optReadme').checked;

        if (wantConfig) {
            const cfgText = await snapshotConfigJs();
            zip.file('config.js', cfgText);
        }
        if (wantGeojson) {
            const gj = await buildMergedGeojson();
            if (gj.features.length) zip.file('assets/venue.geojson', JSON.stringify(gj, null, 2));
        }
        if (wantCats) {
            const c = await storage.getCategories();
            if (c) zip.file('category-mapping.json', JSON.stringify(c, null, 2));
        }
        if (wantIcons) {
            const icons = await storage.getIcons();
            for (const ic of icons) {
                const ext = guessExt(ic.mime, ic.id);
                zip.file(`assets/icons/${ic.id}${ext}`, ic.blob);
            }
        }
        if (wantSvg) {
            const svg = await storage.getSvg();
            if (svg) zip.file('assets/source.svg', svg);
        }
        if (wantReadme) {
            zip.file('README.md', readmeText());
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const url  = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'venue-bundle.zip';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        app.setStatus('venue-bundle.zip indirildi', 'saved');
    } catch (e) {
        console.error(e);
        app.setStatus('ZIP oluşturulamadı: ' + e.message, 'dirty');
    }
}

async function snapshotConfigJs() {
    const { generateConfigJs, filterConfigForInterfaces } = await import('../exporter.js');
    // Clone so the edits below (floorMap, geojsonPath, baked heights) never
    // mutate the editor's live config object.
    const base = app.getConfig?.() || {};
    let config = (typeof structuredClone === 'function')
        ? structuredClone(base) : JSON.parse(JSON.stringify(base));

    // Make sure the exported config has an up-to-date floorMap and a
    // sane defaultFloor based on the current set of floors in the
    // editor — otherwise a freshly-imported bundle would still claim
    // to be single-floor.
    const floors = await storage.getFloors();
    if (floors.length) {
        const floorMap = {};
        for (const f of floors) floorMap[f.key] = f.name;
        const venue = config.venue ? { ...config.venue, floorMap } : { floorMap };
        if (!venue.defaultFloor || !floors.some(f => f.key === String(venue.defaultFloor))) {
            // Prefer key '0' if present, otherwise the first floor in order.
            venue.defaultFloor = floors.find(f => f.key === '0')?.key || floors[0].key;
        }
        config.venue = venue;
    }

    // (1) The bundle always writes the merged map to assets/venue.geojson, so
    // the exported config must point there — not at the source venue's name.
    config.venue = { ...(config.venue || {}), geojsonPath: 'assets/venue.geojson' };

    // (2) Bake the editor's per-sublayer extrusion heights into the config so
    // solid-block heights survive export (mirrors app.js → applyEditorHeights).
    await bakeEditorHeights(config);

    // Scope the exported config to the interfaces the user selected.
    config = filterConfigForInterfaces(config, selectedInterfaces());
    return generateConfigJs(config);
}

/**
 * Replicate the preview's height logic (app.js → applyEditorHeights) at export
 * time. The editor keeps per-floor heights in IndexedDB, never in the live
 * config, so without this the exported config falls back to flat defaults and
 * every solid block extrudes to the same height.
 */
async function bakeEditorHeights(config) {
    if (!config.features) config.features = {};
    if (!config.features.map) config.features.map = {};

    const activeKey = await storage.getActiveFloorKey().catch(() => null);
    const heights = activeKey ? await storage.getFloorHeights(activeKey).catch(() => null) : null;
    const meta    = activeKey ? await storage.getFloorMeta(activeKey).catch(() => ({})) : {};
    const mode = meta?.heightMode || 'auto';
    const mult = meta?.heightScaleAuto ?? 0.1;

    let effective;
    if (mode === 'auto') {
        effective = {};
        const dynamicKeys = (heights && typeof heights === 'object') ? Object.keys(heights) : [];
        const allKeys = new Set([...Object.keys(DEFAULT_HEIGHTS), ...dynamicKeys]);
        for (const k of allKeys) effective[k] = (DEFAULT_HEIGHTS[k] ?? 4) * mult;
    } else if (heights && typeof heights === 'object') {
        effective = { ...heights };
    } else {
        return;
    }

    config.features.map.sublayerHeights = {
        ...(config.features.map.sublayerHeights || {}),
        ...effective,
    };
}

function guessExt(mime, id) {
    if (id && /\.(png|jpg|jpeg|svg|webp|gif)$/i.test(id)) return '';
    if (mime === 'image/png') return '.png';
    if (mime === 'image/jpeg') return '.jpg';
    if (mime === 'image/svg+xml') return '.svg';
    if (mime === 'image/webp') return '.webp';
    if (mime === 'image/gif') return '.gif';
    return '';
}

function readmeText() {
    return `# Inmapper Kiosk — Venue Bundle

Bu paket, editörde yapılan düzenlemelerin tam bir kopyasını içerir.

## İçindekiler

- \`config.js\` — kiosk uygulamasının ana konfig dosyası. Mevcut \`src/core/config.js\` veya bağımlılığını kullandığınız config konumuna yerleştirin.
- \`assets/venue.geojson\` — SVG'den dönüştürülen GeoJSON harita.
- \`assets/icons/\` — yerleştirdiğiniz özel POI ikonları.
- \`assets/source.svg\` — orijinal SVG (varsa).
- \`category-mapping.json\` — düzenlenmiş kategori listesi.

## Kurulum

1. Proje klasörünü açın.
2. ZIP içeriğini olduğu gibi yapıştırın (var olanları üzerine yazın).
3. \`config.js\` içinde \`venue.geojsonPath = 'assets/venue.geojson'\` olduğundan emin olun.

## Notlar

- POI ikonları kiosk uygulamasının açılışında \`assets/icons/\`'tan yüklenmek üzere hazırdır.
- GeoJSON formatı standardınızla uyumludur — manuel düzenleme isterseniz bir editörle açıp kaydedebilirsiniz.
`;
}
