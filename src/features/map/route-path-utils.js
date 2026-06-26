/**
 * Polyline utilities for navigation step slicing along a floor chain.
 */

function dist2d(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
}

function coordKey(c) {
    return `${c[0].toFixed(8)},${c[1].toFixed(8)}`;
}

function endpointsNear(a, b, max = 3e-5) {
    return dist2d(a, b) <= max;
}

function orientSegment(coords, prev) {
    if (!coords?.length) return [];
    const c = coords.slice();
    if (!prev) return c;
    if (endpointsNear(c[0], prev)) return c;
    if (endpointsNear(c[c.length - 1], prev)) return c.reverse();
    return c;
}

function appendToChain(buf, coords) {
    if (!coords || coords.length < 2) return;
    if (!buf.length) {
        for (const p of coords) {
            if (!buf.length || coordKey(p) !== coordKey(buf[buf.length - 1])) buf.push(p);
        }
        return;
    }
    const prev = buf[buf.length - 1];
    const oriented = orientSegment(coords, prev);
    if (!endpointsNear(prev, oriented[0]) && !endpointsNear(prev, oriented[oriented.length - 1])) return;
    const start = endpointsNear(prev, oriented[0]) ? 1 : 0;
    for (let i = start; i < oriented.length; i++) {
        const p = oriented[i];
        if (!buf.length || coordKey(p) !== coordKey(buf[buf.length - 1])) buf.push(p);
    }
}

/** Stitch path segments in API / leg order into one continuous line. */
export function stitchLineStrings(lineStrings) {
    const lines = (lineStrings || []).filter(l => l?.length >= 2);
    if (!lines.length) return [];
    const buf = [];
    for (const line of lines) appendToChain(buf, line);
    return buf.length >= 2 ? buf : lines[0];
}

export function pickLongestLine(lines) {
    if (!lines?.length) return [];
    return lines.reduce((best, cur) => (cur.length > best.length ? cur : best), lines[0]);
}

function cumulativeLengths(coords) {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) {
        cum.push(cum[i - 1] + dist2d(coords[i - 1], coords[i]));
    }
    return { cum, total: cum[cum.length - 1] || 0 };
}

function pointAtDistance(coords, cum, target) {
    if (target <= 0) return coords[0]?.slice() || [];
    const total = cum[cum.length - 1];
    if (target >= total) return coords[coords.length - 1]?.slice() || [];

    for (let i = 1; i < coords.length; i++) {
        if (cum[i] >= target) {
            const segLen = cum[i] - cum[i - 1];
            const t = segLen > 0 ? (target - cum[i - 1]) / segLen : 0;
            const a = coords[i - 1];
            const b = coords[i];
            return [
                a[0] + (b[0] - a[0]) * t,
                a[1] + (b[1] - a[1]) * t,
            ];
        }
    }
    return coords[coords.length - 1].slice();
}

/**
 * Extract [startFrac, endFrac] portion of a polyline (0–1 by arc length).
 */
export function sliceLineByFraction(coords, startFrac, endFrac) {
    if (!coords || coords.length < 2) return [];
    const s = Math.max(0, Math.min(1, startFrac));
    const e = Math.max(s, Math.min(1, endFrac));
    if (e <= s) return [];

    const { cum, total } = cumulativeLengths(coords);
    if (total === 0) return coords.slice();

    const d0 = s * total;
    const d1 = e * total;
    const result = [pointAtDistance(coords, cum, d0)];

    for (let i = 1; i < coords.length; i++) {
        if (cum[i] > d0 && cum[i] < d1) {
            const p = coords[i];
            if (coordKey(p) !== coordKey(result[result.length - 1])) result.push(p);
        }
    }
    const end = pointAtDistance(coords, cum, d1);
    if (coordKey(end) !== coordKey(result[result.length - 1])) result.push(end);
    return result.length >= 2 ? result : [];
}

/** Steps belonging to one floor (inclusive indices). */
export function stepIndicesForFloor(route, floorKey) {
    const fk = String(floorKey);
    const steps = route?.describeSteps || [];
    if (!steps.length) return [0];

    const floors = [];
    for (const s of route?.segments || []) {
        const f = String(s.floor);
        if (!floors.includes(f)) floors.push(f);
    }
    if (!floors.length) {
        for (const l of route?.legs || []) {
            const f = String(l.floor);
            if (!floors.includes(f)) floors.push(f);
        }
    }

    const indices = [];
    let fi = 0;
    let rangeStart = 0;

    const isFloorChange = (step) => {
        if (!step) return false;
        if (step.icon === 'stepElevator') return true;
        const t = String(step.text || step.description || '').toLowerCase();
        return /katına geç|kata geç|kat geçiş|floor change|merdiven ile|asansör ile/i.test(t);
    };

    for (let i = 0; i < steps.length; i++) {
        if (isFloorChange(steps[i]) && i > rangeStart) {
            if (String(floors[fi] ?? floors[0]) === fk) {
                for (let j = rangeStart; j < i; j++) indices.push(j);
            }
            fi = Math.min(fi + 1, floors.length - 1);
            rangeStart = i;
        }
    }
    if (String(floors[fi] ?? floors[0]) === fk) {
        for (let j = rangeStart; j < steps.length; j++) indices.push(j);
    }

    return indices.length ? indices : [0];
}

/**
 * Merged walking path for one floor (segments → legs → lineStrings).
 */
export function mergedFloorChain(route, floorKey) {
    const fk = String(floorKey);

    const segCoords = (route?.segments || [])
        .filter(s => String(s.floor) === fk && s.coords?.length >= 2)
        .map(s => s.coords);
    if (segCoords.length) {
        const stitched = stitchLineStrings(segCoords);
        if (stitched.length >= 2) return stitched;
        return pickLongestLine(segCoords);
    }

    const legCoords = (route?.legs || [])
        .filter(l => String(l.floor) === fk && l.coords?.length >= 2)
        .sort((a, b) => a.legIndex - b.legIndex)
        .map(l => l.coords);
    if (legCoords.length) {
        const stitched = stitchLineStrings(legCoords);
        if (stitched.length >= 2) return stitched;
    }

    const lines = (route?.lineStrings || []).filter(c => c?.length >= 2);
    if (lines.length <= 1) return lines[0] || [];
    return pickLongestLine(lines);
}

/**
 * Highlight from current step start → next step start along the floor chain.
 */
export function slicePathForNavStep(route, stepIndex, floorKey) {
    const chain = mergedFloorChain(route, floorKey);
    if (chain.length < 2) return { active: [], mutedBefore: [], mutedAfter: [] };

    const floorSteps = stepIndicesForFloor(route, floorKey);
    const pos = floorSteps.indexOf(stepIndex);

    if (pos < 0) {
        return { active: [], mutedBefore: chain, mutedAfter: [] };
    }

    const n = floorSteps.length;
    const startFrac = pos / n;
    const endFrac = pos < n - 1 ? (pos + 1) / n : 1;

    const active = sliceLineByFraction(chain, startFrac, endFrac);
    const mutedBefore = startFrac > 0 ? sliceLineByFraction(chain, 0, startFrac) : [];
    const mutedAfter = endFrac < 1 ? sliceLineByFraction(chain, endFrac, 1) : [];

    const muted = [];
    if (mutedBefore.length >= 2) muted.push(mutedBefore);
    if (mutedAfter.length >= 2) muted.push(mutedAfter);

    return { active: active.length >= 2 ? [active] : [], muted, chain };
}
