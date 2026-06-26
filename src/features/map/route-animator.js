import { config } from '../../core/config.js';
import { stitchLineStrings } from './route-path-utils.js';

const EASINGS = {
    linear: t => t,
    easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    easeOutQuart: t => 1 - Math.pow(1 - t, 4),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
};

let _animId = 0;
let _currentAnim = null;
let _arrowRaf = null;
let _arrowGen = 0;

function interpolateAlong(coords, segLengths, totalLength, fraction) {
    const targetDist = fraction * totalLength;
    let traveled = 0;

    for (let i = 0; i < segLengths.length; i++) {
        const seg = segLengths[i];
        if (traveled + seg >= targetDist) {
            const remainder = targetDist - traveled;
            const t = seg === 0 ? 0 : remainder / seg;
            const a = coords[i];
            const b = coords[i + 1];
            return [
                a[0] + (b[0] - a[0]) * t,
                a[1] + (b[1] - a[1]) * t,
            ];
        }
        traveled += seg;
    }
    return coords[coords.length - 1];
}

/** Bearing (degrees, clockwise from north) along travel direction at `fraction`. */
function bearingAlongPath(coords, segLengths, totalLength, fraction) {
    if (!coords || coords.length < 2 || totalLength <= 0) return 0;

    const step = Math.min(0.03, 4 / totalLength);
    const f0 = Math.max(0, fraction - step * 0.5);
    const f1 = Math.min(1, fraction + step * 0.5);
    const p0 = interpolateAlong(coords, segLengths, totalLength, f0);
    const p1 = interpolateAlong(coords, segLengths, totalLength, f1);

    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return 0;

    let bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
    if (bearing < 0) bearing += 360;
    return bearing;
}

function subLine(coords, segLengths, totalLength, fraction) {
    const targetDist = fraction * totalLength;
    const result = [coords[0]];
    let traveled = 0;

    for (let i = 0; i < segLengths.length; i++) {
        const seg = segLengths[i];
        if (traveled + seg >= targetDist) {
            const remainder = targetDist - traveled;
            const t = seg === 0 ? 0 : remainder / seg;
            const a = coords[i];
            const b = coords[i + 1];
            result.push([
                a[0] + (b[0] - a[0]) * t,
                a[1] + (b[1] - a[1]) * t,
            ]);
            return result;
        }
        traveled += seg;
        result.push(coords[i + 1]);
    }
    return result;
}

function precompute(coords) {
    const segLengths = [];
    let totalLength = 0;
    for (let i = 1; i < coords.length; i++) {
        const dx = coords[i][0] - coords[i - 1][0];
        const dy = coords[i][1] - coords[i - 1][1];
        const d = Math.sqrt(dx * dx + dy * dy);
        segLengths.push(d);
        totalLength += d;
    }
    return { segLengths, totalLength };
}

function makeLineGeoJSON(coords) {
    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: {},
        }],
    };
}

function makeMultiLineGeoJSON(lineStrings) {
    const features = (lineStrings || [])
        .filter(coords => coords && coords.length >= 2)
        .map(coords => ({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: {},
        }));
    return { type: 'FeatureCollection', features };
}

const EMPTY = { type: 'FeatureCollection', features: [] };

function getSource(map, id) {
    try { return map.getSource(id); } catch (_) { return null; }
}

function pickPrimaryLine(lineStrings, coordinates) {
    const lines = (lineStrings || []).filter(l => l.length >= 2);
    if (lines.length) {
        return lines.reduce((best, cur) => (cur.length > best.length ? cur : best), lines[0]);
    }
    return coordinates?.length >= 2 ? coordinates : [];
}

function isCoordPair(p) {
    return Array.isArray(p) && p.length >= 2
        && typeof p[0] === 'number' && typeof p[1] === 'number';
}

function isLineString(coords) {
    return Array.isArray(coords) && coords.length >= 2
        && isCoordPair(coords[0]) && isCoordPair(coords[1]);
}

function pathForArrows(activeLineStrings) {
    const lines = (activeLineStrings || []).filter(l => isLineString(l));
    if (!lines.length) return [];
    if (lines.length === 1) return lines[0];
    const stitched = stitchLineStrings(lines);
    return stitched.length >= 2 ? stitched : lines[0];
}

function resolveArrowPath(input) {
    if (!Array.isArray(input)) return [];
    if (isLineString(input)) return input;
    if (Array.isArray(input[0]) && isLineString(input[0])) return pathForArrows(input);
    return [];
}

