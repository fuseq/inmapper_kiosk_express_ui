/**
 * Connection-index path -> ordered list of geometric points.
 *
 * Core of the backend's `_fallback_path_points`
 * (`helpers/path_analysis.py`): for a chain of connections we emit the start
 * endpoint, every shared (coincident) node between consecutive connections,
 * and the final endpoint. Consecutive duplicates are collapsed.
 */

import { euclidean } from './geometry.js';

function endpoints(conn) {
    return [[conn.x1, conn.y1], [conn.x2, conn.y2]];
}

function otherEndpoint(conn, ref) {
    const [e1, e2] = endpoints(conn);
    return euclidean(e1, ref) <= euclidean(e2, ref) ? e2 : e1;
}

/**
 * @param {Graph} graph
 * @param {number[]} connPath  connection indices (from dijkstra)
 * @returns {Array<[number,number]>}
 */
export function buildPathPoints(graph, connPath) {
    if (!connPath || !connPath.length) return [];
    const conns = connPath.map(i => graph.connections[i]);

    if (conns.length === 1) {
        return dedupe(endpoints(conns[0]));
    }

    const points = [];

    // First point: endpoint of conn[0] farthest from the first shared node.
    const firstShared = graph.sharedPoint(connPath[0], connPath[1]);
    points.push(otherEndpoint(conns[0], firstShared));

    // Shared node between each consecutive pair.
    for (let i = 0; i < connPath.length - 1; i++) {
        const s = graph.sharedPoint(connPath[i], connPath[i + 1]);
        if (s) points.push(s);
    }

    // Last point: endpoint of last conn farthest from the previous shared node.
    const lastShared = graph.sharedPoint(
        connPath[connPath.length - 2],
        connPath[connPath.length - 1],
    );
    points.push(otherEndpoint(conns[conns.length - 1], lastShared));

    return dedupe(points);
}

function dedupe(points, tol = 0.25) {
    const out = [];
    for (const p of points) {
        const last = out[out.length - 1];
        if (!last || euclidean(last, p) > tol) out.push([p[0], p[1]]);
    }
    return out;
}

/** Total polyline length in pixels. */
export function polylineLength(points) {
    let d = 0;
    for (let i = 1; i < points.length; i++) d += euclidean(points[i - 1], points[i]);
    return d;
}
