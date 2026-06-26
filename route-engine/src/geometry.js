/** Shared 2D geometry helpers (SVG pixel space). */

export function euclidean(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Distance from point p to segment [a, b]. */
export function pointToSegment(p, a, b) {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const wx = p[0] - a[0];
    const wy = p[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (len2 === 0) return euclidean(p, a);
    let t = (wx * vx + wy * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    return euclidean(p, [a[0] + t * vx, a[1] + t * vy]);
}

/** Shortest distance from point p to a polygon's boundary. */
export function pointToPolygon(p, coords) {
    if (!coords || coords.length < 2) return Infinity;
    let min = Infinity;
    for (let i = 0; i < coords.length - 1; i++) {
        const d = pointToSegment(p, coords[i], coords[i + 1]);
        if (d < min) min = d;
    }
    // close the ring
    const d = pointToSegment(p, coords[coords.length - 1], coords[0]);
    return Math.min(min, d);
}

/**
 * Signed turn angle (degrees) of vector a->b->c.
 * Port of backend `calculate_turn_angle`: positive = left, negative = right.
 * Uses atan2 on the 2D cross/dot of the incoming and outgoing vectors.
 */
export function calculateTurnAngle(a, b, c) {
    const v1x = b[0] - a[0];
    const v1y = b[1] - a[1];
    const v2x = c[0] - b[0];
    const v2y = c[1] - b[1];
    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    const ang = Math.atan2(cross, dot) * 180 / Math.PI;
    return ang;
}

/** Absolute turn magnitude in degrees (0..180). */
export function turnMagnitude(a, b, c) {
    return Math.abs(calculateTurnAngle(a, b, c));
}

const EPS = 1e-9;
export function almostEqual(a, b, tol = 0.5) {
    return Math.abs(a - b) <= tol + EPS;
}

export function pointKey(x, y) {
    return `${x.toFixed(3)},${y.toFixed(3)}`;
}
