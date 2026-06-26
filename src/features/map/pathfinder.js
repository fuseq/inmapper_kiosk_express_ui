/**
 * Multi-floor pathfinder.
 *
 * Each path/door node in the graph is keyed by `floor|x,y` so that two
 * features with identical coordinates but on different floors never
 * collapse into the same node. Edges between paths/doors stay on a
 * single floor.
 *
 * Cross-floor transitions are added by parsing portal feature ids (the
 * `Elev.{stack}.{targetFloor}` / `Stairs.{stack}.{targetFloor}`
 * convention) and pairing same-stack portals on adjacent floors. Each
 * pair gets a single bidirectional edge whose distance is dominated by a
 * configurable cost (`PORTAL_COST.elev`, `PORTAL_COST.stairs`) so the
 * planner avoids gratuitous floor changes.
 *
 * Routing returns `{ coordinates, distance, segments }` where `segments`
 * is an array of `{ floor, coords }` chunks split at every portal hop —
 * the renderer / route-info side panel use these to surface floor
 * changes in the UI.
 */

import { parsePortalName } from './portal-matcher.js';

let _graph = null;
let _doorIndex = null;       // Map<unitId, Array<{floor, startKey, endKey, midCoord}>>
let _portalIndex = null;     // Map<floor, Array<{id, coord, key, parsed}>>
let _floors = null;          // Array<string> — floor keys present in the graph

const PORTAL_COST = { elev: 12, stairs: 18 };  // metres of penalty per floor traversal

function coordFrag(c) {
    return c[0].toFixed(8) + ',' + c[1].toFixed(8);
}

function nodeKey(floor, c) {
    return `${floor}|${coordFrag(c)}`;
}

function haversine(a, b) {
    const toRad = x => x * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function lineLength(coords) {
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
        total += haversine(coords[i - 1], coords[i]);
    }
    return total;
}

function midpoint(coords) {
    if (!coords || coords.length === 0) return [0, 0];
    if (coords.length === 1) return coords[0];
    const a = coords[0];
    const b = coords[coords.length - 1];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function featureFloor(feature) {
    return String(feature.properties?.floor ?? '0');
}

export function buildGraph(geojsonData) {
    const graph = new Map();
    _doorIndex = new Map();
    _portalIndex = new Map();
    const floors = new Set();

    /* Units flagged `disabled` in the editor must not be routable: collect
     * their ids so their doors are skipped from the graph's door index below
     * (no door → findRoute() returns null → can't route to/from them). */
    const disabledUnits = new Set();
    for (const f of geojsonData.features) {
        if (f.properties?.layer === 'rooms' && f.properties?.disabled === true && f.properties?.id != null) {
            disabledUnits.add(String(f.properties.id));
        }
    }

    function ensureNode(key, coord, floor) {
        if (!graph.has(key)) graph.set(key, { coord, floor, edges: [] });
    }

    /* ── Same-floor edges from path & door features ─────────────────── */

    const edges = geojsonData.features.filter(
        f => f.properties.layer === 'paths' || f.properties.layer === 'doors'
    );

    for (const feature of edges) {
        const coords = feature.geometry.coordinates;
        if (!coords || coords.length < 2) continue;

        const floor = featureFloor(feature);
        floors.add(floor);

        const startCoord = coords[0];
        const endCoord = coords[coords.length - 1];
        const startKey = nodeKey(floor, startCoord);
        const endKey   = nodeKey(floor, endCoord);
        const dist = lineLength(coords);

        ensureNode(startKey, startCoord, floor);
        ensureNode(endKey, endCoord, floor);

        graph.get(startKey).edges.push({ to: endKey, dist, coords, floor });
        graph.get(endKey).edges.push({ to: startKey, dist, coords: [...coords].reverse(), floor });

        if (feature.properties.layer === 'doors') {
            const unitId = (feature.properties.id || '').replace(/_\d+_$/, '');
            // Skip doors of disabled units so they drop out of routing.
            if (!disabledUnits.has(unitId)) {
                const midCoord = [
                    (startCoord[0] + endCoord[0]) / 2,
                    (startCoord[1] + endCoord[1]) / 2,
                ];
                if (!_doorIndex.has(unitId)) _doorIndex.set(unitId, []);
                _doorIndex.get(unitId).push({ floor, startKey, endKey, midCoord });
            }
        }
    }

    /* ── Index portal features per floor ────────────────────────────── */

    const portalFeatures = geojsonData.features.filter(f => f.properties.layer === 'portals');
    for (const f of portalFeatures) {
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length === 0) continue;
        const floor = featureFloor(f);
        floors.add(floor);
        const id = f.properties?.id || f.properties?.portal_id || '';
        const parsed = parsePortalName(id);
        if (!parsed) continue;   // Portals without a recognised name can't link floors.

        const mid = midpoint(coords.length === 1 ? [coords] : coords);
        const key = nodeKey(floor, mid);
        ensureNode(key, mid, floor);

        if (!_portalIndex.has(floor)) _portalIndex.set(floor, []);
        _portalIndex.get(floor).push({ id, parsed, coord: mid, key });

        // Splice the portal node into the local graph by linking it to
        // the closest existing path-node on the same floor; otherwise
        // routes can't reach the portal at all.
        const nearest = findNearestNodeOnFloor(graph, mid, floor, key);
        if (nearest && nearest.distance < 50) {
            const dist = nearest.distance;
            graph.get(key).edges.push({ to: nearest.nodeKey, dist, coords: [mid, nearest.coord], floor });
            graph.get(nearest.nodeKey).edges.push({ to: key, dist, coords: [nearest.coord, mid], floor });
        }
    }

    /* ── Stitch matching portal pairs across floors ─────────────────── */

    for (const [floor, list] of _portalIndex) {
        for (const portal of list) {
            const tgtFloor = portal.parsed.targetFloor;
            const others = _portalIndex.get(tgtFloor);
            if (!others) continue;
            const match = others.find(p =>
                p.parsed.type === portal.parsed.type &&
                p.parsed.stack === portal.parsed.stack &&
                p.parsed.targetFloor === floor);
            if (!match) continue;
            const cost = portal.parsed.type === 'Elev' ? PORTAL_COST.elev : PORTAL_COST.stairs;
            // Edge geometry is just the two portal endpoints; the
            // renderer uses `transition: true` to draw a special card.
            graph.get(portal.key).edges.push({
                to: match.key,
                dist: cost,
                coords: [portal.coord, match.coord],
                floor: tgtFloor,
                transition: { type: portal.parsed.type, stack: portal.parsed.stack,
                              fromFloor: floor, toFloor: tgtFloor, portalId: portal.id },
            });
        }
    }

    _graph = graph;
    _floors = [...floors];
    console.log(`🗺️ Pathfinder: ${graph.size} nodes, ${edges.length} edges, ${_doorIndex.size} units, ${_floors.length} floors`);
    return graph;
}

