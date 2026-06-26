/**
 * POST /api/describe → stages[] — one row per turn-by-turn line.
 *
 * IMPORTANT: stage `path.points` / `from.point` / `to.point` are SVG *pixel*
 * coordinates (e.g. [518.6, 885.4]), NOT WGS84. They must never be drawn on the
 * map. The bridge to map geometry is `path.connection_ids`, which match the
 * route's `by_floor[].connection_ids` and therefore the frontend `legs[]`
 * (resolved to GeoJSON WGS84 coords in route-geometry.js).
 *
 * Each stage is mapped to a contiguous range of legs on its floor; the floor
 * chain is then sliced by arc-length fraction so only that range is bright.
 */

import { state } from '../../core/state.js';
import { resolveFloorKeyFromLabel } from './route-geometry.js';
import { sliceLineByFraction } from '../map/route-path-utils.js';

const ACTION_ICON_MAP = {
    start: 'stepStart',
    arrive: 'stepEnd',
    end: 'stepEnd',
    turn_right: 'stepRight',
    turn_left: 'stepLeft',
    floor_change: 'stepElevator',
    start_portal: 'stepElevator',
    arrive_portal: 'stepElevator',
    pass_by: 'stepStraight',
    veer: 'stepStraight',
    straight: 'stepStraight',
};

function mapActionIcon(action, index) {
    const k = String(action || '').toLowerCase().replace(/[^a-z_]/g, '_');
    return ACTION_ICON_MAP[k] || (index === 0 ? 'stepStart' : 'stepStraight');
}

export function isStageFloorChange(stage) {
    if (!stage) return false;
    const a = String(stage.action || '').toUpperCase();
    if (a === 'FLOOR_CHANGE' || a === 'START_PORTAL') return true;
    if (stage.icon === 'stepElevator') return true;
    const t = String(stage.description || stage.text || '').toLowerCase();
    return /katına geç|kata geç|kat geçiş|floor change|merdiven ile|asansör ile|asansörü kullan/i.test(t);
}

/** Portal "stack" key (floor-agnostic): Elev.8.0 / Elev.8.1 → "elev.8". */
function portalStack(id) {
    const m = /^(Elev|Stairs|Stop)\.([^.]+)/i.exec(String(id || ''));
    return m ? `${m[1].toLowerCase()}.${m[2].toLowerCase()}` : null;
}

function connectionMatches(legId, stageId) {
    if (legId == null || stageId == null) return false;
    const a = String(legId);
    const b = String(stageId);
    if (a === b) return true;
    const stripA = a.replace(/_\d+_$/, '');
    const stripB = b.replace(/_\d+_$/, '');
    if (stripA && stripA === stripB) return true;
    const pa = portalStack(a);
    const pb = portalStack(b);
    return !!pa && pa === pb;
}

export function normalizeDescribeStages(body) {
    const raw = Array.isArray(body?.stages) ? body.stages : null;
    if (!raw || !raw.length) return [];

    return raw.map((s, i) => {
        const floorLabel = s.floor ?? '';
        const fromFloor = s.from?.floor ?? '';
        const toFloor = s.to?.floor ?? '';
        return {
            stageIndex: s.stage_index ?? i + 1,
            stepNumber: s.step_number ?? i + 1,
            nextStepNumber: s.next_step_number ?? null,
            action: s.action || '',
            description: s.description || s.text || '',
            source: s.source,
            landmark: s.landmark,
            floor: floorLabel,
            floorKey: floorLabel ? resolveFloorKeyFromLabel(floorLabel) : '',
            fromFloor,
            toFloor,
            fromFloorKey: fromFloor ? resolveFloorKeyFromLabel(fromFloor) : '',
            toFloorKey: toFloor ? resolveFloorKeyFromLabel(toFloor) : '',
            connectionIds: (s.path?.connection_ids || []).map(String),
        };
    });
}

/** Turn-by-turn rows for the island / bottom-sheet step list. */
export function describeStepsFromStages(stages) {
    if (!stages?.length) return [];
    return stages.map((s, i) => ({
        icon: mapActionIcon(s.action, i),
        text: s.description,
        action: s.action,
        floor: s.floor,
        floorKey: s.floorKey,
        stageIndex: s.stageIndex,
    })).filter(s => s.text);
}

// ── Navigation plan: map each stage to a leg range on its floor ──

function dist2d(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
}

const JOIN_EPS = 1e-7;

function minEndpointDist(coords, other) {
    const a = other[0];
    const b = other[other.length - 1];
    return Math.min(dist2d(coords, a), dist2d(coords, b));
}

