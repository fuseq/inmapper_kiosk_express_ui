/**
 * Server-side routing — replaces the in-browser pathfinder for production
 * navigation. Endpoints are configured under `config.venue.routing`.
 *
 * Route geometry is resolved on the client by matching API `path.by_floor`
 * `connection_ids` to path/door/portal features in the loaded GeoJSON (same
 * SVG ids as the routing graph). No SVG-pixel → WGS84 conversion for the
 * route polyline.
 */

import { config } from '../../core/config.js';
import { dataStore } from '../../core/state.js';
import { findRoute } from '../map/pathfinder.js';
import { buildRouteFromApiPath } from './route-geometry.js';
import {
    buildRouteDebugReport,
    isRouteDebugEnabled,
    printRouteDebugReport,
} from './route-debug.js';
import {
    describeStepsFromStages,
    normalizeDescribeStages,
} from './route-stages.js';

function routingCfg() {
    return config.venue?.routing || {};
}

export function getRoutingVenueSlug() {
    const slug = routingCfg().venueSlug;
    if (slug) return String(slug).trim();
    const name = config.venue?.name || 'venue';
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'venue';
}

/**
 * Internal floor key (`0`, `-1`, …) from a location / route point.
 * Sheets and UI may store display names (`Zemin Kat`); GeoJSON uses keys.
 */
export function resolveFloorKey(point) {
    if (!point) return '';

    if (point.floorKey != null && point.floorKey !== '') {
        return String(point.floorKey);
    }

    const raw = point.floor;
    if (raw == null || raw === '') return '';

    const s = String(raw).trim();
    if (/^-?\d+$/.test(s)) return s;

    const kat = /^Kat\s*(-?\d+)$/i.exec(s);
    if (kat) return kat[1];

    const map = config.venue?.floorMap || {};
    for (const [key, name] of Object.entries(map)) {
        if (String(name).trim() === s) return String(key);
    }

    return s;
}

/** Routing API `start_floor` / `end_floor` — always `Kat {key}` (e.g. `Kat 0`). */
export function resolveFloorLabel(point) {
    const key = resolveFloorKey(point);
    if (key === '') return '';
    if (/^-?\d+$/.test(key)) return `Kat ${key}`;
    return key;
}

export function resolveUnitId(point) {
    if (point?.id == null || point.id === '') return '';
    const id = String(point.id);
    if (id === '__dropped_pin__') return '';
    return id;
}

export function buildRouteId(startFloor, startId, endFloor, endId) {
    return `${startFloor}_Shop_${startId}_to_${endFloor}_Shop_${endId}`;
}

/** UI keys → API `route_type`. */
export function mapRouteType(type) {
    if (type === 'least_turns') return 'least_turns';
    return 'shortest';
}

function findLocationById(id) {
    if (id == null || id === '') return null;
    return dataStore.locations.find(l => String(l.id) === String(id)) || null;
}

export function resolveRoutePoint(pointOrId) {
    if (!pointOrId) return null;
    if (typeof pointOrId === 'object' && pointOrId.id != null) {
        const loc = findLocationById(pointOrId.id);
        if (loc) return loc;
        return pointOrId;
    }
    return findLocationById(pointOrId);
}

function parseTransitions(body) {
    const raw = body?.transitions || body?.floor_changes || body?.portals;
    const fromInstructions = Array.isArray(body?.instructions)
        ? body.instructions.filter(i => i.kind === 'floor_change')
        : [];
    const merged = Array.isArray(raw) ? [...raw] : [];
    for (const i of fromInstructions) {
        merged.push({
            type: i.portal_type || i.type || 'Elev',
            stack: i.stack ?? 0,
            to_floor: i.to_floor ?? i.toFloor,
            target_floor: i.to_floor ?? i.toFloor,
        });
    }
    return merged.map(t => ({
        type: t.type || t.portal_type || 'Elev',
        stack: t.stack ?? t.portal_stack ?? 0,
        toFloor: String(t.to_floor ?? t.toFloor ?? t.target_floor ?? ''),
    })).filter(t => t.toFloor);
}

function detectGeojsonSource() {
    if (typeof window !== 'undefined' && window.__previewAssets?.geojson) return 'editor_preview_indexeddb';
    return config.venue?.geojsonPath || 'file';
}

