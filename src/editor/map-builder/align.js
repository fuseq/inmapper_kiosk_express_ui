/**
 * Geo-align pane: overlay processed geojson onto a real-world OSM map and
 * drag/scale/rotate it. Apply re-runs convertSvg with the new params.
 *
 * Interactions:
 *   - Drag on overlay body  → translate (move center)
 *   - Drag on corner handle → uniform scale around overlay center
 *   - Drag on top handle    → rotate around overlay center
 *   - Apply                 → re-run convertSvg with the resulting
 *                             centerLat / centerLng / scale / rotation
 *
 * Internal model:
 *   The overlay is a *runtime preview* — we transform the live geojson by
 *   (translate, rotate around center, scale around center). When the user
 *   hits "Apply" we do not bake those transforms into the geojson directly;
 *   we simply update mbState's center/scale/rotation and re-run the SVG
 *   converter so the canonical geometry matches the converter output.
 */

import { mbState } from './state.js';
import { convertSvg } from '../svg/svg-converter.js';
import { storage } from '../storage.js';
import { loadMapBuilderCdns } from './shell.js';
import { buildColorExpr, buildOtherFloorsRooms } from './process.js';
import { fetchSheetTab, fetchSheetTabRaw, pickTab, rowsToKeyValueMap } from '../../core/sheets.js';

let alignMap = null;

/* Live transform parameters (relative to the geojson currently in mbState). */
let overlayCenter = null;        // { lng, lat } — translation target
let overlayScale = 1;            // multiplier on top of mbState.scale
let overlayRotation = 0;         // degrees, additive on top of mbState.rotation

/* Drag state. */
let mode = null;                 // 'pan' | 'scale' | 'rotate'
let startPointer = null;         // screen px { x, y }
let startCenter = null;
let startScale = 1;
let startRotation = 0;
let startBounds = null;          // [minLng, minLat, maxLng, maxLat] of *base* geojson

/* DOM handles. */
let handlesLayer = null;
let cornerHandles = {};          // { nw, ne, sw, se }
let rotateHandle = null;

