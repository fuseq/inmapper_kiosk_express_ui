/**
 * @inmapper/route-engine — public API.
 *
 * Standalone, dependency-free indoor routing. Build a venue from floor SVGs
 * once, then query routes (shortest / least_turns / accessible) with metric,
 * step-by-step directions.
 *
 *   import { createVenue, computeRoute, computeRoutes } from '@inmapper/route-engine';
 */

import { parseFloorSvg } from './svg-parse.js';
import { Graph } from './graph.js';
import { dijkstraWithCustomCost } from './dijkstra.js';
import { buildPathPoints } from './path-points.js';
import { detectTurns } from './turns.js';
import { combineSegments } from './multi-floor.js';
import { parsePortalName, planFloorTransitions } from './portals.js';
import { pointToSegment } from './geometry.js';

export const ROUTE_TYPES = ['shortest', 'least_turns', 'accessible'];

function costTypeFor(routeType) {
    return routeType === 'least_turns' ? 'turns' : 'distance';
}
function allowedPortalTypesFor(routeType) {
    return routeType === 'accessible' ? ['Elev'] : null;
}

/* ---- venue construction ------------------------------------------------ */

function flattenRooms(roomsByType) {
    const flat = [];
    const byId = new Map();
    for (const [type, rooms] of Object.entries(roomsByType)) {
        for (const room of rooms) {
            const tagged = { ...room, type };
            flat.push(tagged);
            byId.set(room.id, tagged);
        }
    }
    return { flat, byId };
}

function collectPortals(graph) {
    const portals = [];
    for (const conn of graph.connections) {
        if (conn.type !== 'portal') continue;
        const parsed = parsePortalName(conn.id);
        if (!parsed) continue;   // Stop.* portals are intra-floor, skip here
        portals.push({
            id: conn.id,
            parsed,
            connIndex: conn._index,
            point: [(conn.x1 + conn.x2) / 2, (conn.y1 + conn.y2) / 2],
        });
    }
    return portals;
}

/**
 * Build a reusable venue model from floor SVGs.
 *
 * @param {object} args
 * @param {Array<{name:string, svgText:string}>} args.floors
 * @param {number} [args.pixelToMeter=0.1]
 * @param {Array}  [args.portalStatuses]
 * @returns {object} venue
 */
export function createVenue({ floors, pixelToMeter = 0.1, portalStatuses = [] } = {}) {
    if (!Array.isArray(floors) || !floors.length) {
        throw new Error('createVenue: `floors` (en az bir kat) gereklidir');
    }

    const built = floors.map((f, i) => {
        const layerId = f.layerId != null ? String(f.layerId) : String(i);
        const { connections, roomsByType } = parseFloorSvg(f.svgText, {
            layerId,
            portalStatuses,
        });
        const graph = new Graph().addConnections(connections);
        graph.findIntersections();
        const { flat, byId } = flattenRooms(roomsByType);
        return {
            name: f.name,
            layerId,
            graph,
            roomsByType,
            rooms: flat,
            roomsById: byId,
            portals: collectPortals(graph),
        };
    });

    const floorByName = new Map(built.map(fl => [fl.name, fl]));
    const portalsByFloor = {};
    for (const fl of built) portalsByFloor[fl.name] = fl.portals;

    return {
        floors: built,
        floorByName,
        portalsByFloor,
        pixelToMeter,
    };
}

/* ---- connection resolution -------------------------------------------- */

function nearestConnectionIndex(graph, point, types = null) {
    let best = -1;
    let bestD = Infinity;
    graph.connections.forEach((c, idx) => {
        if (types && !types.includes(c.type)) return;
        const d = pointToSegment(point, [c.x1, c.y1], [c.x2, c.y2]);
        if (d < bestD) { bestD = d; best = idx; }
    });
    return best;
}

/**
 * Resolve the graph connection indices to start/end a leg from, for a unit.
 * Prefers the unit's own door(s) (`<unitId>_...`), else the nearest walkable
 * connection to the room centroid.
 */
function unitConnections(floor, room) {
    const doors = floor.graph.connections
        .filter(c => c.type === 'door' && typeof c.id === 'string' && c.id.startsWith(room.id + '_'))
        .map(c => c._index);
    if (doors.length) return doors;

    const center = room.center || room.coordinates?.[0];
    if (!center) return [];
    const idx = nearestConnectionIndex(floor.graph, center, ['door', 'path']);
    return idx >= 0 ? [idx] : [];
}

function resolveSpec(floor, spec) {
    // spec: { room } | { connIndex } | { portal }
    if (spec.connIndex != null) return { indices: [spec.connIndex], room: spec.room || null };
    if (spec.portal) return { indices: [spec.portal.connIndex], room: null };
    if (spec.room) return { indices: unitConnections(floor, spec.room), room: spec.room };
    return { indices: [], room: null };
}

/* ---- same-floor solve -------------------------------------------------- */

