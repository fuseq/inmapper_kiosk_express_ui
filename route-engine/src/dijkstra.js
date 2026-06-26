/**
 * Dijkstra over the connection graph.
 *
 * Port of `helpers/dijkstra.py` (`dijkstra_connections`) and
 * `helpers/alternative_routes.py` (`dijkstra_with_custom_cost`).
 *
 * Two cost models:
 *   - 'distance' : edge cost = length of the connection being entered.
 *   - 'turns'    : each "significant" turn (30deg..175deg between consecutive
 *                  connections) costs +1000; walking distance is a tie-breaker
 *                  (* TURN_DISTANCE_WEIGHT) so among equal-turn routes the
 *                  shorter one wins.
 *
 * Because turn cost depends on the *previous* connection, this is an
 * edge-based (state = current+previous) Dijkstra. That makes it correct for
 * both models with one implementation.
 */

import { euclidean, calculateTurnAngle } from './geometry.js';
import { Graph } from './graph.js';

const TURN_PENALTY = 1000;
const TURN_DISTANCE_WEIGHT = 0.001;
const SIGNIFICANT_MIN = 30;   // degrees
const SIGNIFICANT_MAX = 175;  // degrees

/** Minimal binary min-heap keyed by numeric priority. */
class MinHeap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(item) {
        const a = this.a;
        a.push(item);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (a[p].cost <= a[i].cost) break;
            [a[p], a[i]] = [a[i], a[p]];
            i = p;
        }
    }
    pop() {
        const a = this.a;
        const top = a[0];
        const last = a.pop();
        if (a.length) {
            a[0] = last;
            let i = 0;
            const n = a.length;
            for (;;) {
                const l = 2 * i + 1, r = 2 * i + 2;
                let s = i;
                if (l < n && a[l].cost < a[s].cost) s = l;
                if (r < n && a[r].cost < a[s].cost) s = r;
                if (s === i) break;
                [a[s], a[i]] = [a[i], a[s]];
                i = s;
            }
        }
        return top;
    }
}

function farEndpoint(conn, ref) {
    const e1 = [conn.x1, conn.y1];
    const e2 = [conn.x2, conn.y2];
    return euclidean(e1, ref) >= euclidean(e2, ref) ? e1 : e2;
}

/**
 * Turn magnitude (deg) when travelling prevConn -> curConn through their
 * shared node. Uses the far endpoints of both connections as direction anchors.
 */
function turnBetween(graph, prevIdx, curIdx) {
    const shared = graph.sharedPoint(prevIdx, curIdx);
    if (!shared) return 0;
    const prev = graph.connections[prevIdx];
    const cur = graph.connections[curIdx];
    const a = farEndpoint(prev, shared);
    const c = farEndpoint(cur, shared);
    return Math.abs(calculateTurnAngle(a, shared, c));
}

function isSignificantTurn(deg) {
    return deg >= SIGNIFICANT_MIN && deg <= SIGNIFICANT_MAX;
}

/**
 * Generic edge-based Dijkstra.
 *
 * @param {Graph} graph
 * @param {number[]} startIndices  candidate start connection indices
 * @param {number[]} endIndices    candidate goal connection indices
 * @param {'distance'|'turns'} costType
 * @returns {{ path:number[], distance:number, turns:number, cost:number }|null}
 */
export function dijkstraWithCustomCost(graph, startIndices, endIndices, costType = 'distance') {
    graph.ensureBuilt();
    const ends = new Set(endIndices);
    if (!startIndices.length || !endIndices.length) return null;

    const dist = new Map();     // stateKey -> best cost
    const prevState = new Map(); // stateKey -> parent stateKey
    const heap = new MinHeap();

    const key = (cur, prev) => `${cur}|${prev}`;

    for (const s of startIndices) {
        const initCost = costType === 'turns' ? 0
            : Graph.length(graph.connections[s]);
        const k = key(s, -1);
        if (initCost < (dist.get(k) ?? Infinity)) {
            dist.set(k, initCost);
            prevState.set(k, null);
            heap.push({ cost: initCost, cur: s, prev: -1 });
        }
    }

    let goalKey = null;
    while (heap.size) {
        const { cost, cur, prev } = heap.pop();
        const k = key(cur, prev);
        if (cost > (dist.get(k) ?? Infinity)) continue;

        if (ends.has(cur)) { goalKey = k; break; }

        for (const next of graph.neighbors(cur)) {
            if (next === prev) continue;
            const nextLen = Graph.length(graph.connections[next]);
            let step;
            if (costType === 'turns') {
                const deg = turnBetween(graph, cur, next);
                step = (isSignificantTurn(deg) ? TURN_PENALTY : 0)
                    + nextLen * TURN_DISTANCE_WEIGHT;
            } else {
                step = nextLen;
            }
            const nk = key(next, cur);
            const nc = cost + step;
            if (nc < (dist.get(nk) ?? Infinity)) {
                dist.set(nk, nc);
                prevState.set(nk, k);
                heap.push({ cost: nc, cur: next, prev: cur });
            }
        }
    }

    if (goalKey == null) return null;

    // Reconstruct connection-index path.
    const path = [];
    let k = goalKey;
    while (k != null) {
        const cur = parseInt(k.split('|')[0], 10);
        path.push(cur);
        k = prevState.get(k);
    }
    path.reverse();

    // Tally distance + significant turns along the final path.
    let distance = 0;
    let turns = 0;
    for (let i = 0; i < path.length; i++) {
        distance += Graph.length(graph.connections[path[i]]);
        if (i >= 1) {
            const deg = turnBetween(graph, path[i - 1], path[i]);
            if (isSignificantTurn(deg)) turns += 1;
        }
    }

    return { path, distance, turns, cost: dist.get(goalKey) };
}

/** Shortest-distance connection path (backend `dijkstra_connections`). */
export function dijkstraConnections(graph, startIndices, endIndices) {
    return dijkstraWithCustomCost(graph, startIndices, endIndices, 'distance');
}

export { turnBetween, isSignificantTurn, farEndpoint };