/** Concatenate ordered leg coords into one floor polyline (travel direction),
 *  recording each leg's start fraction along the chain. Legs arrive in path
 *  order (start → end); each is oriented to connect to the growing chain, and
 *  the first leg is oriented toward the second so the chain runs forward. */
function buildFloorChain(legCoordsList) {
    const chain = [];
    const legStartLen = [];
    let runningLen = 0;

    for (let idx = 0; idx < legCoordsList.length; idx++) {
        let coords = legCoordsList[idx];

        if (!chain.length) {
            const next = legCoordsList[idx + 1];
            if (next && next.length >= 2) {
                const head = coords[0];
                const tail = coords[coords.length - 1];
                if (minEndpointDist(head, next) < minEndpointDist(tail, next)) {
                    coords = coords.slice().reverse();
                }
            }
            legStartLen.push(runningLen);
            chain.push(coords[0].slice());
            for (let i = 1; i < coords.length; i++) {
                runningLen += dist2d(chain[chain.length - 1], coords[i]);
                chain.push(coords[i].slice());
            }
            continue;
        }

        const prev = chain[chain.length - 1];
        if (dist2d(prev, coords[coords.length - 1]) < dist2d(prev, coords[0])) {
            coords = coords.slice().reverse();
        }
        legStartLen.push(runningLen);
        const startK = dist2d(prev, coords[0]) < JOIN_EPS ? 1 : 0;
        for (let i = startK; i < coords.length; i++) {
            runningLen += dist2d(chain[chain.length - 1], coords[i]);
            chain.push(coords[i].slice());
        }
    }

    return { chain, legStartLen, total: runningLen };
}

function orderedFloorKeysFromRoute(route) {
    const seen = [];
    for (const s of route?.segments || []) {
        const fk = String(s.floor);
        if (!seen.includes(fk)) seen.push(fk);
    }
    if (!seen.length) {
        for (const l of route?.legs || []) {
            const fk = String(l.floor);
            if (!seen.includes(fk)) seen.push(fk);
        }
    }
    return seen;
}

/** Resolve a clean, monotonic floor key per stage (floor change → arrival). */
function resolveStageFloors(stages, floorOrder, legs) {
    const fallbackFirst = floorOrder[0] || String(legs[0]?.floor ?? state.currentFloor ?? '0');
    const resolved = [];
    let prev = fallbackFirst;

    for (const s of stages) {
        let fk = s.floorKey || '';
        if (isStageFloorChange(s)) {
            // Advance to the arrival floor so the map switches at the change step.
            fk = s.toFloorKey || s.floorKey || s.fromFloorKey || prev;
        }
        if (!fk) fk = s.toFloorKey || s.fromFloorKey || prev;
        resolved.push(String(fk));
        prev = String(fk);
    }
    return resolved;
}

/** Linear fill of null anchors, kept monotonic non-decreasing within [0, max]. */
function fillMonotonic(starts, maxIdx) {
    const n = starts.length;
    if (!n) return starts;
    if (starts[0] == null) starts[0] = 0;

    for (let i = 1; i < n; i++) {
        if (starts[i] != null) {
            starts[i] = Math.max(starts[i], starts[i - 1]);
            continue;
        }
        let nextVal = null;
        let nextPos = -1;
        for (let j = i + 1; j < n; j++) {
            if (starts[j] != null) { nextVal = Math.max(starts[j], starts[i - 1]); nextPos = j; break; }
        }
        if (nextVal != null) {
            const span = nextVal - starts[i - 1];
            const slots = nextPos - (i - 1);
            starts[i] = Math.min(maxIdx, Math.round(starts[i - 1] + (span * 1) / slots));
            starts[i] = Math.max(starts[i], starts[i - 1]);
        } else {
            starts[i] = Math.min(maxIdx, starts[i - 1] + 1);
        }
    }
    return starts;
}

/**
 * Build (and cache) the per-step navigation plan from describe stages.
 * @returns {{ floors: string[], ranges: (number[]|null)[], chains: Map }} | null
 */