const OSM_STYLE = {
    version: 8,
    sources: {
        osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256, attribution: '© OpenStreetMap contributors',
        },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export async function initAlign(app) {
    const $empty   = document.getElementById('mbAlignEmpty');
    const $mapHost = document.getElementById('mbAlignMap');
    const $controls = document.getElementById('mbAlignControls');
    const $opacity = document.getElementById('mbAlignOpacity');
    const $opacityVal = document.getElementById('mbAlignOpacityVal');
    const $coords  = document.getElementById('mbAlignCoords');
    const $params  = document.getElementById('mbAlignParams');
    const $search  = document.getElementById('mbAlignSearch');
    const $searchBtn = document.getElementById('mbAlignSearchBtn');
    const $apply   = document.getElementById('mbAlignApply');
    const $overrideToggle = document.getElementById('mbAlignOverrideToggle');
    const $overrideHint   = document.getElementById('mbAlignOverrideHint');
    const $scopeTag       = document.getElementById('mbAlignScopeTag');
    const $applyScopeHint = document.getElementById('mbAlignApplyScopeHint');
    const $processScopeTag = document.getElementById('mbProcessScopeTag');
    const $cornerTr     = document.getElementById('mbCornerTr');
    const $cornerBl     = document.getElementById('mbCornerBl');
    const $cornerApply  = document.getElementById('mbCornerApply');
    const $cornerStatus = document.getElementById('mbCornerStatus');
    const $cornerInfoFill = document.getElementById('mbCornerInfoFill');

    const host = document.getElementById('edMapBuilder');
    host.addEventListener('mb:tab', async (e) => {
        if (e.detail.tab === 'align') {
            await ensureAlign();
        }
    });

    // Switching active floor while on the Align tab: rebind the overlay
    // to the new floor's geojson + alignment params.
    mbState.on('active-floor-changed', () => rebindOverlay());

    // Toggling the per-floor override flips which alignment record the
    // shims read from — re-anchor the overlay so the user sees what's
    // actually being applied right now.
    mbState.on('floor-alignment-changed', () => {
        rebindOverlay();
        renderOverrideToggle();
    });

    function rebindOverlay() {
        renderOverrideToggle();
        if (!alignMap) return;
        // Other floors changed under us (new floor active, sibling
        // re-converted, …) — pull a fresh reference snapshot.
        refreshReference();
        if (!mbState.geojson) {
            const src = alignMap.getSource('overlay');
            if (src) src.setData({ type: 'FeatureCollection', features: [] });
            return;
        }
        overlayCenter = {
            lng: mbState.centerLng || alignMap.getCenter().lng,
            lat: mbState.centerLat || alignMap.getCenter().lat,
        };
        overlayScale = 1;
        overlayRotation = 0;
        startBounds = computeBaseBounds(mbState.geojson);
        refreshOverlay();
        updateHandlePositions();
        updateInfo();
    }

    /* Reflect the active floor's override state in the toggle, the
     * scope rosette and the apply hint. Safe to call before $controls
     * is shown — it only manipulates the controls themselves. */
    function renderOverrideToggle() {
        const activeKey = mbState.activeFloorKey;
        const overridden = mbState.hasFloorAlignmentOverride(activeKey);
        if ($overrideToggle) $overrideToggle.checked = overridden;
        if ($scopeTag) $scopeTag.textContent = overridden ? 'bu kat' : 'tüm katlar';
        if ($processScopeTag) $processScopeTag.textContent = overridden ? 'bu kat' : 'tüm katlar';
        if ($applyScopeHint) {
            $applyScopeHint.textContent = overridden
                ? 'Uygulandığında yalnız bu katın hizalaması güncellenir.'
                : 'Uygulandığında paylaşımlı hizalama tüm katlar için güncellenir.';
        }
        if ($overrideHint) {
            $overrideHint.textContent = overridden
                ? 'Bu kat artık paylaşımlı hizalamadan bağımsız. Kapatırsanız tekrar tüm katlarla aynı konuma döner.'
                : 'Açarsanız bu katı paylaşımlı hizalamadan ayırıp ayrı konum/ölçek/dönüş verebilirsiniz (örn. üst kat farklı oturumlu).';
        }
    }

    if ($overrideToggle) {
        $overrideToggle.addEventListener('change', async () => {
            const activeKey = mbState.activeFloorKey;
            const want = $overrideToggle.checked;
            try {
                if (want) {
                    // Lift this floor out of the shared alignment, seeding
                    // the override with whatever it was already using so
                    // the map doesn't jump.
                    await mbState.setFloorAlignmentOverride(activeKey);
                    app.setStatus('Bu kat için özel hizalama açıldı', 'saved');
                } else {
                    // Drop back to the shared project alignment AND
                    // re-convert this floor immediately so the user sees
                    // it snap into the shared position. Otherwise the
                    // already-baked geojson would still reflect the old
                    // override values until the next "Uygula".
                    await mbState.clearFloorAlignmentOverride(activeKey);
                    const f = mbState.getFloor(activeKey);
                    if (f?.svgText) {
                        const pa = mbState.projectAlignment;
                        const r = convertSvg(f.svgText, {
                            centerLat: pa.centerLat,
                            centerLng: pa.centerLng,
                            scale:     pa.scale,
                            rotation:  pa.rotation,
                        });
                        f.geojson       = r.geojson;
                        f.stats         = r.stats;
                        f.contentExtent = r.contentExtent || f.contentExtent;
                        await storage.setFloorGeojson(activeKey, r.geojson);
                        await storage.setFloorMeta(activeKey, {
                            svgFilename: f.svgFilename,
                            svgInfo: f.svgInfo,
                            stats: f.stats,
                            contentExtent: f.contentExtent,
                            heightMode: f.heightMode,
                            heightScaleAuto: f.heightScaleAuto,
                        });
                        mbState.emit('geojson-changed');
                        try { app?.reload?.(['venue.geojsonPath']); } catch {}
                    }
                    app.setStatus('Bu kat artık paylaşımlı hizalamayı kullanıyor', 'saved');
                }
            } catch (e) {
                console.error('[align] override toggle failed', e);
                app.setStatus('Hata: ' + e.message, 'dirty');
                $overrideToggle.checked = !want; // revert UI on error
            }
        });
    }

    /* ── Corner-based alignment ──────────────────────────────────────
     *
     * Optional shortcut: instead of dragging the overlay over an OSM
     * basemap, the user enters the real-world lat/lng of the SVG's
     * **bottom-left** and **top-right** corners. We derive centre + a
     * uniform scale (geometric mean of width-/height-derived scales,
     * which preserves area when the aspect ratio doesn't quite match)
     * and snap rotation to 0 — because two opposite corners imply an
     * axis-aligned, north-up SVG.
     *
     * The result writes through the same code path as "Uygula": shared
     * project alignment when the floor is inheriting, the floor's own
     * override otherwise.
     */
    if ($cornerApply) $cornerApply.addEventListener('click', applyFromCorners);
    if ($cornerInfoFill) $cornerInfoFill.addEventListener('click', fillFromInfoSheet);

    /* Pull the venue's "Info" tab — the legacy alignment cheat-sheet
     * (Lat1/Long1 = top-right, Lat2/Long2 = bottom-left) — and pre-fill
     * the corner inputs. We don't auto-apply: user still has to click
     * "Köşelerden hesapla & uygula" so they can review/tweak. */
    async function fillFromInfoSheet() {
        const sheets = app?.getConfig?.()?.venue?.sheets;
        const tab = pickTab(sheets || {}, 'info');
        if (!sheets?.sheetId || !tab) {
            setCornerStatus('Info sekmesi tanımlı değil. Ayarlar > "Info Sekmesi" alanını doldurun.', 'dirty');
            return;
        }
        setCornerStatus('Info sekmesi okunuyor…', 'dirty');
        try {
            /* The Info tab has no canonical schema — venues use several
             * common shapes:
             *   (a) header-less 2-column "Key, Value" (Angle | 330, …)
             *   (b) "Key, Value" with a header row
             *   (c) named columns: Lat1, Long1, Lat2, Long2, … on row 1
             * We collect into a single { [key]: value } map and look up the
             * four keys we need. */
            const map = {};

            // Shape (a): raw 2-column without header.
            try {
                const raw = await fetchSheetTabRaw(sheets.sheetId, tab);
                Object.assign(map, rowsToKeyValueMap(raw));
            } catch (rawErr) {
                console.warn('[align] raw info fetch failed', rawErr);
            }

            // Shape (b) + (c): with header-parsed rows.
            try {
                const rows = await fetchSheetTab(sheets.sheetId, tab);
                for (const r of rows) {
                    if (r.Key && r.Value !== undefined) {
                        map[String(r.Key).trim()] ??= String(r.Value).trim();
                    } else {
                        for (const k of Object.keys(r)) {
                            const v = r[k];
                            if (v !== '' && v !== undefined) map[k] ??= String(v).trim();
                        }
                    }
                }
            } catch { /* raw mode is enough */ }

            const lat1  = parseFloat(map.Lat1  ?? map.lat1);
            const long1 = parseFloat(map.Long1 ?? map.long1 ?? map.Lng1 ?? map.lng1);
            const lat2  = parseFloat(map.Lat2  ?? map.lat2);
            const long2 = parseFloat(map.Long2 ?? map.long2 ?? map.Lng2 ?? map.lng2);
            if (![lat1, long1, lat2, long2].every(Number.isFinite)) {
                const foundKeys = Object.keys(map).slice(0, 12).join(', ');
                setCornerStatus(
                    `Info sekmesinde Lat1/Long1/Lat2/Long2 anahtarları bulunamadı. Bulunan: ${foundKeys || '(boş)'}`,
                    'dirty',
                );
                return;
            }
            // Convention: (Lat1, Long1) = top-right, (Lat2, Long2) = bottom-left.
            // We sanity-check by ordering — TR's lat must be greater than BL's.
            const trLat  = Math.max(lat1, lat2);
            const blLat  = Math.min(lat1, lat2);
            const trLng  = Math.max(long1, long2);
            const blLng  = Math.min(long1, long2);
            if ($cornerTr) $cornerTr.value = `${trLat}, ${trLng}`;
            if ($cornerBl) $cornerBl.value = `${blLat}, ${blLng}`;
            setCornerStatus('TR/BL alanları Info sekmesinden dolduruldu — "Köşelerden hesapla & uygula" ile uygulayın.', 'saved');
        } catch (e) {
            setCornerStatus(`Info okunamadı: ${e.message}`, 'dirty');
        }
    }

    async function applyFromCorners() {
        const f = mbState.getActiveFloor();
        if (!f?.svgText) {
            setCornerStatus('Önce bu kata bir SVG yükleyin.', 'dirty');
            return;
        }
        const vb = f.svgInfo?.viewBox;
        if (!vb || !(vb.width > 0) || !(vb.height > 0)) {
            setCornerStatus('SVG viewBox bilgisi okunamadı.', 'dirty');
            return;
        }

        const tr = parseLatLng($cornerTr.value);
        const bl = parseLatLng($cornerBl.value);
        if (!tr) { setCornerStatus('TR koordinatı geçersiz. Örn: 41.067862, 29.018664', 'dirty'); return; }
        if (!bl) { setCornerStatus('BL koordinatı geçersiz. Örn: 41.065189, 29.014270', 'dirty'); return; }
        if (tr.lat <= bl.lat || tr.lng <= bl.lng) {
            setCornerStatus('TR (sağ üst) köşesi BL\'ye göre kuzey-doğuda olmalı.', 'dirty');
            return;
        }

        const centerLat = (tr.lat + bl.lat) / 2;
        const centerLng = (tr.lng + bl.lng) / 2;
        const cosLat = Math.cos(centerLat * Math.PI / 180) || 1;

        // Convert each axis-span into metres (the unit GeoTransform
        // expects for `scale`), then cross-check the two derivations.
        const widthMeters  = (tr.lng - bl.lng) * 111320 * cosLat;
        const heightMeters = (tr.lat - bl.lat) * 111320;
        const scaleX = widthMeters  / vb.width;
        const scaleY = heightMeters / vb.height;
        if (!(scaleX > 0) || !(scaleY > 0)) {
            setCornerStatus('Hesaplanan ölçek geçersiz.', 'dirty');
            return;
        }
        // Geometric mean keeps the *covered area* equal to the corner
        // box even when the aspect ratios slightly disagree.
        const scale = Math.sqrt(scaleX * scaleY);
        const mismatch = Math.abs(scaleX - scaleY) / scale;

        const newAlignment = {
            centerLat, centerLng, scale, rotation: 0,
        };

        const activeKey = mbState.activeFloorKey;
        const overrideMode = mbState.hasFloorAlignmentOverride(activeKey);

        try {
            const reprocessed = [];
            const failed = [];

            if (overrideMode) {
                f.alignmentOverride = { ...newAlignment };
                await storage.setFloorAlignment(activeKey, f.alignmentOverride);
                try {
                    const r = convertSvg(f.svgText, newAlignment);
                    f.geojson       = r.geojson;
                    f.stats         = r.stats;
                    f.contentExtent = r.contentExtent || f.contentExtent;
                    await storage.setFloorGeojson(activeKey, r.geojson);
                    await storage.setFloorMeta(activeKey, {
                        svgFilename: f.svgFilename,
                        svgInfo: f.svgInfo,
                        stats: f.stats,
                        contentExtent: f.contentExtent,
                        heightMode: f.heightMode,
                        heightScaleAuto: f.heightScaleAuto,
                    });
                    reprocessed.push(activeKey);
                } catch (err) {
                    console.error(`[align] re-convert failed for floor ${activeKey}`, err);
                    failed.push(activeKey);
                }
            } else {
                _internal_setProjectAlignment(newAlignment);
                await storage.setProjectAlignment(newAlignment);
                for (const fl of mbState.listFloors()) {
                    if (!fl.svgText) continue;
                    if (fl.alignmentOverride) continue;
                    try {
                        const r = convertSvg(fl.svgText, newAlignment);
                        fl.geojson       = r.geojson;
                        fl.stats         = r.stats;
                        fl.contentExtent = r.contentExtent || fl.contentExtent;
                        await storage.setFloorGeojson(fl.key, r.geojson);
                        await storage.setFloorMeta(fl.key, {
                            svgFilename: fl.svgFilename,
                            svgInfo: fl.svgInfo,
                            stats: fl.stats,
                            contentExtent: fl.contentExtent,
                            heightMode: fl.heightMode,
                            heightScaleAuto: fl.heightScaleAuto,
                        });
                        reprocessed.push(fl.key);
                    } catch (err) {
                        console.error(`[align] re-convert failed for floor ${fl.key}`, err);
                        failed.push(fl.key);
                    }
                }
            }

            // Reset live transforms — values are now baked into mbState.
            overlayCenter = { lng: centerLng, lat: centerLat };
            overlayScale = 1;
            overlayRotation = 0;
            startBounds = computeBaseBounds(mbState.geojson);

            mbState.emit('geojson-changed');
            refreshOverlay();
            refreshReference();
            updateHandlePositions();
            updateInfo();

            // Push the freshly-converted geojson into the preview iframe
            // so the Settings tab reflects the new alignment without a
            // manual "Önizleme iframe'ine uygula".
            if (reprocessed.length) {
                try { app?.reload?.(['venue.geojsonPath']); } catch {}
            }

            if (alignMap) alignMap.flyTo({ center: [centerLng, centerLat], zoom: 17, animate: true });

            const scope = overrideMode ? 'bu kat' : 'paylaşımlı hizalama';
            const ratioPct = (mismatch * 100).toFixed(1);
            const ratioNote = mismatch > 0.05
                ? ` · ⚠ SVG en/boy oranı kutu oranıyla %${ratioPct} sapıyor`
                : '';
            const statusMsg = `Köşelere göre hizalandı (${scope}) · ${reprocessed.length} kat${ratioNote}`;
            setCornerStatus(statusMsg, mismatch > 0.05 ? 'dirty' : 'saved');
            app.setStatus(statusMsg, failed.length || mismatch > 0.05 ? 'dirty' : 'saved');
        } catch (e) {
            console.error('[align] corner apply failed', e);
            setCornerStatus('Hata: ' + e.message, 'dirty');
        }
    }

    function setCornerStatus(text, kind) {
        if (!$cornerStatus) return;
        $cornerStatus.textContent = text;
        $cornerStatus.style.color = kind === 'dirty'
            ? 'var(--ed-warn, #b45309)'
            : 'var(--ed-accent)';
    }

    /** Parse "lat, lng" / "lat lng" / "lat;lng" strings — accepts a
     *  sprinkling of whitespace, commas and semicolons so users can
     *  paste straight from Google Maps / Apple Maps without thinking
     *  about the format. Returns `{ lat, lng }` or null on failure. */
    function parseLatLng(raw) {
        if (typeof raw !== 'string') return null;
        const parts = raw.trim().split(/[\s,;]+/).filter(Boolean);
        if (parts.length < 2) return null;
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        return { lat, lng };
    }

    // Initial render — the controls might already be visible if the
    // user landed on the Align tab from a previous session.
    renderOverrideToggle();
    mbState.on('hydrate', renderOverrideToggle);

    async function ensureAlign() {
        if (!mbState.geojson) {
            $empty.hidden = false;
            $mapHost.hidden = true;
            $controls.hidden = true;
            return;
        }
        await loadMapBuilderCdns();
        if (!alignMap) {
            $empty.hidden = true;
            $mapHost.hidden = false;
            $controls.hidden = false;

            alignMap = new window.maplibregl.Map({
                container: $mapHost,
                style: OSM_STYLE,
                center: [mbState.centerLng || 28.97, mbState.centerLat || 41.01],
                zoom: 16,
            });
            alignMap.addControl(new window.maplibregl.NavigationControl());
            await new Promise(r => alignMap.once('load', r));

            // Reset transform state on first install.
            overlayCenter = {
                lng: mbState.centerLng || alignMap.getCenter().lng,
                lat: mbState.centerLat || alignMap.getCenter().lat,
            };
            overlayScale = 1;
            overlayRotation = 0;

            startBounds = computeBaseBounds(mbState.geojson);
            installOverlay();
            createHandles();
            attachOverlayDrag();
            updateInfo();
            updateHandlePositions();
            alignMap.on('move', updateHandlePositions);
            alignMap.on('movestart', updateHandlePositions);
            alignMap.on('moveend', updateHandlePositions);
        } else {
            requestAnimationFrame(() => alignMap.resize());
            startBounds = computeBaseBounds(mbState.geojson);
            refreshOverlay();
            updateHandlePositions();
        }
    }

    function installOverlay() {
        // Reference layer: every *other* floor's rooms drawn as
        // dashed outlines on the world map. Static — these floors are
        // already aligned so the user can drag the active floor's
        // overlay relative to them and see how the new one fits.
        if (!alignMap.getSource('reference')) {
            alignMap.addSource('reference', { type: 'geojson', data: buildOtherFloorsRooms() });
            alignMap.addLayer({
                id: 'reference-outline', type: 'line', source: 'reference',
                paint: {
                    'line-color': '#94a3b8',
                    'line-width': 1,
                    'line-opacity': 0.7,
                    'line-dasharray': [3, 3],
                },
            });
            // Soft fill so the user sees an actual silhouette and not
            // just edges (helps when the reference floor and the active
            // floor partially overlap).
            alignMap.addLayer({
                id: 'reference-fill', type: 'fill', source: 'reference',
                paint: {
                    'fill-color': '#94a3b8',
                    'fill-opacity': 0.08,
                },
            }, 'reference-outline');
        }

        if (alignMap.getSource('overlay')) return;
        alignMap.addSource('overlay', { type: 'geojson', data: transformedGeojson() });
        alignMap.addLayer({
            id: 'overlay-fill', type: 'fill', source: 'overlay',
            filter: ['==', ['get', 'layer'], 'rooms'],
            paint: {
                'fill-color': buildColorExpr(),
                'fill-opacity': Number($opacity.value) / 100,
                'fill-outline-color': '#444',
            },
        });
    }

    function refreshOverlay() {
        if (!alignMap || !alignMap.getSource('overlay')) return;
        alignMap.getSource('overlay').setData(transformedGeojson());
    }

    /** Re-pull the other-floor reference layer (e.g. after a sibling
     *  floor was processed/re-aligned and we're back on this tab). */
    function refreshReference() {
        const src = alignMap?.getSource('reference');
        if (src) src.setData(buildOtherFloorsRooms());
    }

    /**
     * Project a single (lng, lat) point from the *base* geojson frame
     * (as currently stored in mbState) into the overlay's *display*
     * frame, applying overlayScale, overlayRotation and a translation
     * to overlayCenter.
     *
     * Why the two cosLat factors:
     *   The geojson was baked at `baseLat` with `baseCosLat`. Mercator
     *   stretches latitude at higher latitudes, so if we project the
     *   shape back using only `baseCosLat` the overlay ends up
     *   horizontally squashed when displayed at a different latitude
     *   (the classic "default centerLat=0 → drag to lat 41" case).
     *   Using `dispCosLat` for the inverse projection makes the lng
     *   spread match what `convertSvg` would emit if we re-baked at
     *   the new latitude — so the preview matches "Apply & re-process".
     *
     * `overrides` lets callers ask "what would this look like at the
     * START of a drag" by passing snapshotted scale/rotation/center.
     */
    function projectBaseToOverlay(lng, lat, overrides = {}) {
        const baseLng = mbState.centerLng;
        const baseLat = mbState.centerLat;
        const center  = overrides.center   || overlayCenter;
        const scale   = overrides.scale   ?? overlayScale;
        const rotDeg  = overrides.rotation ?? overlayRotation;

        const baseCosLat = Math.cos(baseLat * Math.PI / 180) || 1;
        const dispCosLat = Math.cos(center.lat * Math.PI / 180) || 1;
        const rad = (rotDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        // 1. Move into a metric-ish frame around base center (lat-degree-equivalent)
        let x = (lng - baseLng) * baseCosLat;
        let y = (lat - baseLat);
        // 2. Scale
        x *= scale; y *= scale;
        // 3. Rotate around base center
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        // 4. Project back into lng/lat around the OVERLAY center using
        //    its cosLat — preserves metric shape at the display latitude.
        return [center.lng + rx / dispCosLat, center.lat + ry];
    }

    /**
     * Apply (scale-around-base, rotate-around-base, translate-to-overlay)
     * to the geojson in mbState. The base center stays baked into the
     * geojson — overlayCenter is treated as the new display center.
     */
    function transformedGeojson() {
        const gj = mbState.geojson;
        const tx = ([lng, lat]) => projectBaseToOverlay(lng, lat);

        const features = gj.features.map(f => {
            const g = f.geometry;
            if (!g) return f;
            let coords;
            if (g.type === 'Point')             coords = tx(g.coordinates);
            else if (g.type === 'LineString')   coords = g.coordinates.map(tx);
            else if (g.type === 'Polygon')      coords = g.coordinates.map(r => r.map(tx));
            else if (g.type === 'MultiPolygon') coords = g.coordinates.map(p => p.map(r => r.map(tx)));
            else return f;
            return { ...f, geometry: { ...g, coordinates: coords } };
        });
        return { type: 'FeatureCollection', features };
    }

    /* ──────────────────────────────────────────────────────────────────
     * Handles
     * ────────────────────────────────────────────────────────────────── */

    function createHandles() {
        // Mount a dedicated overlay container above the map canvas.
        if (handlesLayer) handlesLayer.remove();
        handlesLayer = document.createElement('div');
        handlesLayer.className = 'ed-mb-align-handles';
        $mapHost.appendChild(handlesLayer);

        cornerHandles = {};
        for (const corner of ['nw', 'ne', 'se', 'sw']) {
            const h = document.createElement('div');
            h.className = `ed-mb-align-handle ed-mb-align-handle-corner ed-mb-align-handle-${corner}`;
            h.dataset.role = 'scale';
            h.dataset.corner = corner;
            h.title = 'Sürükleyerek ölçekle';
            h.addEventListener('mousedown', onHandleMouseDown);
            handlesLayer.appendChild(h);
            cornerHandles[corner] = h;
        }

        rotateHandle = document.createElement('div');
        rotateHandle.className = 'ed-mb-align-handle ed-mb-align-handle-rotate';
        rotateHandle.dataset.role = 'rotate';
        rotateHandle.title = 'Sürükleyerek döndür';
        rotateHandle.innerHTML = `
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 4 21 10 15 10"/>
          </svg>`;
        rotateHandle.addEventListener('mousedown', onHandleMouseDown);
        handlesLayer.appendChild(rotateHandle);

        // A subtle dashed bbox outline that follows the same corners.
        const outline = document.createElement('div');
        outline.className = 'ed-mb-align-bbox';
        handlesLayer.appendChild(outline);
    }

    function getOverlayCorners() {
        // Compute the rotated/scaled/translated bbox corners in lng/lat.
        if (!startBounds) return null;
        const [minLng, minLat, maxLng, maxLat] = startBounds;
        const tx = (lng, lat) => projectBaseToOverlay(lng, lat);

        return {
            nw: tx(minLng, maxLat),
            ne: tx(maxLng, maxLat),
            se: tx(maxLng, minLat),
            sw: tx(minLng, minLat),
            n:  tx((minLng + maxLng) / 2, maxLat),
            center: [overlayCenter.lng, overlayCenter.lat],
        };
    }

    function updateHandlePositions() {
        if (!handlesLayer || !alignMap) return;
        const c = getOverlayCorners();
        if (!c) return;

        // Position corner handles using map.project()
        for (const corner of ['nw', 'ne', 'se', 'sw']) {
            const p = alignMap.project(c[corner]);
            const el = cornerHandles[corner];
            if (el) {
                el.style.left = `${p.x}px`;
                el.style.top  = `${p.y}px`;
            }
        }

        // Rotate handle: 30px above the top-center, in screen space.
        const nProj = alignMap.project(c.n);
        const nwProj = alignMap.project(c.nw);
        const neProj = alignMap.project(c.ne);
        // Rotation handle should sit perpendicular to the top edge.
        const dx = neProj.x - nwProj.x;
        const dy = neProj.y - nwProj.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = -dy / len * 36;       // perpendicular outward
        const oy =  dx / len * 36;
        rotateHandle.style.left = `${nProj.x + ox}px`;
        rotateHandle.style.top  = `${nProj.y + oy}px`;

        // Bbox outline: render a polygon by absolute positioning the corners
        // is awkward; we use a polyline drawn with SVG instead.
        const outline = handlesLayer.querySelector('.ed-mb-align-bbox');
        if (outline) {
            const points = [c.nw, c.ne, c.se, c.sw, c.nw]
                .map(p => alignMap.project(p))
                .map(p => `${p.x},${p.y}`).join(' ');
            outline.innerHTML = `<svg width="100%" height="100%"><polyline points="${points}" fill="none" stroke="rgba(79,70,229,0.85)" stroke-width="1.5" stroke-dasharray="4 4"/></svg>`;
        }
    }

    function onHandleMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        const role = e.currentTarget.dataset.role;
        const corner = e.currentTarget.dataset.corner;
        mode = role;                                          // 'scale' | 'rotate'
        startPointer = { x: e.clientX, y: e.clientY, corner };
        startScale = overlayScale;
        startRotation = overlayRotation;
        startCenter = { ...overlayCenter };

        document.addEventListener('mousemove', onHandleMove);
        document.addEventListener('mouseup', onHandleUp, { once: true });
        handlesLayer.classList.add('is-dragging');
    }

    function onHandleMove(e) {
        if (!mode) return;

        if (mode === 'scale') {
            // Scale = current distance from overlay-center / start distance.
            const centerScreen = alignMap.project([overlayCenter.lng, overlayCenter.lat]);
            const startCornerScreen = alignMap.project(getCornerLngLatAtStart(startPointer.corner));
            const startD = Math.hypot(startCornerScreen.x - centerScreen.x,
                                       startCornerScreen.y - centerScreen.y) || 1;
            const rect = $mapHost.getBoundingClientRect();
            const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const curD = Math.hypot(cur.x - centerScreen.x, cur.y - centerScreen.y) || 1;
            overlayScale = Math.max(0.05, startScale * (curD / startD));
        } else if (mode === 'rotate') {
            const centerScreen = alignMap.project([overlayCenter.lng, overlayCenter.lat]);
            const rect = $mapHost.getBoundingClientRect();
            const cur = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const start = { x: startPointer.x - rect.left, y: startPointer.y - rect.top };
            const a0 = Math.atan2(start.y - centerScreen.y, start.x - centerScreen.x);
            const a1 = Math.atan2(cur.y   - centerScreen.y, cur.x   - centerScreen.x);
            // Negate because screen-y points down while the geojson rotation
            // matrix (and lat axis) points up — without this, dragging the
            // handle clockwise would spin the overlay counter-clockwise.
            let delta = -(a1 - a0) * 180 / Math.PI;
            if (e.shiftKey) delta = Math.round(delta / 15) * 15;
            overlayRotation = startRotation + delta;
        }

        refreshOverlay();
        updateHandlePositions();
        updateInfo();
    }

    function onHandleUp() {
        mode = null;
        document.removeEventListener('mousemove', onHandleMove);
        handlesLayer.classList.remove('is-dragging');
    }

    /** Where the corner started in lng/lat — needed for scale's reference distance. */
    function getCornerLngLatAtStart(corner) {
        if (!startBounds) return [overlayCenter.lng, overlayCenter.lat];
        const [minLng, minLat, maxLng, maxLat] = startBounds;
        const lookup = {
            nw: [minLng, maxLat], ne: [maxLng, maxLat],
            se: [maxLng, minLat], sw: [minLng, minLat],
        };
        const [lng, lat] = lookup[corner];
        return projectBaseToOverlay(lng, lat, {
            center: startCenter,
            scale: startScale,
            rotation: startRotation,
        });
    }

    /* ──────────────────────────────────────────────────────────────────
     * Body drag (translate)
     * ────────────────────────────────────────────────────────────────── */

    let panDragging = false;
    let panStartLngLat = null;
    let panStartCenter = null;

    function attachOverlayDrag() {
        alignMap.on('mousedown', (e) => {
            if (mode) return; // a corner/rotate handle is active
            if (!alignMap.getLayer('overlay-fill')) return;
            const features = alignMap.queryRenderedFeatures(e.point, { layers: ['overlay-fill'] });
            if (!features.length) return;
            e.preventDefault();
            panDragging = true;
            panStartLngLat = e.lngLat;
            panStartCenter = { ...overlayCenter };
            alignMap.getCanvas().style.cursor = 'grabbing';
            alignMap.dragPan.disable();
        });
        alignMap.on('mousemove', (e) => {
            if (!panDragging) return;
            const dlng = e.lngLat.lng - panStartLngLat.lng;
            const dlat = e.lngLat.lat - panStartLngLat.lat;
            overlayCenter = {
                lng: panStartCenter.lng + dlng,
                lat: panStartCenter.lat + dlat,
            };
            refreshOverlay();
            updateHandlePositions();
            updateInfo();
        });
        const stop = () => {
            if (!panDragging) return;
            panDragging = false;
            alignMap.getCanvas().style.cursor = '';
            alignMap.dragPan.enable();
        };
        alignMap.on('mouseup', stop);
        alignMap.on('mouseleave', stop);
    }

    /* ──────────────────────────────────────────────────────────────────
     * Status / info
     * ────────────────────────────────────────────────────────────────── */

    function updateInfo() {
        const finalScale = mbState.scale * overlayScale;
        const finalRot = (mbState.rotation || 0) + overlayRotation;
        $coords.textContent = `lat: ${overlayCenter.lat.toFixed(6)}, lng: ${overlayCenter.lng.toFixed(6)}`;
        $params.textContent = `scale: ${finalScale.toFixed(3)} (×${overlayScale.toFixed(2)}) · rot: ${finalRot.toFixed(1)}° (Δ${overlayRotation.toFixed(1)}°)`;
    }

    $opacity.addEventListener('input', () => {
        const v = Number($opacity.value);
        $opacityVal.textContent = v + '%';
        if (alignMap?.getLayer('overlay-fill')) {
            alignMap.setPaintProperty('overlay-fill', 'fill-opacity', v / 100);
        }
    });

    $searchBtn.addEventListener('click', doSearch);
    $search.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

    async function doSearch() {
        const q = $search.value.trim();
        if (!q) return;
        try {
            const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`);
            const list = await r.json();
            if (!list.length) { app.setStatus('Sonuç yok', 'dirty'); return; }
            const lng = parseFloat(list[0].lon);
            const lat = parseFloat(list[0].lat);
            alignMap.flyTo({ center: [lng, lat], zoom: 17, animate: true });
            overlayCenter = { lng, lat };
            refreshOverlay();
            updateHandlePositions();
            updateInfo();
        } catch (e) {
            app.setStatus('Arama hatası: ' + e.message, 'dirty');
        }
    }

    $apply.addEventListener('click', async () => {
        if (!mbState.svgText || !overlayCenter) return;
        try {
            const newScale = mbState.scale * overlayScale;
            const newRotation = (mbState.rotation || 0) + overlayRotation;
            const newAlignment = {
                centerLat: overlayCenter.lat,
                centerLng: overlayCenter.lng,
                scale:     newScale,
                rotation:  newRotation,
            };

            // Two regimes: override mode only re-converts the active
            // floor, inherit mode updates the shared project alignment
            // and re-converts every other inheriting floor in lockstep.
            const activeKey = mbState.activeFloorKey;
            const overrideMode = mbState.hasFloorAlignmentOverride(activeKey);

            const reprocessed = [];
            const failed = [];

            if (overrideMode) {
                // Floor has its own pinned alignment — write to its
                // override slot and re-convert *only* this floor.
                const activeFloor = mbState.getFloor(activeKey);
                if (activeFloor) {
                    activeFloor.alignmentOverride = { ...newAlignment };
                    await storage.setFloorAlignment(activeKey, activeFloor.alignmentOverride);
                    try {
                        const r = convertSvg(activeFloor.svgText, newAlignment);
                        activeFloor.geojson       = r.geojson;
                        activeFloor.stats         = r.stats;
                        activeFloor.contentExtent = r.contentExtent || activeFloor.contentExtent;
                        await storage.setFloorGeojson(activeKey, r.geojson);
                        await storage.setFloorMeta(activeKey, {
                            svgFilename: activeFloor.svgFilename,
                            svgInfo: activeFloor.svgInfo,
                            stats: activeFloor.stats,
                            contentExtent: activeFloor.contentExtent,
                            heightMode: activeFloor.heightMode,
                            heightScaleAuto: activeFloor.heightScaleAuto,
                        });
                        reprocessed.push(activeKey);
                    } catch (err) {
                        console.error(`[align] re-convert failed for floor ${activeKey}`, err);
                        failed.push(activeKey);
                    }
                }
            } else {
                // Inherit mode — bake into the project alignment and
                // re-convert every floor that *also* inherits. Floors
                // with their own pinned alignment are deliberately left
                // alone (that's the point of override mode).
                _internal_setProjectAlignment(newAlignment);
                await storage.setProjectAlignment(newAlignment);

                for (const f of mbState.listFloors()) {
                    if (!f.svgText) continue;
                    if (f.alignmentOverride) continue; // pinned — skip
                    try {
                        const r = convertSvg(f.svgText, newAlignment);
                        f.geojson       = r.geojson;
                        f.stats         = r.stats;
                        f.contentExtent = r.contentExtent || f.contentExtent;
                        await storage.setFloorGeojson(f.key, r.geojson);
                        await storage.setFloorMeta(f.key, {
                            svgFilename: f.svgFilename,
                            svgInfo: f.svgInfo,
                            stats: f.stats,
                            contentExtent: f.contentExtent,
                            heightMode: f.heightMode,
                            heightScaleAuto: f.heightScaleAuto,
                        });
                        reprocessed.push(f.key);
                    } catch (err) {
                        console.error(`[align] re-convert failed for floor ${f.key}`, err);
                        failed.push(f.key);
                    }
                }
            }

            // Reset live transforms — they have been baked into the
            // affected floor(s).
            overlayScale = 1;
            overlayRotation = 0;

            startBounds = computeBaseBounds(mbState.geojson);
            mbState.emit('geojson-changed');
            refreshOverlay();
            refreshReference();
            updateHandlePositions();
            updateInfo();

            // Push the freshly-converted geojson into the preview iframe
            // so the Settings tab reflects the new alignment without a
            // manual "Önizleme iframe'ine uygula".
            if (reprocessed.length) {
                try { app?.reload?.(['venue.geojsonPath']); } catch {}
            }

            const scope = overrideMode ? 'bu kat' : 'paylaşımlı hizalama';
            const note = reprocessed.length > 1
                ? `Hizalama uygulandı · ${reprocessed.length} kat yeniden işlendi (${scope})`
                : `Hizalama uygulandı (${scope})`;
            app.setStatus(failed.length ? `${note} · ${failed.length} hata` : note,
                          failed.length ? 'dirty' : 'saved');
        } catch (e) {
            app.setStatus('Apply hatası: ' + e.message, 'dirty');
        }
    });
}

/* Mutate the project alignment record in-place — keeps every existing
 * `mbState.projectAlignment` reference (icons.js etc.) pointing at the
 * same object after an Apply. */
function _internal_setProjectAlignment(next) {
    const pa = mbState.projectAlignment;
    pa.centerLat = next.centerLat ?? 0;
    pa.centerLng = next.centerLng ?? 0;
    pa.scale     = next.scale     ?? 0.03;
    pa.rotation  = next.rotation  ?? 0;
}

/* ──────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────── */

function computeBaseBounds(geojson) {
    let minLng =  Infinity, minLat =  Infinity;
    let maxLng = -Infinity, maxLat = -Infinity;
    for (const f of geojson.features) {
        const g = f.geometry;
        if (!g) continue;
        const visit = (c) => {
            if (c[0] < minLng) minLng = c[0];
            if (c[0] > maxLng) maxLng = c[0];
            if (c[1] < minLat) minLat = c[1];
            if (c[1] > maxLat) maxLat = c[1];
        };
        if (g.type === 'Point')             visit(g.coordinates);
        else if (g.type === 'LineString')   g.coordinates.forEach(visit);
        else if (g.type === 'Polygon')      g.coordinates.forEach(r => r.forEach(visit));
        else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(r => r.forEach(visit)));
    }
    if (minLng === Infinity) return [0, 0, 0, 0];
    return [minLng, minLat, maxLng, maxLat];
}