function normalizeRouteResponse(body, meta, geojson) {
    const startFloor = meta.start_floor;
    const endFloor = meta.end_floor;
    const startId = meta.start_id;
    const endId = meta.end_id;
    const routeId = body?.route_id
        || body?.routeId
        || buildRouteId(startFloor, startId, endFloor, endId);

    let coordinates = [];
    let lineStrings = [];
    let legs = [];
    let segments = [];
    let transitions = [];
    let missingIds = [];
    let coordSource = 'none';
    let built = null;

    if (geojson?.features?.length && body?.path) {
        built = buildRouteFromApiPath(geojson, body.path);
        coordinates = built.coordinates;
        lineStrings = built.lineStrings || [];
        legs = built.legs || [];
        segments = built.segments;
        transitions = built.transitions;
        missingIds = built.missingIds;
        coordSource = built.source;

        if (missingIds.length) {
            console.warn(
                '[route-api] connection_ids missing from GeoJSON paths/doors:',
                missingIds.length,
                'of',
                built.stats?.totalIds ?? '?',
                'sample:',
                missingIds.slice(0, 5),
            );
        }
    }

    const hasLines = legs.some(l => l.coords?.length >= 2)
        || lineStrings.some(l => l.length >= 2)
        || coordinates.length >= 2;
    const debugReport = buildRouteDebugReport({
        geojson,
        apiBody: body,
        meta,
        built,
        geojsonSource: detectGeojsonSource(),
    });

    if (!hasLines) {
        printRouteDebugReport(debugReport, { failed: true });
        throw new Error(
            'Rota haritada çizilemedi: API connection_ids, GeoJSON paths/doors/portals ile eşleşmedi. ' +
            'Konsolda [route-debug] grubunu açın; copy(JSON.stringify(window.__lastRouteDebugReport, null, 2)) ile raporu paylaşın.',
        );
    }

    if (isRouteDebugEnabled() || missingIds.length) {
        printRouteDebugReport(debugReport, { failed: false });
    }

    const apiTransitions = parseTransitions(body);
    if (!transitions.length && apiTransitions.length) {
        transitions = apiTransitions;
    }

    return {
        coordinates,
        lineStrings,
        legs,
        distance: Number(
            body?.distance_meters
            ?? body?.distance
            ?? body?.total_distance
            ?? body?.path?.total_distance_meters
            ?? body?.length
            ?? 0,
        ) || 0,
        segments,
        transitions,
        routeId,
        routeType: meta.route_type,
        coordSource,
        missingIds,
        raw: body,
    };
}

const ACTION_ICON_MAP = {
    start: 'stepStart',
    arrive: 'stepEnd',
    end: 'stepEnd',
    turn_right: 'stepRight',
    turn_left: 'stepLeft',
    floor_change: 'stepElevator',
    start_portal: 'stepStraight',
    pass_by: 'stepStraight',
    veer: 'stepStraight',
    straight: 'stepStraight',
};

function mapActionIcon(action) {
    if (!action) return 'stepStraight';
    const k = String(action).toLowerCase().replace(/[^a-z_]/g, '_');
    return ACTION_ICON_MAP[k] || 'stepStraight';
}

function normalizeDescribeSteps(body) {
    const stages = normalizeDescribeStages(body);
    if (stages.length) {
        return describeStepsFromStages(stages);
    }

    const descriptions = body?.descriptions;
    if (Array.isArray(descriptions) && descriptions.length) {
        return descriptions.map((s, i) => ({
            icon: mapActionIcon(s.action) || (i === 0 ? 'stepStart' : 'stepStraight'),
            text: s.description || s.text || String(s),
            action: s.action,
            floor: s.floor,
        })).filter(s => s.text);
    }

    const instructions = body?.instructions;
    if (Array.isArray(instructions) && instructions.length) {
        return instructions.map((s, i) => ({
            icon: mapActionIcon(s.action || s.kind) || (i === 0 ? 'stepStart' : 'stepStraight'),
            text: s.description || s.text || s.instruction || String(s),
        })).filter(s => s.text);
    }

    const raw = body?.steps
        || body?.directions
        || body?.turn_by_turn
        || [];
    if (!Array.isArray(raw)) return [];
    return raw.map((s, i) => {
        if (typeof s === 'string') {
            return { icon: i === 0 ? 'stepStart' : 'stepStraight', text: s };
        }
        return {
            icon: mapActionIcon(s.action || s.icon || s.type),
            text: s.text || s.instruction || s.message || s.description || String(s),
        };
    }).filter(s => s.text);
}

export async function fetchRouteFromApi({
    startPoint,
    endPoint,
    routeType = 'shortest',
    geojson = null,
} = {}) {
    const url = routingCfg().routeUrl || 'http://localhost:5002/api/route';
    const start = resolveRoutePoint(startPoint);
    const end = resolveRoutePoint(endPoint);
    if (!start || !end) throw new Error('Başlangıç veya hedef birimi bulunamadı');

    if (!geojson?.features?.length) {
        throw new Error('Harita GeoJSON yüklü değil; rota çizilemez');
    }

    const start_floor = resolveFloorLabel(start);
    const end_floor = resolveFloorLabel(end);
    const start_id = resolveUnitId(start);
    const end_id = resolveUnitId(end);
    if (!start_id || !end_id) throw new Error('Birim kimliği (ID) eksik');

    const mappedType = mapRouteType(routeType);
    const payload = {
        venue: getRoutingVenueSlug(),
        start_floor,
        start_id,
        end_floor,
        end_id,
        route_type: mappedType,
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        let detail = '';
        try {
            const errBody = await res.json();
            detail = errBody?.message || errBody?.error || '';
        } catch { /* ignore */ }
        throw new Error(detail || `Rota API HTTP ${res.status}`);
    }

    const body = await res.json();

    if (isRouteDebugEnabled()) {
        console.groupCollapsed('[route-debug] API isteği / yanıt özeti');
        console.log('POST', url);
        console.log('payload', payload);
        console.log('response keys', Object.keys(body || {}));
        console.log('path.by_floor', body?.path?.by_floor?.map(b => ({
            floor: b.floor,
            ids: (b.connection_ids || []).length,
        })));
        console.groupEnd();
    }

    const route = normalizeRouteResponse(body, {
        start_floor,
        start_id,
        end_floor,
        end_id,
        route_type: mappedType,
    }, geojson);

    return route;
}