function buildNavPlan(route) {
    const stages = route?.describeStages || [];
    const legs = route?.legs || [];
    if (!stages.length || !legs.length) return null;

    const floorOrder = orderedFloorKeysFromRoute(route);
    const floors = resolveStageFloors(stages, floorOrder, legs);

    // Legs grouped by floor, preserving global (legIndex) order.
    const legsByFloor = new Map();
    for (const leg of legs) {
        if (!(leg.coords?.length >= 2)) continue;
        const fk = String(leg.floor);
        if (!legsByFloor.has(fk)) legsByFloor.set(fk, []);
        legsByFloor.get(fk).push(leg);
    }

    // Floor chains (WGS84) + per-leg fraction boundaries.
    const chains = new Map();
    for (const [fk, list] of legsByFloor) {
        const built = buildFloorChain(list.map(l => l.coords));
        chains.set(fk, {
            ...built,
            legCount: list.length,
            legConnIds: list.map(l => String(l.connectionId)),
        });
    }

    // Per-stage minimum matching local leg index (anchor).
    const positionsByFloor = new Map();
    stages.forEach((_, i) => {
        const fk = floors[i];
        if (!positionsByFloor.has(fk)) positionsByFloor.set(fk, []);
        positionsByFloor.get(fk).push(i);
    });

    const ranges = new Array(stages.length).fill(null);

    for (const [fk, positions] of positionsByFloor) {
        const info = chains.get(fk);
        const local = legsByFloor.get(fk) || [];
        const m = local.length;
        if (!info || !m) continue;

        const starts = positions.map(pos => {
            const conns = stages[pos].connectionIds || [];
            let best = null;
            for (const cid of conns) {
                for (let j = 0; j < local.length; j++) {
                    if (connectionMatches(local[j].connectionId, cid)) {
                        best = best == null ? j : Math.min(best, j);
                    }
                }
            }
            return best;
        });

        fillMonotonic(starts, m - 1);

        // Enforce strictly-increasing starts so each stage owns a distinct leg
        // span. Without this, two consecutive same-floor stages that anchor to
        // the SAME leg (common around PASS_BY landmarks, whose connection also
        // appears in the neighbouring stage) both highlight that leg — the
        // previous stage's segment then bleeds into the next stage's highlight.
        // Clamps at the last leg when there are more stages than legs.
        for (let x = 1; x < starts.length; x++) {
            if (starts[x] <= starts[x - 1]) {
                starts[x] = Math.min(starts[x - 1] + 1, m - 1);
            }
        }

        for (let x = 0; x < positions.length; x++) {
            const st = starts[x];
            const en = x < positions.length - 1
                ? Math.max(starts[x + 1] - 1, st)
                : m - 1;
            ranges[positions[x]] = [st, en];
        }
    }

    return { floors, ranges, chains };
}

function ensureNavPlan(route) {
    if (!route) return null;
    if (!route._navPlan) {
        route._navPlan = buildNavPlan(route);
    }
    return route._navPlan;
}

export function floorKeyForNavStep(route, stepIndex) {
    const plan = ensureNavPlan(route);
    if (plan && plan.floors[stepIndex] != null) return String(plan.floors[stepIndex]);

    const stage = (route?.describeStages || [])[stepIndex];
    if (stage?.floorKey) return String(stage.floorKey);
    if (stage?.toFloorKey) return String(stage.toFloorKey);

    const floors = orderedFloorKeysFromRoute(route);
    return floors[0] || String(state.currentFloor ?? '0');
}

/**
 * Bright (active stage) + dim (rest of floor) WGS84 polylines for `stepIndex`.
 * @returns {{ active: number[][][], muted: number[][][], floorKey: string } | null}
 */
export function highlightForNavStep(route, stepIndex) {
    const plan = ensureNavPlan(route);
    if (!plan) return null;

    const floorKey = String(plan.floors[stepIndex] ?? floorKeyForNavStep(route, stepIndex));
    const info = plan.chains.get(floorKey);
    if (!info || info.chain.length < 2) {
        return { active: [], muted: [], floorKey };
    }

    const range = plan.ranges[stepIndex];
    const total = info.total || 0;

    if (!range || total <= 0) {
        return { active: [info.chain], muted: [], floorKey };
    }

    const [st, en] = range;
    const f0 = info.legStartLen[st] / total;
    const f1 = (en + 1 < info.legStartLen.length ? info.legStartLen[en + 1] : total) / total;

    const active = sliceLineByFraction(info.chain, f0, f1);
    const muted = [];
    if (f0 > 0.001) {
        const before = sliceLineByFraction(info.chain, 0, f0);
        if (before.length >= 2) muted.push(before);
    }
    if (f1 < 0.999) {
        const after = sliceLineByFraction(info.chain, f1, 1);
        if (after.length >= 2) muted.push(after);
    }

    if (active.length < 2) {
        return { active: [info.chain], muted: [], floorKey };
    }

    return { active: [active], muted, floorKey };
}
