/**
 * Portal parsing + floor transition planning.
 *
 * Port of `helpers/portal_matcher.py`:
 *   - parse_portal_name : `Elev|Stairs.<no>.<targetFloor>`
 *   - find_matching_portal : pair a portal with its counterpart on the target floor
 *   - plan_floor_transitions : BFS over floors connected by portals, optionally
 *     restricted to a set of portal types (accessible == ['Elev']).
 */

/**
 * @param {string} id
 * @returns {{ type:'Elev'|'Stairs', number:string, targetFloor:string }|null}
 */
export function parsePortalName(id) {
    if (typeof id !== 'string') return null;
    const parts = id.split('.');
    if (parts.length < 3) return null;
    const [type, number, ...rest] = parts;
    if (type !== 'Elev' && type !== 'Stairs') return null;
    return { type, number, targetFloor: rest.join('.') };
}

export function isPortalId(id) {
    return parsePortalName(id) !== null;
}

/**
 * Among the portals on `targetFloor`, find the counterpart of `portal`.
 * Prefers a portal that points back to `fromFloor`; otherwise any same
 * type+number portal on the target floor.
 *
 * @param {object} portal       parsed portal { type, number, targetFloor, ... }
 * @param {string} fromFloor
 * @param {Array}  targetPortals portals on the target floor (with .parsed)
 */
export function findMatchingPortal(portal, fromFloor, targetPortals) {
    const same = targetPortals.filter(
        p => p.parsed && p.parsed.type === portal.type && p.parsed.number === portal.number,
    );
    if (!same.length) return null;
    const backPointing = same.find(p => p.parsed.targetFloor === fromFloor);
    return backPointing || same[0];
}

/**
 * Plan floor transitions from startFloor to endFloor.
 *
 * @param {string} startFloor
 * @param {string} endFloor
 * @param {Object<string, Array>} portalsByFloor  floor -> [{ id, parsed, point, connIndex }]
 * @param {string[]|null} allowedTypes  restrict portal types (e.g. ['Elev'])
 * @returns {Array<{ fromFloor, toFloor, type, number, fromPortal, toPortal }>|null}
 */
export function planFloorTransitions(startFloor, endFloor, portalsByFloor, allowedTypes = null) {
    if (startFloor === endFloor) return [];

    const allowed = type => !allowedTypes || allowedTypes.includes(type);

    // BFS over floors for the fewest transitions.
    const queue = [startFloor];
    const cameFrom = new Map();   // floor -> { prevFloor, transition }
    const visited = new Set([startFloor]);

    while (queue.length) {
        const floor = queue.shift();
        if (floor === endFloor) break;

        const portals = portalsByFloor[floor] || [];
        for (const p of portals) {
            if (!p.parsed || !allowed(p.parsed.type)) continue;
            const toFloor = p.parsed.targetFloor;
            if (!(toFloor in portalsByFloor)) continue;
            if (visited.has(toFloor)) continue;

            const toPortal = findMatchingPortal(p.parsed, floor, portalsByFloor[toFloor]);
            visited.add(toFloor);
            cameFrom.set(toFloor, {
                prevFloor: floor,
                transition: {
                    fromFloor: floor,
                    toFloor,
                    type: p.parsed.type,
                    number: p.parsed.number,
                    fromPortal: p,
                    toPortal,
                },
            });
            queue.push(toFloor);
        }
    }

    if (!cameFrom.has(endFloor)) return null;

    const chain = [];
    let f = endFloor;
    while (f !== startFloor) {
        const entry = cameFrom.get(f);
        if (!entry) return null;
        chain.push(entry.transition);
        f = entry.prevFloor;
    }
    chain.reverse();
    return chain;
}