function findNearestNodeOnFloor(graph, coord, floor, excludeKey = null) {
    let best = null;
    let bestD = Infinity;
    for (const [k, n] of graph) {
        if (n.floor !== floor) continue;
        if (k === excludeKey) continue;
        const d = haversine(coord, n.coord);
        if (d < bestD) { bestD = d; best = { nodeKey: k, coord: n.coord, distance: d }; }
    }
    return best;
}

function dijkstra(graph, startKey, endKey) {
    const dist = new Map();
    const prev = new Map();
    const visited = new Set();

    const queue = [{ key: startKey, dist: 0 }];
    dist.set(startKey, 0);

    while (queue.length > 0) {
        queue.sort((a, b) => a.dist - b.dist);
        const { key: current } = queue.shift();

        if (current === endKey) break;
        if (visited.has(current)) continue;
        visited.add(current);

        const node = graph.get(current);
        if (!node) continue;

        for (const edge of node.edges) {
            if (visited.has(edge.to)) continue;
            const newDist = dist.get(current) + edge.dist;
            if (!dist.has(edge.to) || newDist < dist.get(edge.to)) {
                dist.set(edge.to, newDist);
                prev.set(edge.to, { from: current, coords: edge.coords, transition: edge.transition || null, floor: edge.floor });
                queue.push({ key: edge.to, dist: newDist });
            }
        }
    }

    if (!prev.has(endKey) && startKey !== endKey) return null;

    // Walk back, collecting per-segment data so we can reconstruct
    // floor-aware route segments later.
    const steps = [];
    let cur = endKey;
    while (prev.has(cur)) {
        const p = prev.get(cur);
        steps.unshift({ from: p.from, to: cur, coords: p.coords, transition: p.transition, floor: p.floor });
        cur = p.from;
    }

    // Flatten coordinates (deduping repeats at boundaries).
    const flatCoords = [];
    for (const s of steps) {
        for (let i = 0; i < s.coords.length; i++) {
            if (flatCoords.length === 0 || coordFrag(s.coords[i]) !== coordFrag(flatCoords[flatCoords.length - 1])) {
                flatCoords.push(s.coords[i]);
            }
        }
    }

    // Build per-floor segments and a sibling list of transitions.
    const segments = [];
    const transitions = [];
    let curFloor = graph.get(startKey)?.floor || null;
    let curBuf = [];
    const startCoord = graph.get(startKey)?.coord;
    if (startCoord) curBuf.push(startCoord);

    for (const s of steps) {
        if (s.transition) {
            // Close the current segment and emit a transition record.
            if (curBuf.length) {
                segments.push({ floor: curFloor, coords: curBuf.slice() });
            }
            transitions.push({
                ...s.transition,
                atIndex: segments.length,
            });
            curFloor = s.transition.toFloor;
            curBuf = [graph.get(s.to)?.coord || s.coords[s.coords.length - 1]];
        } else {
            if (s.floor && s.floor !== curFloor) {
                if (curBuf.length) segments.push({ floor: curFloor, coords: curBuf.slice() });
                curFloor = s.floor;
                curBuf = [];
            }
            for (let i = 0; i < s.coords.length; i++) {
                const c = s.coords[i];
                if (curBuf.length === 0 || coordFrag(c) !== coordFrag(curBuf[curBuf.length - 1])) {
                    curBuf.push(c);
                }
            }
        }
    }
    if (curBuf.length) segments.push({ floor: curFloor, coords: curBuf.slice() });

    return {
        coordinates: flatCoords,
        distance: dist.get(endKey) || 0,
        segments,
        transitions,
    };
}

