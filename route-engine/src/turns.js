/**
 * Turn detection + landmark (anchor) lookup.
 *
 * Core port of `helpers/batch_route_generator._detect_turns_from_path`:
 * scan interior vertices of the path, classify "significant" turns
 * (30deg..175deg), tag each as a hard `turn` (>= 55deg) or a softer `bend`
 * (30..55deg, only when a nearby room anchor justifies it), assign a left/right
 * direction, and attach the nearest room as a landmark.
 *
 * Deliberately omitted from this core port (see plan "Kapsam disi"):
 * zig-zag consolidation, micro-turn merging, wedge anchor selection.
 */

import { calculateTurnAngle, pointToPolygon } from './geometry.js';

const SIGNIFICANT_MIN = 30;
const SIGNIFICANT_MAX = 175;
const HARD_TURN_MIN = 55;
const BEND_ANCHOR_MAX_PX = 60;   // a bend only counts if a room is this close
const LANDMARK_MAX_PX = 80;      // nearest-room search radius for a turn

/**
 * @param {[number,number]} point
 * @param {Array} rooms  [{ id, type, center, coordinates }]
 * @param {object} [opts]
 * @param {string[]} [opts.allowedTypes]  restrict to these room types
 * @param {number}   [opts.maxDist]       max boundary distance (px)
 * @param {Set}      [opts.excludeIds]    ids to skip
 * @returns {{ room:object, distance:number }|null}
 */
export function findNearestRoom(point, rooms, opts = {}) {
    const { allowedTypes = null, maxDist = Infinity, excludeIds = null } = opts;
    let best = null;
    let bestD = Infinity;
    for (const room of rooms) {
        if (allowedTypes && !allowedTypes.includes(room.type)) continue;
        if (excludeIds && excludeIds.has(room.id)) continue;
        const d = room.coordinates && room.coordinates.length >= 3
            ? pointToPolygon(point, room.coordinates)
            : (room.center ? Math.hypot(point[0] - room.center[0], point[1] - room.center[1]) : Infinity);
        if (d < bestD) { bestD = d; best = room; }
    }
    if (!best || bestD > maxDist) return null;
    return { room: best, distance: bestD };
}

/** Right/left from the signed turn angle, accounting for SVG's y-down axis. */
function sideFromAngle(angleDeg) {
    // cross > 0 in y-down space == clockwise == right
    return angleDeg > 0 ? 'right' : 'left';
}

/**
 * @param {Array<[number,number]>} pathPoints
 * @param {Array} rooms flattened room list with `type`
 * @param {object} [opts]
 * @returns {Array} turn descriptors
 */
export function detectTurns(pathPoints, rooms = [], opts = {}) {
    const { excludeIds = null } = opts;
    const turns = [];
    if (!pathPoints || pathPoints.length < 3) return turns;

    for (let i = 1; i < pathPoints.length - 1; i++) {
        const a = pathPoints[i - 1];
        const b = pathPoints[i];
        const c = pathPoints[i + 1];
        const signed = calculateTurnAngle(a, b, c);
        const mag = Math.abs(signed);
        if (mag < SIGNIFICANT_MIN || mag > SIGNIFICANT_MAX) continue;

        const landmark = findNearestRoom(b, rooms, {
            maxDist: LANDMARK_MAX_PX,
            excludeIds,
        });

        let kind;
        if (mag >= HARD_TURN_MIN) {
            kind = 'turn';
        } else {
            // Soft bend: only meaningful if anchored to a nearby room.
            if (!landmark || landmark.distance > BEND_ANCHOR_MAX_PX) continue;
            kind = 'bend';
        }

        turns.push({
            path_index: i,
            point: [b[0], b[1]],
            angle: signed,
            magnitude: mag,
            direction: sideFromAngle(signed),
            kind,
            landmark: landmark ? landmark.room : null,
        });
    }
    return turns;
}
