/**
 * Connection graph.
 *
 * Port of the backend `helpers/dijkstra.py` graph model: each connection
 * (path / door / portal segment) is a node, and two connections are adjacent
 * when they share an endpoint within a small tolerance (`tol = 0.5` px,
 * matching the backend). Routing then walks a sequence of connection ids.
 *
 * Stop portal rule: `Stop.<no>.<hall>` segments model a same-floor "hall jump".
 * Two Stop segments that share the same `<no>` are linked to each other in
 * addition to any geometric adjacency, so the router can hop between halls.
 *
 * Elevator / stairs portals (`Elev.*` / `Stairs.*`) are inter-floor and are
 * resolved by the multi-floor planner, not by intra-floor adjacency here.
 */

import { almostEqual, euclidean, pointKey } from './geometry.js';

const TOL = 0.5;

function endpoints(conn) {
    return [[conn.x1, conn.y1], [conn.x2, conn.y2]];
}

function stopNumber(id) {
    if (typeof id !== 'string' || !id.startsWith('Stop.')) return null;
    const parts = id.split('.');
    return parts.length >= 2 ? parts[1] : null;
}

export class Graph {
    constructor() {
        this.connections = [];          // node list
        this.byId = new Map();          // id -> connection
        this.adjacency = new Map();     // index -> Set<index>
        this._dirty = true;
    }

    addConnection(conn) {
        const idx = this.connections.length;
        const node = { ...conn, _index: idx };
        this.connections.push(node);
        if (node.id) this.byId.set(node.id, node);
        this.adjacency.set(idx, new Set());
        this._dirty = true;
        return node;
    }

    addConnections(list) {
        for (const c of list) this.addConnection(c);
        return this;
    }

    getConnection(id) {
        return this.byId.get(id) || null;
    }

    /**
     * Build adjacency from shared endpoints (tol = 0.5 px) + Stop portal links.
     * Endpoint coincidence is found via a coarse spatial hash for O(n) build.
     */
    findIntersections() {
        for (const s of this.adjacency.values()) s.clear();

        // Spatial bucket of endpoints, keyed at 1px resolution; neighbours are
        // probed in a 3x3 cell window so points within `tol` always meet.
        const buckets = new Map();
        const bucketKey = (x, y) => `${Math.round(x)}|${Math.round(y)}`;
        const pushBucket = (x, y, idx) => {
            const k = bucketKey(x, y);
            let arr = buckets.get(k);
            if (!arr) { arr = []; buckets.set(k, arr); }
            arr.push({ x, y, idx });
        };

        this.connections.forEach((conn, idx) => {
            for (const [x, y] of endpoints(conn)) pushBucket(x, y, idx);
        });

        const link = (a, b) => {
            if (a === b) return;
            this.adjacency.get(a).add(b);
            this.adjacency.get(b).add(a);
        };

        this.connections.forEach((conn, idx) => {
            for (const [x, y] of endpoints(conn)) {
                const bx = Math.round(x);
                const by = Math.round(y);
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        const arr = buckets.get(`${bx + dx}|${by + dy}`);
                        if (!arr) continue;
                        for (const pt of arr) {
                            if (pt.idx === idx) continue;
                            if (almostEqual(pt.x, x, TOL) && almostEqual(pt.y, y, TOL)) {
                                link(idx, pt.idx);
                            }
                        }
                    }
                }
            }
        });

        // Stop portal "hall jump": link Stop segments sharing the same number.
        const stopGroups = new Map();
        this.connections.forEach((conn, idx) => {
            if (conn.type !== 'portal') return;
            const n = stopNumber(conn.id);
            if (n == null) return;
            let arr = stopGroups.get(n);
            if (!arr) { arr = []; stopGroups.set(n, arr); }
            arr.push(idx);
        });
        for (const arr of stopGroups.values()) {
            for (let i = 0; i < arr.length; i++) {
                for (let j = i + 1; j < arr.length; j++) link(arr[i], arr[j]);
            }
        }

        this._dirty = false;
        return this;
    }

    ensureBuilt() {
        if (this._dirty) this.findIntersections();
        return this;
    }

    neighbors(index) {
        this.ensureBuilt();
        return this.adjacency.get(index) || new Set();
    }

    /** Segment length of a connection node. */
    static length(conn) {
        return euclidean([conn.x1, conn.y1], [conn.x2, conn.y2]);
    }

    /**
     * Representative point shared between two adjacent connections (the
     * coincident endpoint), used by turn detection / path-point assembly.
     * Falls back to the midpoint between the closest endpoints.
     */
    sharedPoint(aIdx, bIdx) {
        const a = this.connections[aIdx];
        const b = this.connections[bIdx];
        let best = null;
        let bestD = Infinity;
        for (const pa of endpoints(a)) {
            for (const pb of endpoints(b)) {
                const d = euclidean(pa, pb);
                if (d < bestD) { bestD = d; best = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]; }
            }
        }
        return best;
    }

    keyOf(conn) {
        return pointKey(conn.x1, conn.y1) + '->' + pointKey(conn.x2, conn.y2);
    }
}