/**
 * Browser-side routing fallback. Used when the routing API
 * (`config.venue.routing.routeUrl`) is unreachable or errors out. Computes
 * the route with the in-browser pathfinder (Dijkstra over the GeoJSON
 * paths/doors/portals graph, already built by map-renderer) and reshapes
 * the result so it matches what `fetchRouteFromApi` returns — the route
 * display pipeline consumes it identically.
 *
 * Limitation: the pathfinder only optimises distance, so `least_turns`
 * resolves to the same shortest path here (the full turn-aware port is
 * deliberately shelved). No turn-by-turn descriptions are produced.
 */
export function buildLocalRoute({ startPoint, endPoint, routeType = 'shortest' } = {}) {
    const start = resolveRoutePoint(startPoint);
    const end = resolveRoutePoint(endPoint);
    if (!start || !end) throw new Error('Başlangıç veya hedef birimi bulunamadı');

    const startId = resolveUnitId(start);
    const endId = resolveUnitId(end);
    if (!startId || !endId) throw new Error('Birim kimliği (ID) eksik');

    const result = findRoute(startId, endId);
    if (!result || !(result.coordinates?.length >= 2)) {
        throw new Error('Yerel rota bulunamadı');
    }

    const segments = result.segments || [];
    const lineStrings = segments.map(s => s.coords).filter(c => c?.length >= 2);
    const legs = segments
        .filter(s => s.coords?.length >= 2)
        .map((s, i) => ({ floor: s.floor, coords: s.coords, legIndex: i }));

    return {
        coordinates: result.coordinates,
        lineStrings,
        legs,
        distance: Number(result.distance) || 0,
        segments,
        transitions: result.transitions || [],
        routeId: buildRouteId(
            resolveFloorLabel(start), startId,
            resolveFloorLabel(end), endId,
        ),
        routeType: mapRouteType(routeType),
        coordSource: 'local',
        missingIds: [],
        _local: true,
        raw: null,
    };
}

/**
 * Map of unit id → "Title Subtitle" from the Sheets-matched locations. Sent
 * with /api/describe so the backend renders real store names in the human
 * descriptions instead of "Type - ID" graph references.
 */
function buildIdLabels() {
    const out = {};
    for (const loc of (dataStore.locations || [])) {
        const id = resolveUnitId(loc);
        if (!id) continue;
        const title = String(loc.name || '').trim();
        const subtitle = String(loc.subtitle || '').trim();
        const label = subtitle ? `${title} ${subtitle}`.trim() : title;
        if (label) out[id] = label;
    }
    return out;
}

export async function fetchDescribeFromApi({ routeId, routeType = 'shortest' } = {}) {
    const url = routingCfg().describeUrl || 'http://localhost:5002/api/describe';
    if (!routeId) throw new Error('route_id eksik');

    const payload = {
        venue: getRoutingVenueSlug(),
        route_id: routeId,
        route_type: mapRouteType(routeType),
        labels: buildIdLabels(),
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        let detail = '';
        try {
            const errBody = await res.json();
            detail = errBody?.message || errBody?.error || '';
        } catch { /* ignore */ }
        throw new Error(detail || `Tarif API HTTP ${res.status}`);
    }

    const body = await res.json();
    const stages = normalizeDescribeStages(body);
    const steps = stages.length
        ? describeStepsFromStages(stages)
        : normalizeDescribeSteps(body);
    if (!steps.length) throw new Error('Tarif API adım döndürmedi');

    /* Backend usually resolves "Type - IDxxx" graph refs to store names, but
     * the start stage sometimes slips through as a raw id. Substitute any
     * leftover id tokens with the human label as a frontend safety net. */
    const labelMap = payload.labels || {};
    for (const s of steps) s.text = humanizeDescription(s.text, labelMap);

    return { steps, stages, raw: body };
}

/* Replace "Type - IDxxx" and bare "IDxxx" tokens with the human label. */
function humanizeDescription(text, labelMap) {
    if (!text || !labelMap) return text;
    let out = String(text);
    // "Shop - ID034" → label (drop the leading type word)
    out = out.replace(/[A-Za-zÇĞİÖŞÜçğıöşü0-9]+\s*[-–]\s*(ID-?\d+)/g, (m, id) => labelMap[id] || m);
    // bare "ID034" (optionally with an attached apostrophe suffix)
    out = out.replace(/\b(ID-?\d+)\b/g, (m, id) => labelMap[id] || m);
    return out;
}
