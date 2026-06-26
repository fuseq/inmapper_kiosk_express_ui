/**
 * Metric step generation.
 *
 * Core port of `helpers/route_directions.py` (`RouteStep` / `MetricRouteGenerator`).
 * Produces a deterministic, metric (distance + landmark + side) step list.
 *
 * Step actions: START, TURN_LEFT, TURN_RIGHT, PASS_BY, FLOOR_CHANGE, ARRIVE.
 * Each step: { step_number, action, distance_meters, cumulative_distance,
 *              description, landmark, direction, path_index, floor }.
 *
 * NOT ported (see plan): randomized natural-language phrasing. Descriptions
 * here are a single deterministic metric template per action.
 */

import { euclidean } from './geometry.js';

const WALK_SPEED_MPS = 1.4;

function nameOf(room) {
    if (!room) return null;
    return room.name || room.displayName || room.id || null;
}

function round1(n) { return Math.round(n * 10) / 10; }

/** Turkish direction word + "on your <side>" possessive. */
function turkSide(direction) {
    if (direction === 'left') return { dir: 'sol', poss: 'solunuzda' };
    return { dir: 'sag', poss: 'saginizda' };
}

/** Sum path length (px) between two indices inclusive of the span. */
function spanLengthPx(pathPoints, fromIdx, toIdx) {
    let d = 0;
    for (let i = fromIdx; i < toIdx; i++) {
        d += euclidean(pathPoints[i], pathPoints[i + 1]);
    }
    return d;
}

/**
 * @param {object} args
 * @param {Array<[number,number]>} args.pathPoints
 * @param {Array} args.turns                 detectTurns() output
 * @param {number} args.pixelToMeter
 * @param {object} [args.startRoom]
 * @param {object} [args.endRoom]
 * @param {string} [args.floor]
 * @param {number} [args.startStepNumber]    for multi-floor combination
 * @param {number} [args.cumulativeStartM]   running distance offset
 * @param {string} [args.startAction]        START | START_PORTAL
 * @param {string} [args.endAction]          ARRIVE | ARRIVE_PORTAL
 * @param {string} [args.startDescription]   override for the first step
 * @param {string} [args.endDescription]     override for the last step
 * @returns {{ steps:Array, distanceMeters:number, turnsCount:number }}
 */
export function generateMetricSteps({
    pathPoints,
    turns = [],
    pixelToMeter = 0.1,
    startRoom = null,
    endRoom = null,
    floor = null,
    startStepNumber = 1,
    cumulativeStartM = 0,
    startAction = 'START',
    endAction = 'ARRIVE',
    startDescription = null,
    endDescription = null,
} = {}) {
    const steps = [];
    if (!pathPoints || pathPoints.length < 2) {
        return { steps, distanceMeters: 0, turnsCount: 0 };
    }

    const lastIdx = pathPoints.length - 1;
    const toM = px => px * pixelToMeter;

    // Ordered events: START(0) -> turns -> ARRIVE(last).
    const events = [{ kind: 'start', path_index: 0 }];
    for (const t of turns) {
        if (t.path_index > 0 && t.path_index < lastIdx) events.push({ kind: 'event', turn: t, path_index: t.path_index });
    }
    events.sort((a, b) => a.path_index - b.path_index);
    events.push({ kind: 'arrive', path_index: lastIdx });

    let stepNo = startStepNumber;
    let cumM = cumulativeStartM;
    let turnsCount = 0;

    for (let e = 0; e < events.length; e++) {
        const ev = events[e];
        const next = events[e + 1];
        const segM = next ? toM(spanLengthPx(pathPoints, ev.path_index, next.path_index)) : 0;
        const segR = round1(segM);

        if (ev.kind === 'start') {
            const sName = nameOf(startRoom);
            let desc;
            if (startDescription) {
                desc = startDescription.replace('{d}', String(segR));
            } else if (startAction === 'START_PORTAL') {
                desc = `Gecisten cikin ve ${segR} m ilerleyin.`;
            } else {
                desc = sName
                    ? `${sName} onunden baslayin ve ${segR} m ilerleyin.`
                    : `Baslangic noktasindan ${segR} m duz ilerleyin.`;
            }
            steps.push({
                step_number: stepNo++,
                action: startAction,
                distance_meters: segR,
                cumulative_distance: round1(cumM),
                description: desc,
                landmark: null,
                direction: 'duz',
                path_index: ev.path_index,
                floor,
            });
            cumM += segM;
        } else if (ev.kind === 'event') {
            const t = ev.turn;
            const { dir, poss } = turkSide(t.direction);
            const lmName = nameOf(t.landmark);
            let action, desc;
            if (t.kind === 'turn') {
                turnsCount += 1;
                action = t.direction === 'left' ? 'TURN_LEFT' : 'TURN_RIGHT';
                const turnWord = t.direction === 'left' ? 'Sola' : 'Saga';
                desc = lmName
                    ? `${turnWord} donun (${lmName} ${poss}) ve ${segR} m ilerleyin.`
                    : `${turnWord} donun ve ${segR} m ilerleyin.`;
            } else {
                action = 'PASS_BY';
                desc = lmName
                    ? `${lmName} ${poss} kalacak sekilde ${segR} m ilerleyin.`
                    : `${segR} m ilerleyin.`;
            }
            steps.push({
                step_number: stepNo++,
                action,
                distance_meters: segR,
                cumulative_distance: round1(cumM),
                description: desc,
                landmark: lmName,
                direction: dir,
                path_index: ev.path_index,
                floor,
            });
            cumM += segM;
        } else { // arrive
            const eName = nameOf(endRoom);
            let desc;
            if (endDescription) {
                desc = endDescription;
            } else if (endAction === 'ARRIVE_PORTAL') {
                desc = 'Gecis noktasina ulastiniz.';
            } else {
                desc = eName ? `${eName} hedefinize ulastiniz.` : 'Hedefinize ulastiniz.';
            }
            steps.push({
                step_number: stepNo++,
                action: endAction,
                distance_meters: 0,
                cumulative_distance: round1(cumM),
                description: desc,
                landmark: eName,
                direction: 'duz',
                path_index: ev.path_index,
                floor,
            });
        }
    }

    return { steps, distanceMeters: cumM - cumulativeStartM, turnsCount };
}

/** Build the route summary block. */
export function buildSummary({ distanceMeters, turnsCount, floorChanges = 0 }) {
    return {
        total_distance_meters: round1(distanceMeters),
        turns_count: turnsCount,
        estimated_time_minutes: round1(distanceMeters / WALK_SPEED_MPS / 60),
        floor_changes: floorChanges,
    };
}

/** A FLOOR_CHANGE step inserted by the multi-floor combiner. */
export function makeFloorChangeStep({
    stepNumber, cumulativeM, portalType, fromFloor, toFloor, pathIndex, point,
}) {
    const typeWord = portalType === 'Elev' ? 'Asansor' : (portalType === 'Stairs' ? 'Merdiven' : 'Gecis');
    return {
        step_number: stepNumber,
        action: 'FLOOR_CHANGE',
        distance_meters: 0,
        cumulative_distance: Math.round(cumulativeM * 10) / 10,
        description: `${typeWord} ile ${fromFloor} katindan ${toFloor} katina gecin.`,
        landmark: typeWord,
        direction: 'duz',
        path_index: pathIndex ?? null,
        point: point || null,
        portalType,
        fromFloor,
        toFloor,
    };
}
