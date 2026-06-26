/**
 * Route visualization from API `path.by_floor[].connection_ids` only.
 *
 * Each id is resolved to paths / doors / portals LineStrings in the
 * SVG-derived GeoJSON (same element id). No SVG-pixel conversion.
 */

import { config } from '../../core/config.js';
import { parsePortalName } from '../map/portal-matcher.js';

/** SVG line layers used by the routing graph (same ids as API). */
const ROUTE_LAYERS = new Set(['paths', 'doors', 'portals']);

function isPortalId(id) {
    return /^(Elev|Stairs)\./i.test(String(id));
}

const CONNECT_EPS_M = 3;

function coordFrag(c) {
    return c[0].toFixed(8) + ',' + c[1].toFixed(8);
}

function haversineM(a, b) {
    const toRad = x => x * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function endpointsNear(a, b, maxM = CONNECT_EPS_M) {
    return haversineM(a, b) <= maxM;
}

/** API floor label ("Kat 0") → GeoJSON `properties.floor` key. */
export function resolveFloorKeyFromLabel(label) {
    const trimmed = String(label ?? '').trim();
    if (!trimmed) return '0';

    const map = config.venue?.floorMap || {};
    for (const [key, name] of Object.entries(map)) {
        if (String(name).trim() === trimmed) return String(key);
    }

    const kat = /^Kat\s*(-?\d+)$/i.exec(trimmed);
    if (kat) return kat[1];

    if (/^-?\d+$/.test(trimmed)) return trimmed;
    return trimmed;
}

function connectionIdVariants(id) {
    const s = String(id);
    const variants = new Set([s, s.toLowerCase()]);
    const stripped = s.replace(/_\d+_$/, '');
    if (stripped !== s) {
        variants.add(stripped);
        variants.add(stripped.toLowerCase());
    }
    // API shop ids (ID020) ↔ SVG door lines (ID020_1_)
    if (/^ID[-_]?\w/i.test(s) && !/_\d+_$/.test(s)) {
        variants.add(`${s}_1_`);
        variants.add(`${s}_2_`);
    }
    return [...variants];
}

function buildNavFeatureIndex(geojson) {
    const byFloorId = new Map();
    if (!geojson?.features) return byFloorId;

    for (const f of geojson.features) {
        const layer = f.properties?.layer;
        if (!ROUTE_LAYERS.has(layer)) continue;
        const rawId = f.properties?.id;
        if (rawId == null || rawId === '') continue;
        const floor = String(f.properties?.floor ?? '0');

        for (const vid of connectionIdVariants(rawId)) {
            const fk = `${floor}|${vid}`;
            if (!byFloorId.has(fk)) byFloorId.set(fk, f);
        }
    }
    return byFloorId;
}

/**
 * Paths/doors: same floor only. Portals (Elev.* / Stairs.*): match id on any
 * floor — SVG tags the portal on one sheet but API lists it per traversed floor.
 */
function lookupRouteFeature(index, connectionId, floorKey) {
    const variants = connectionIdVariants(connectionId);
    for (const vid of variants) {
        const feat = index.get(`${floorKey}|${vid}`);
        if (feat) return feat;
    }
    if (isPortalId(connectionId)) {
        for (const vid of variants) {
            for (const [key, feat] of index) {
                if (key.endsWith(`|${vid}`)) return feat;
            }
        }
    }
    return null;
}

function orientCoords(coords, prev) {
    if (!coords || coords.length < 2) return coords ? coords.slice() : [];
    if (!prev) return coords.slice();
    const a = coords[0];
    const b = coords[coords.length - 1];
    if (endpointsNear(a, prev)) return coords.slice();
    if (endpointsNear(b, prev)) return coords.slice().reverse();
    return coords.slice();
}

function appendSegment(buf, coords) {
    if (!coords || coords.length < 2) return false;

    if (!buf.length) {
        for (const c of coords) {
            if (!buf.length || coordFrag(c) !== coordFrag(buf[buf.length - 1])) buf.push(c);
        }
        return true;
    }

    const prev = buf[buf.length - 1];
    const oriented = orientCoords(coords, prev);
    if (!endpointsNear(prev, oriented[0]) && !endpointsNear(prev, oriented[oriented.length - 1])) {
        return false;
    }

    const start = endpointsNear(prev, oriented[0]) ? 1 : 0;
    for (let i = start; i < oriented.length; i++) {
        const c = oriented[i];
        if (!buf.length || coordFrag(c) !== coordFrag(buf[buf.length - 1])) buf.push(c);
    }
    return true;
}

function portalTypeFromEdge(edge) {
    if (!edge) return 'Elev';
    const id = String(edge.id || edge.type || '');
    if (/^stairs/i.test(id) || edge.type === 'stairs') return 'Stairs';
    return 'Elev';
}

function portalStackFromEdge(edge) {
    const parsed = parsePortalName(edge?.id);
    return parsed?.stack ?? 0;
}

/**
 * Build one or more connected polylines for a floor from ordered connection ids.
 */
function buildFloorChains(connectionIds, floorKey, index) {
    const chains = [];
    let buf = [];

    for (const cid of connectionIds) {
        const feat = lookupRouteFeature(index, cid, floorKey);
        const coords = feat?.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;

        if (!buf.length) {
            appendSegment(buf, coords);
            continue;
        }

        const prev = buf[buf.length - 1];
        const oriented = orientCoords(coords, prev);
        const connected = endpointsNear(prev, oriented[0]) || endpointsNear(prev, oriented[oriented.length - 1]);

        if (!connected) {
            if (buf.length >= 2) chains.push(buf);
            buf = [];
            appendSegment(buf, coords);
            continue;
        }

        appendSegment(buf, oriented);
    }

    if (buf.length >= 2) chains.push(buf);
    return chains;
}

function pickPrimaryLine(lineStrings) {
    if (!lineStrings?.length) return [];
    return lineStrings.reduce((best, cur) => (cur.length > best.length ? cur : best), lineStrings[0]);
}

function countNavOnFloor(geojson, floorKey) {
    if (!geojson?.features) return 0;
    let n = 0;
    for (const f of geojson.features) {
        if (!ROUTE_LAYERS.has(f.properties?.layer)) continue;
        if (String(f.properties?.floor ?? '0') === String(floorKey)) n++;
    }
    return n;
}

/**
 * @param {object} geojson
 * @param {object} apiPath — `body.path`
 */
export function buildRouteFromApiPath(geojson, apiPath) {
    // Multi-floor routes expose `path.by_floor[]`; single-floor routes expose a
    // flat `path.connection_ids` + `path.floor`. Normalize both to by_floor.
    let byFloor = apiPath?.by_floor;
    if (!Array.isArray(byFloor) || byFloor.length === 0) {
        const flatIds = apiPath?.connection_ids;
        if (Array.isArray(flatIds) && flatIds.length) {
            byFloor = [{
                floor: apiPath.floor ?? '0',
                connection_ids: flatIds,
                edges: apiPath.edges || [],
            }];
        } else {
            return {
                coordinates: [],
                lineStrings: [],
                legs: [],
                segments: [],
                transitions: [],
                missingIds: [],
                source: 'none',
                stats: { matched: 0, totalIds: 0 },
            };
        }
    }

    const index = buildNavFeatureIndex(geojson);
    const segments = [];
    const legs = [];
    const transitions = [];
    const missingIds = [];
    const allLineStrings = [];
    const stats = { matched: 0, totalIds: 0 };

    for (let fi = 0; fi < byFloor.length; fi++) {
        const bf = byFloor[fi];
        const floorKey = resolveFloorKeyFromLabel(bf.floor);
        const floorLabel = bf.floor;
        const ids = bf.connection_ids || [];
        const edgeById = new Map((bf.edges || []).map(e => [String(e.id), e]));
        stats.totalIds += ids.length;

        for (const cid of ids) {
            const feat = lookupRouteFeature(index, cid, floorKey);
            const coords = feat?.geometry?.coordinates;
            if (coords && coords.length >= 2) {
                stats.matched++;
                legs.push({
                    legIndex: legs.length,
                    floor: floorKey,
                    floorLabel,
                    connectionId: String(cid),
                    coords: coords.slice(),
                });
            } else {
                missingIds.push({ floor: floorKey, floorLabel, id: String(cid) });
            }
        }

        const chains = buildFloorChains(ids, floorKey, index);
        for (const coords of chains) {
            allLineStrings.push(coords);
            segments.push({
                floor: floorKey,
                floorLabel,
                coords,
                connectionIds: ids,
            });
        }

        if (!chains.length && ids.length) {
            console.warn(
                `[route-geometry] "${floorLabel}" (key ${floorKey}): bağlantı zinciri oluşturulamadı.`,
                `${missingIds.filter(m => m.floorLabel === floorLabel).length}/${ids.length} id GeoJSON paths/doors içinde yok;`,
                `bu katta path/door sayısı: ${countNavOnFloor(geojson, floorKey)}`,
            );
        }

        const nextBf = byFloor[fi + 1];
        if (nextBf) {
            const lastId = ids[ids.length - 1];
            transitions.push({
                type: portalTypeFromEdge(edgeById.get(String(lastId))),
                stack: portalStackFromEdge(edgeById.get(String(lastId))),
                toFloor: resolveFloorKeyFromLabel(nextBf.floor),
                toFloorLabel: nextBf.floor,
                atIndex: segments.length,
                portalId: lastId ? String(lastId) : '',
            });
        }
    }

    const coordinates = pickPrimaryLine(allLineStrings);

    return {
        coordinates,
        lineStrings: allLineStrings,
        legs,
        segments,
        transitions,
        missingIds,
        source: coordinates.length >= 2 ? 'geojson_ids' : 'none',
        stats,
    };
}