export function findRoute(fromUnitId, toUnitId) {
    if (!_graph || !_doorIndex) {
        console.warn('Pathfinder: graph not built yet');
        return null;
    }

    const fromDoors = _doorIndex.get(fromUnitId);
    const toDoors = _doorIndex.get(toUnitId);

    if (!fromDoors || fromDoors.length === 0) {
        console.warn(`Pathfinder: no door found for unit "${fromUnitId}"`);
        return null;
    }
    if (!toDoors || toDoors.length === 0) {
        console.warn(`Pathfinder: no door found for unit "${toUnitId}"`);
        return null;
    }

    let bestRoute = null;

    for (const from of fromDoors) {
        for (const to of toDoors) {
            for (const fk of [from.startKey, from.endKey]) {
                for (const tk of [to.startKey, to.endKey]) {
                    const result = dijkstra(_graph, fk, tk);
                    if (result && (!bestRoute || result.distance < bestRoute.distance)) {
                        bestRoute = result;
                    }
                }
            }
        }
    }

    if (bestRoute) {
        const xfNote = bestRoute.transitions.length
            ? ` · ${bestRoute.transitions.length} kat geçişi` : '';
        console.log(`🛤️ Route: ${fromUnitId} → ${toUnitId} | ${bestRoute.coordinates.length} pts | ${bestRoute.distance.toFixed(1)}m${xfNote}`);
    }

    return bestRoute;
}

/**
 * Find the nearest graph node to `(lng, lat)`. When `floor` is given
 * the search is restricted to that floor (used by `dropPin` so the
 * snapped node always belongs to the floor the user is currently
 * looking at).
 */
/** Nearest shop/unit door to a map coordinate (for dropped-pin → API start). */
export function findNearestUnitId(lng, lat, floor = null) {
    if (!_doorIndex) return null;
    let best = null;
    let bestDist = Infinity;
    for (const [unitId, doors] of _doorIndex) {
        for (const d of doors) {
            if (floor != null && d.floor !== String(floor)) continue;
            const dist = haversine([lng, lat], d.midCoord);
            if (dist < bestDist) {
                bestDist = dist;
                best = { unitId, floor: d.floor, distance: dist };
            }
        }
    }
    return best;
}

export function findNearestNode(lng, lat, floor = null) {
    if (!_graph) return null;
    let best = null;
    let bestDist = Infinity;
    for (const [key, node] of _graph) {
        if (floor != null && node.floor !== String(floor)) continue;
        const d = haversine([lng, lat], node.coord);
        if (d < bestDist) {
            bestDist = d;
            best = { nodeKey: key, coord: node.coord, distance: d, floor: node.floor };
        }
    }
    return best;
}

export function findRouteFromNode(nodeKey, toUnitId) {
    if (!_graph || !_doorIndex) {
        console.warn('Pathfinder: graph not built yet');
        return null;
    }
    const toDoors = _doorIndex.get(toUnitId);
    if (!toDoors || toDoors.length === 0) {
        console.warn(`Pathfinder: no door found for unit "${toUnitId}"`);
        return null;
    }

    let bestRoute = null;
    for (const to of toDoors) {
        for (const tk of [to.startKey, to.endKey]) {
            const result = dijkstra(_graph, nodeKey, tk);
            if (result && (!bestRoute || result.distance < bestRoute.distance)) {
                bestRoute = result;
            }
        }
    }

    if (bestRoute) {
        console.log(`🛤️ PinRoute: pin → ${toUnitId} | ${bestRoute.coordinates.length} pts | ${bestRoute.distance.toFixed(1)}m`);
    }
    return bestRoute;
}

export function getAvailableUnits() {
    if (!_doorIndex) return [];
    return [..._doorIndex.keys()];
}

/**
 * Map<unitId, floorKey> — used by side panel / map renderer to figure
 * out which floor a given unit lives on (for "go to floor X" hints).
 */
export function getUnitFloors() {
    const out = new Map();
    if (!_doorIndex) return out;
    for (const [unitId, doors] of _doorIndex) {
        if (doors.length) out.set(unitId, doors[0].floor);
    }
    return out;
}

export function getKnownFloors() {
    return _floors ? _floors.slice() : [];
}
