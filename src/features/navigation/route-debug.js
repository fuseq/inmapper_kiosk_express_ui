/**
 * Route ↔ GeoJSON matching diagnostics.
 *
 * Enable verbose logs anytime:
 *   URL: ?routeDebug=1
 *   Console: localStorage.setItem('routeDebug', '1')
 *   Config: config.venue.routing.debug = true
 *
 * On failure, a full report is always printed. Copy for support:
 *   copy(JSON.stringify(window.__lastRouteDebugReport, null, 2))
 */

import { config } from '../../core/config.js';
import { resolveFloorKeyFromLabel } from './route-geometry.js';

const ROUTE_LAYERS = new Set(['paths', 'doors', 'portals']);
const LAYER_KEYS = ['paths', 'doors', 'portals', 'rooms', 'writing'];

export function isRouteDebugEnabled() {
    if (config.venue?.routing?.debug === true) return true;
    try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('routeDebug') === '1') {
            return true;
        }
        if (typeof window !== 'undefined') {
            const p = new URLSearchParams(window.location.search);
            if (p.get('routeDebug') === '1') return true;
        }
    } catch { /* ignore */ }
    return false;
}

function connectionIdVariants(id) {
    const s = String(id);
    const variants = new Set([s, s.toLowerCase()]);
    const stripped = s.replace(/_\d+_$/, '');
    if (stripped !== s) {
        variants.add(stripped);
        variants.add(stripped.toLowerCase());
    }
    if (/^ID[-_]?\w/i.test(s) && !/_\d+_$/.test(s)) {
        variants.add(`${s}_1_`);
        variants.add(`${s}_2_`);
    }
    return [...variants];
}

function isPortalId(id) {
    return /^(Elev|Stairs)\./i.test(String(id));
}

function summarizeGeoJson(geojson) {
    const layerCounts = {};
    const navByFloor = {};
    const navIdsByFloor = {};
    const floorsSeen = new Set();

    if (!geojson?.features) {
        return {
            featureCount: 0,
            layerCounts,
            navByFloor,
            navIdsByFloor,
            floorsSeen: [],
        };
    }

    for (const f of geojson.features) {
        const layer = f.properties?.layer || 'unknown';
        layerCounts[layer] = (layerCounts[layer] || 0) + 1;
        const floor = String(f.properties?.floor ?? '0');
        floorsSeen.add(floor);

        if (!ROUTE_LAYERS.has(layer)) continue;
        navByFloor[floor] = (navByFloor[floor] || 0) + 1;
        if (!navIdsByFloor[floor]) navIdsByFloor[floor] = [];
        const id = f.properties?.id;
        if (id != null && id !== '') navIdsByFloor[floor].push(String(id));
    }

    for (const floor of Object.keys(navIdsByFloor)) {
        navIdsByFloor[floor] = [...new Set(navIdsByFloor[floor])].sort();
    }

    return {
        featureCount: geojson.features.length,
        layerCounts,
        navByFloor,
        navIdsByFloor,
        floorsSeen: [...floorsSeen].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)),
    };
}

function findSimilarOnFloor(navIds, wantedId, limit = 8) {
    const want = String(wantedId).toLowerCase();
    const out = [];
    for (const id of navIds) {
        const low = id.toLowerCase();
        if (low === want) continue;
        if (low.includes(want) || want.includes(low)) out.push(id);
        if (out.length >= limit) break;
    }
    return out;
}

function findIdOnOtherFloors(navIdsByFloor, floorKey, wantedId) {
    const variants = new Set(connectionIdVariants(wantedId));
    const hits = [];
    for (const [floor, ids] of Object.entries(navIdsByFloor)) {
        if (floor === floorKey) continue;
        for (const id of ids) {
            if (variants.has(id) || variants.has(id.toLowerCase())) {
                hits.push({ floor, id });
            }
        }
    }
    return hits.slice(0, 10);
}

function lookupOnFloor(navIdsByFloor, floorKey, connectionId) {
    const ids = navIdsByFloor[floorKey] || [];
    const variants = connectionIdVariants(connectionId);
    for (const vid of variants) {
        if (ids.includes(vid)) return { found: true, matchedId: vid, matchedFloor: floorKey };
    }
    if (isPortalId(connectionId)) {
        for (const [floor, floorIds] of Object.entries(navIdsByFloor)) {
            for (const vid of variants) {
                if (floorIds.includes(vid)) {
                    return { found: true, matchedId: vid, matchedFloor: floor };
                }
            }
        }
    }
    return { found: false, matchedId: null, matchedFloor: null };
}

function summarizeApiPath(apiPath) {
    if (!apiPath) return { byFloor: [] };
    const byFloor = (apiPath.by_floor || []).map(bf => ({
        floorLabel: bf.floor,
        resolvedFloorKey: resolveFloorKeyFromLabel(bf.floor),
        connectionIdCount: (bf.connection_ids || []).length,
        connectionIds: (bf.connection_ids || []).slice(),
        edgeCount: (bf.edges || []).length,
        pointCount: (bf.points || []).length,
    }));
    return { byFloor, hasPoints: !!apiPath.points };
}

/**
 * @param {object} opts
 */
