/**
 * Tiny helpers for dot-path access and deep-merge (no external deps).
 */

export function getByPath(obj, path) {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return cur;
}

export function setByPath(obj, path, value) {
    if (!obj || !path) return obj;
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const k = parts[i];
        if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
        cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
}

/**
 * Recursive deep-merge. Arrays are REPLACED, not merged.
 * Mutates `target` and returns it.
 */
export function deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const key of Object.keys(source)) {
        const sv = source[key];
        if (Array.isArray(sv)) {
            target[key] = sv.slice();
        } else if (sv && typeof sv === 'object') {
            if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                target[key] = {};
            }
            deepMerge(target[key], sv);
        } else {
            target[key] = sv;
        }
    }
    return target;
}

/**
 * Deep clone via structured clone if available, else JSON fallback.
 */
export function deepClone(value) {
    if (typeof structuredClone === 'function') {
        try { return structuredClone(value); } catch { /* fall through */ }
    }
    return JSON.parse(JSON.stringify(value));
}
