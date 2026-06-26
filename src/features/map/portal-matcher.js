/**
 * Portal name conventions and cross-floor transition planning.
 *
 * Ported from the Python reference implementation in the Anchor project
 * (`helpers/portal_matcher.py`). The convention encodes which floors a
 * given portal connects to right in its ID:
 *
 *   {Type}.{StackID}.{TargetFloor}
 *
 *   Elev.8.1     → elevator stack #8 sitting on its floor, leads to floor 1
 *   Stairs.3.-1  → stairs #3, leads to floor -1
 *
 * A pair of portals on adjacent floors with the same Type+StackID and
 * mirrored TargetFloors form a connection. For example:
 *
 *   Floor 0 has  Elev.8.1   ─┐
 *   Floor 1 has  Elev.8.0   ─┴─ paired (same elevator stack, both
 *                                directions point at each other)
 *
 * Multi-hop trips (e.g. floor 0 → floor 3 with no direct elevator) are
 * planned greedily: at each floor pick the portal that gets us as close
 * as possible to the destination in the right direction.
 */

const NAME_RE = /^(Elev|Stairs)\.(\d+)\.(-?\d+)$/i;

/**
 * Parse a portal id.
 *
 *   parsePortalName('Elev.8.1')    → {type:'Elev',  stack:'8', targetFloor:'1', portalId:'Elev.8.1'}
 *   parsePortalName('Stairs.3.-1') → {type:'Stairs',stack:'3', targetFloor:'-1',portalId:'Stairs.3.-1'}
 *   parsePortalName('something')   → null
 */
export function parsePortalName(portalId) {
    if (!portalId) return null;
    const m = NAME_RE.exec(String(portalId));
    if (!m) return null;
    // Normalise the type casing so 'elev' / 'ELEV' both compare equal to 'Elev'.
    const typeRaw = m[1];
    const type = typeRaw.toLowerCase() === 'elev' ? 'Elev' : 'Stairs';
    return {
        type,
        stack: m[2],
        targetFloor: m[3],
        portalId,
    };
}

/** True if the parsed portal connects from `sourceFloor` to `destFloor`. */
export function isPortalLink(parsed, sourceFloor, destFloor) {
    return parsed && parsed.targetFloor === String(destFloor);
}

/**
 * Find the portal on `targetFloorPortals` that pairs with `info` (same
 * type+stack, swapped floors). `info` is the source-side parse;
 * `sourceFloorKey` is the floor the source portal sits on.
 *
 * Returns the matching portal record (the same object handed in via
 * `targetFloorPortals`) or null.
 */
export function findMatchingPortal(info, sourceFloorKey, targetFloorPortals) {
    if (!info) return null;
    for (const p of targetFloorPortals) {
        const parsed = parsePortalName(p.id);
        if (!parsed) continue;
        if (parsed.type !== info.type) continue;
        if (parsed.stack !== info.stack) continue;
        if (parsed.targetFloor === String(sourceFloorKey)) return p;
    }
    return null;
}

function floorNumber(key) {
    const n = parseInt(key, 10);
    return Number.isFinite(n) ? n : 0;
}

function distSq(a, b) {
    if (!a || !b) return Infinity;
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    return dx * dx + dy * dy;
}

/**
 * Pick the portal closest (in the given coordinate frame) to `point`.
 * `portals` are records of the shape `{ id, coord:[x,y], ... }`.
 */
export function selectNearestPortal(portals, point) {
    if (!portals || portals.length === 0) return null;
    if (!point) return portals[0];
    let best = portals[0];
    let bestD = distSq(portals[0].coord, point);
    for (let i = 1; i < portals.length; i++) {
        const d = distSq(portals[i].coord, point);
        if (d < bestD) { best = portals[i]; bestD = d; }
    }
    return best;
}

/**
 * Plan a multi-hop floor traversal.
 *
 * @param startFloorKey   string  Floor we start on
 * @param endFloorKey     string  Floor we want to reach
 * @param floorsByKey     Map<key, { key, portals: Array<{id, coord}> }>
 *                              Each portal record has `id` (e.g. "Elev.8.1")
 *                              and `coord` (the [lng, lat] of the portal).
 * @param startPoint      [lng, lat] | null  Used to break ties between
 *                              candidate portals.
 *
 * @returns Array<{ fromFloor, toFloor, portal: {id, coord, ...}, parsed }>
 *
 * Empty array if start === end.
 */
export function planFloorTransitions(startFloorKey, endFloorKey, floorsByKey, startPoint = null) {
    const startN = floorNumber(startFloorKey);
    const endN = floorNumber(endFloorKey);
    if (startN === endN) return [];

    const direction = endN > startN ? 1 : -1;
    const transitions = [];
    let curFloor = startFloorKey;
    let curPoint = startPoint;
    const seen = new Set([curFloor]);

    while (floorNumber(curFloor) !== endN) {
        const cur = floorsByKey.get(curFloor);
        if (!cur || !Array.isArray(cur.portals) || cur.portals.length === 0) break;

        // Group available portals by their target floor.
        const byTarget = new Map();
        for (const p of cur.portals) {
            const parsed = parsePortalName(p.id);
            if (!parsed) continue;
            const tn = floorNumber(parsed.targetFloor);
            // Direction filter: only consider portals heading the right way.
            if ((direction > 0 && tn <= floorNumber(curFloor)) ||
                (direction < 0 && tn >= floorNumber(curFloor))) continue;
            if (!byTarget.has(parsed.targetFloor)) byTarget.set(parsed.targetFloor, []);
            byTarget.get(parsed.targetFloor).push({ ...p, parsed });
        }

        // Direct hop preferred.
        if (byTarget.has(String(endN))) {
            const nearest = selectNearestPortal(byTarget.get(String(endN)), curPoint);
            transitions.push({
                fromFloor: curFloor,
                toFloor: String(endN),
                portal: nearest,
                parsed: nearest.parsed,
            });
            return transitions;
        }

        // Otherwise pick the candidate that overshoots the least toward the target.
        let bestTarget = null;
        let bestDist = Infinity;
        for (const [tk, list] of byTarget) {
            const d = Math.abs(floorNumber(tk) - endN);
            if (d < bestDist) { bestDist = d; bestTarget = { tk, list }; }
        }
        if (!bestTarget || seen.has(bestTarget.tk)) break;
        const nearest = selectNearestPortal(bestTarget.list, curPoint);
        transitions.push({
            fromFloor: curFloor,
            toFloor: bestTarget.tk,
            portal: nearest,
            parsed: nearest.parsed,
        });
        curFloor = bestTarget.tk;
        curPoint = nearest.coord || curPoint;
        seen.add(curFloor);
    }
    return transitions;
}

/**
 * Group a list of portal feature records (each carrying `id`, `floor`,
 * `coord`) by stack so we can quickly enumerate all portals belonging
 * to a given Elev/Stairs stack across floors.
 */
export function groupPortalsByStack(portals) {
    const byStack = new Map();
    for (const p of portals) {
        const parsed = parsePortalName(p.id);
        if (!parsed) continue;
        const stackKey = `${parsed.type}.${parsed.stack}`;
        if (!byStack.has(stackKey)) byStack.set(stackKey, []);
        byStack.get(stackKey).push({ ...p, parsed });
    }
    return byStack;
}
