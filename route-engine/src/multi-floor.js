/**
 * Multi-floor route assembly.
 *
 * Port of `helpers/multi_floor_route_generator.py` combination logic: stitch
 * per-floor leg routes into one continuous route, inserting FLOOR_CHANGE steps
 * at portals and offsetting step numbers / path indices / cumulative distance.
 */

import { generateMetricSteps, buildSummary, makeFloorChangeStep } from './steps.js';

/**
 * @param {object} args
 * @param {Array}  args.legs        per-floor solved legs:
 *   { floor, pathPoints:[[x,y]], connIds:[string], turns:[], startRoom, endRoom }
 * @param {Array}  args.transitions floor transitions between consecutive legs
 *   (length === legs.length - 1) from planFloorTransitions()
 * @param {number} args.pixelToMeter
 * @returns {object} combined route payload
 */
export function combineSegments({ legs, transitions = [], pixelToMeter = 0.1 }) {
    const allSteps = [];
    const byFloor = [];
    let combinedPoints = [];
    const combinedConnIds = [];

    let stepNo = 1;
    let cumM = 0;
    let totalTurns = 0;
    let pointOffset = 0;

    legs.forEach((leg, i) => {
        const isFirst = i === 0;
        const isLast = i === legs.length - 1;

        const { steps, distanceMeters, turnsCount } = generateMetricSteps({
            pathPoints: leg.pathPoints,
            turns: leg.turns || [],
            pixelToMeter,
            startRoom: leg.startRoom,
            endRoom: leg.endRoom,
            floor: leg.floor,
            startStepNumber: stepNo,
            cumulativeStartM: cumM,
            startAction: isFirst ? 'START' : 'START_PORTAL',
            endAction: isLast ? 'ARRIVE' : 'ARRIVE_PORTAL',
        });

        // Shift local path indices into the combined point space.
        for (const s of steps) {
            if (typeof s.path_index === 'number') s.path_index += pointOffset;
            s.floor = leg.floor;
        }

        allSteps.push(...steps);
        stepNo += steps.length;
        cumM += distanceMeters;
        totalTurns += turnsCount;

        byFloor.push({
            floor: leg.floor,
            connection_ids: leg.connIds || [],
            points: leg.pathPoints,
        });
        combinedPoints = combinedPoints.concat(leg.pathPoints);
        combinedConnIds.push(...(leg.connIds || []));
        pointOffset += leg.pathPoints.length;

        // Insert a FLOOR_CHANGE between this leg and the next.
        if (!isLast) {
            const tr = transitions[i];
            const point = tr?.fromPortal?.point || leg.pathPoints[leg.pathPoints.length - 1] || null;
            allSteps.push(makeFloorChangeStep({
                stepNumber: stepNo++,
                cumulativeM: cumM,
                portalType: tr?.type || 'Elev',
                fromFloor: tr?.fromFloor ?? leg.floor,
                toFloor: tr?.toFloor ?? (legs[i + 1]?.floor),
                pathIndex: pointOffset - 1,
                point,
            }));
        }
    });

    const summary = buildSummary({
        distanceMeters: cumM,
        turnsCount: totalTurns,
        floorChanges: transitions.length,
    });

    return {
        isMultiFloor: legs.length > 1,
        summary,
        steps: allSteps,
        path: {
            connection_ids: combinedConnIds,
            points: combinedPoints,
            by_floor: byFloor,
        },
        transitions: transitions.map(t => ({
            fromFloor: t.fromFloor,
            toFloor: t.toFloor,
            type: t.type,
            number: t.number,
            point: t.fromPortal?.point || null,
        })),
        distanceMeters: cumM,
        turnsCount: totalTurns,
    };
}