function startArrowMarching(map, coordinatesOrLines) {
    stopArrowMarching();

    const routeCfg = config.features.map.route || {};
    const arrowCfg = routeCfg.arrows || {};

    if (arrowCfg.enabled === false) return;

    const coordinates = resolveArrowPath(coordinatesOrLines);

    if (!coordinates || coordinates.length < 2) return;

    const arrowCount = arrowCfg.count || 6;
    const speed = arrowCfg.speed ?? 0.06;
    const animated = arrowCfg.animated !== false;
    const rotationOffset = arrowCfg.rotationOffset ?? 0;
    // Symmetric custom icons (dots, logos) shouldn't spin to follow the
    // path — only directional glyphs do. Controlled per-config.
    const rotateWithPath = arrowCfg.rotateWithPath !== false;

    const { segLengths, totalLength } = precompute(coordinates);
    if (totalLength === 0) return;

    const spacing = 1 / arrowCount;

    function buildFeatures(marchOffset) {
        const features = [];
        for (let i = 0; i < arrowCount; i++) {
            let frac = (i * spacing + marchOffset) % 1;
            if (frac < 0) frac += 1;

            const pos = interpolateAlong(coordinates, segLengths, totalLength, frac);
            const bearing = rotateWithPath
                ? bearingAlongPath(coordinates, segLengths, totalLength, frac) + rotationOffset
                : 0;

            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: pos },
                properties: { bearing },
            });
        }
        return features;
    }

    const src = getSource(map, 'route-arrows-src');
    if (!src) return;

    if (!animated || speed <= 0) {
        try { src.setData({ type: 'FeatureCollection', features: buildFeatures(0) }); } catch (_) {}
        return;
    }

    let marchOffset = 0;
    let lastTime = performance.now();
    // Generation guard: a newer startArrowMarching/stopArrowMarching bumps
    // _arrowGen so any in-flight tick from a previous call self-terminates
    // instead of leaking a second rAF loop (which caused arrow flicker and
    // stale arrows on non-highlighted segments).
    const myGen = _arrowGen;

    function tick(now) {
        if (myGen !== _arrowGen || !map || map._removed) return;

        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        marchOffset = (marchOffset + speed * dt) % 1;

        try {
            src.setData({ type: 'FeatureCollection', features: buildFeatures(marchOffset) });
        } catch (_) {}

        _arrowRaf = requestAnimationFrame(tick);
    }

    // Render the first frame immediately, then run a single rAF chain.
    try { src.setData({ type: 'FeatureCollection', features: buildFeatures(0) }); } catch (_) {}
    _arrowRaf = requestAnimationFrame(tick);
}

function stopArrowMarching() {
    _arrowGen++;
    if (_arrowRaf) { cancelAnimationFrame(_arrowRaf); _arrowRaf = null; }
}

/**
 * @param {object} map
 * @param {number[][]} coordinates — primary line (camera / arrows)
 * @param {Function} [onComplete]
 * @param {{ lineStrings?: number[][][] }} [options]
 */
export function animateRoute(map, coordinates, onComplete, options = {}) {
    cancelRouteAnimation(map);

    const lineStrings = options.lineStrings;
    const lines = (lineStrings || []).filter(l => l.length >= 2);
    const primary = pickPrimaryLine(lines, coordinates);

    if (!primary || primary.length < 2) return;

    const routeCfg = config.features.map.route || {};
    const shouldAnimate = routeCfg.animateDraw !== false;
    const duration = routeCfg.drawDuration || 2000;
    const easingName = routeCfg.drawEasing || 'easeInOutCubic';
    const easing = EASINGS[easingName] || EASINGS.easeInOutCubic;

    const routeSrc = getSource(map, 'route');
    if (!routeSrc) return;

    const staticOthers = lines.length > 1
        ? lines.filter(l => l !== primary)
        : [];

    if (!shouldAnimate) {
        routeSrc.setData(makeMultiLineGeoJSON(lines.length ? lines : [primary]));
        startArrowMarching(map, primary);
        if (onComplete) onComplete();
        return;
    }

    const { segLengths, totalLength } = precompute(primary);
    if (totalLength === 0) return;

    const animId = ++_animId;
    const startTime = performance.now();

    function frame(now) {
        if (animId !== _animId) return;

        const elapsed = now - startTime;
        const rawT = Math.min(elapsed / duration, 1);
        const t = easing(rawT);

        const partial = subLine(primary, segLengths, totalLength, t);
        const animated = [partial, ...staticOthers];
        routeSrc.setData(makeMultiLineGeoJSON(animated));

        if (rawT < 1) {
            _currentAnim = requestAnimationFrame(frame);
        } else {
            _currentAnim = null;
            routeSrc.setData(makeMultiLineGeoJSON(lines.length ? lines : [primary]));
            startArrowMarching(map, primary);
            if (onComplete) onComplete();
        }
    }

    _currentAnim = requestAnimationFrame(frame);
}

function clearRouteActiveSource(map) {
    const activeSrc = getSource(map, 'route-active');
    if (activeSrc) activeSrc.setData(EMPTY);
}

/**
 * Context legs (dim) + single highlighted leg for the active navigation step.
 */
export function showRouteStepHighlight(map, { mutedLineStrings = [], activeLineStrings = [] } = {}) {
    _animId++;
    if (_currentAnim) { cancelAnimationFrame(_currentAnim); _currentAnim = null; }

    if (!map || map._removed) return;

    const muted = (mutedLineStrings || []).filter(c => c?.length >= 2);
    const active = (activeLineStrings || []).filter(c => c?.length >= 2);

    const routeSrc = getSource(map, 'route');
    const activeSrc = getSource(map, 'route-active');

    let bright = active;
    let dim = muted;
    if (!bright.length && dim.length) {
        bright = [pickPrimaryLine(dim, null)];
        dim = dim.filter(l => l !== bright[0]);
    }

    if (activeSrc) {
        if (routeSrc) routeSrc.setData(makeMultiLineGeoJSON(dim));
        activeSrc.setData(makeMultiLineGeoJSON(bright));
    } else if (routeSrc) {
        routeSrc.setData(makeMultiLineGeoJSON([...dim, ...bright]));
    }

    const arrowPath = resolveArrowPath(bright.length === 1 ? bright[0] : bright);
    if (arrowPath.length >= 2) {
        startArrowMarching(map, arrowPath);
    } else {
        stopArrowMarching();
        const arrowSrc = getSource(map, 'route-arrows-src');
        if (arrowSrc) arrowSrc.setData(EMPTY);
    }
}

export function cancelRouteAnimation(map) {
    _animId++;
    if (_currentAnim) { cancelAnimationFrame(_currentAnim); _currentAnim = null; }
    stopArrowMarching();

    if (map && !map._removed) {
        const routeSrc = getSource(map, 'route');
        const arrowSrc = getSource(map, 'route-arrows-src');
        if (routeSrc) routeSrc.setData(EMPTY);
        if (arrowSrc) arrowSrc.setData(EMPTY);
        clearRouteActiveSource(map);
    }
}