export function buildRouteDebugReport({
    geojson,
    apiBody,
    meta,
    built,
    geojsonSource = 'unknown',
} = {}) {
    const geoSummary = summarizeGeoJson(geojson);
    const apiPath = summarizeApiPath(apiBody?.path);
    const floorMap = { ...(config.venue?.floorMap || {}) };

    const floorLookups = [];

    for (const bf of apiPath.byFloor) {
        const lookups = [];
        for (const cid of bf.connectionIds) {
            const onFloor = lookupOnFloor(geoSummary.navIdsByFloor, bf.resolvedFloorKey, cid);
            lookups.push({
                connectionId: cid,
                foundOnFloor: onFloor.found,
                matchedGeoJsonId: onFloor.matchedId,
                matchedGeoJsonFloor: onFloor.matchedFloor,
                sameIdOtherFloors: findIdOnOtherFloors(
                    geoSummary.navIdsByFloor,
                    bf.resolvedFloorKey,
                    cid,
                ),
                similarOnFloor: onFloor.found
                    ? []
                    : findSimilarOnFloor(
                        geoSummary.navIdsByFloor[bf.resolvedFloorKey] || [],
                        cid,
                    ),
            });
        }

        const navCount = geoSummary.navByFloor[bf.resolvedFloorKey] || 0;
        const matched = lookups.filter(l => l.foundOnFloor).length;

        floorLookups.push({
            apiFloorLabel: bf.floorLabel,
            resolvedFloorKey: bf.resolvedFloorKey,
            navFeaturesOnFloor: navCount,
            connectionIdsTotal: bf.connectionIdCount,
            connectionIdsMatched: matched,
            connectionIdsMissing: bf.connectionIdCount - matched,
            sampleGeoJsonIdsOnFloor: (geoSummary.navIdsByFloor[bf.resolvedFloorKey] || []).slice(0, 15),
            lookups,
        });
    }

    const diagnosis = [];
    const totalNav = Object.values(geoSummary.navByFloor).reduce((a, b) => a + b, 0);
    if (totalNav === 0) {
        diagnosis.push('GeoJSON\'da paths/doors katmanı yok veya boş — Harita sekmesinde SVG işleyin.');
    }
    if (geoSummary.layerCounts.portals > 0 && (geoSummary.navByFloor['0'] || 0) === 0) {
        diagnosis.push('portals var ama paths/doors zemin katta yok — kat anahtarı veya SVG export kontrol edin.');
    }
    for (const fl of floorLookups) {
        if (fl.navFeaturesOnFloor === 0 && fl.connectionIdsTotal > 0) {
            diagnosis.push(
                `API kat "${fl.apiFloorLabel}" → key "${fl.resolvedFloorKey}" için GeoJSON\'da 0 path/door; `
                + `floorMap veya kat anahtarı uyuşmuyor olabilir.`,
            );
        }
        if (fl.connectionIdsMatched === 0 && fl.connectionIdsTotal > 0) {
            const other = fl.lookups.flatMap(l => l.sameIdOtherFloors);
            if (other.length) {
                diagnosis.push(
                    `Kat "${fl.apiFloorLabel}": id\'ler başka katlarda bulundu (${other.map(o => `${o.id}@${o.floor}`).join(', ')}); `
                    + 'floorMap / properties.floor eşlemesini kontrol edin.',
                );
            } else {
                diagnosis.push(
                    `Kat "${fl.apiFloorLabel}": hiçbir connection_id GeoJSON paths/doors ile eşleşmedi; `
                    + 'routing API farklı SVG/venue kullanıyor olabilir.',
                );
            }
        }
        if (fl.connectionIdsMatched > 0 && (built?.lineStrings?.length || 0) === 0) {
            diagnosis.push(
                `Kat "${fl.apiFloorLabel}": id\'ler bulundu ama zincir bağlanamadı (bitişik segmentler 3m içinde değil).`,
            );
        }
    }

    return {
        _copyHint: 'copy(JSON.stringify(window.__lastRouteDebugReport, null, 2))',
        timestamp: new Date().toISOString(),
        venue: {
            slug: config.venue?.routing?.venueSlug,
            floorMap,
            geojsonPath: config.venue?.geojsonPath,
        },
        request: meta ? {
            start_floor: meta.start_floor,
            start_id: meta.start_id,
            end_floor: meta.end_floor,
            end_id: meta.end_id,
            route_type: meta.route_type,
        } : null,
        geojsonSource,
        geojson: geoSummary,
        api: {
            route_id: apiBody?.route_id,
            is_multi_floor: apiBody?.is_multi_floor,
            path: apiPath,
        },
        build: built ? {
            coordSource: built.source,
            stats: built.stats,
            lineStringCount: built.lineStrings?.length ?? 0,
            coordinatePointCount: built.coordinates?.length ?? 0,
            missingIds: built.missingIds,
        } : null,
        floorLookups,
        diagnosis,
    };
}

export function printRouteDebugReport(report, { failed = false } = {}) {
    if (typeof window !== 'undefined') {
        window.__lastRouteDebugReport = report;
    }

    const title = failed
        ? '[route-debug] ROTA ÇİZİLEMEDİ — raporu kopyalayıp paylaşın'
        : '[route-debug] Rota eşleştirme raporu';

    console.groupCollapsed(title);
    console.log('Kopyala:', report._copyHint);
    console.log(JSON.stringify(report, null, 2));
    if (report.diagnosis?.length) {
        console.warn('Teşhis:', report.diagnosis);
    }
    for (const fl of report.floorLookups || []) {
        const missing = fl.lookups.filter(l => !l.foundOnFloor);
        if (!missing.length) continue;
        console.table(missing.map(l => ({
            connectionId: l.connectionId,
            otherFloors: l.sameIdOtherFloors.map(o => `${o.id}@${o.floor}`).join(', ') || '—',
            similar: l.similarOnFloor.join(', ') || '—',
        })));
    }
    console.groupEnd();
}