function solveLeg(floor, startSpec, endSpec, costType) {
    const s = resolveSpec(floor, startSpec);
    const e = resolveSpec(floor, endSpec);
    if (!s.indices.length) throw new Error('Baslangic baglanti noktasi bulunamadi');
    if (!e.indices.length) throw new Error('Hedef baglanti noktasi bulunamadi');

    const result = dijkstraWithCustomCost(floor.graph, s.indices, e.indices, costType);
    if (!result) throw new Error('Rota bulunamadi (graf baglantisi yok)');

    const pathPoints = buildPathPoints(floor.graph, result.path);
    const excludeIds = new Set([s.room?.id, e.room?.id].filter(Boolean));
    const turns = detectTurns(pathPoints, floor.rooms, { excludeIds });
    const connIds = result.path
        .map(i => floor.graph.connections[i].id)
        .filter(Boolean);

    return {
        floor: floor.name,
        connPath: result.path,
        connIds,
        pathPoints,
        turns,
        startRoom: s.room,
        endRoom: e.room,
    };
}

function buildRouteId(query, startRoom, endRoom) {
    const st = startRoom?.type || 'Room';
    const et = endRoom?.type || 'Room';
    return `${query.startFloor}_${st}_${query.startId}_to_${query.endFloor}_${et}_${query.endId}`;
}

/* ---- public query API -------------------------------------------------- */

/**
 * Compute a single route.
 *
 * @param {object} venue   from createVenue()
 * @param {object} query   { startFloor, startId, endFloor, endId, routeType }
 * @returns {object} route payload (see README)
 */
export function computeRoute(venue, query) {
    const {
        startFloor, startId, endFloor, endId, routeType = 'shortest',
    } = query || {};

    if (!ROUTE_TYPES.includes(routeType)) {
        throw new Error(`Gecersiz routeType: ${routeType}`);
    }
    const fromFloor = venue.floorByName.get(startFloor);
    const toFloor = venue.floorByName.get(endFloor);
    if (!fromFloor) throw new Error(`Kat bulunamadi: ${startFloor}`);
    if (!toFloor) throw new Error(`Kat bulunamadi: ${endFloor}`);

    const startRoom = fromFloor.roomsById.get(startId);
    const endRoom = toFloor.roomsById.get(endId);
    if (!startRoom) throw new Error(`Birim bulunamadi: ${startId} (${startFloor})`);
    if (!endRoom) throw new Error(`Birim bulunamadi: ${endId} (${endFloor})`);

    const costType = costTypeFor(routeType);
    const allowedTypes = allowedPortalTypesFor(routeType);

    let combined;
    if (startFloor === endFloor) {
        const leg = solveLeg(
            fromFloor,
            { room: startRoom },
            { room: endRoom },
            costType,
        );
        combined = combineSegments({ legs: [leg], transitions: [], pixelToMeter: venue.pixelToMeter });
    } else {
        const transitions = planFloorTransitions(
            startFloor, endFloor, venue.portalsByFloor, allowedTypes,
        );
        if (!transitions) {
            const why = routeType === 'accessible'
                ? 'Asansorlu kat gecisi bulunamadi (engelli erisimi mumkun degil)'
                : 'Katlar arasi gecis bulunamadi';
            throw new Error(why);
        }

        const legs = [];
        for (let i = 0; i <= transitions.length; i++) {
            const tr = transitions[i];
            const prevTr = transitions[i - 1];
            const legFloorName = i === 0 ? startFloor : prevTr.toFloor;
            const legFloor = venue.floorByName.get(legFloorName);

            const startSpec = i === 0
                ? { room: startRoom }
                : { portal: prevTr.toPortal || prevTr.fromPortal };
            const endSpec = i === transitions.length
                ? { room: endRoom }
                : { portal: tr.fromPortal };

            legs.push(solveLeg(legFloor, startSpec, endSpec, costType));
        }
        combined = combineSegments({ legs, transitions, pixelToMeter: venue.pixelToMeter });
    }

    return {
        routeType,
        routeId: buildRouteId(query, startRoom, endRoom),
        isMultiFloor: combined.isMultiFloor,
        summary: combined.summary,
        path: combined.path,
        steps: combined.steps,
        transitions: combined.transitions,
        start: { floor: startFloor, id: startId, type: startRoom.type },
        end: { floor: endFloor, id: endId, type: endRoom.type },
    };
}

/**
 * Compute several route types for the same start/end.
 * Failures per-type are captured as `{ error }` instead of throwing.
 *
 * @returns {Object<string, object>}
 */
export function computeRoutes(venue, query, routeTypes = ROUTE_TYPES) {
    const out = {};
    for (const rt of routeTypes) {
        try {
            out[rt] = computeRoute(venue, { ...query, routeType: rt });
        } catch (err) {
            out[rt] = { routeType: rt, error: err.message || String(err) };
        }
    }
    return out;
}

export { parseFloorSvg } from './svg-parse.js';
export { Graph } from './graph.js';
export { parsePortalName, planFloorTransitions } from './portals.js';
