/**
 * Serialize the merged config back into a valid `config.js` source file.
 *
 * Strategy: fetch the default config.js text, then insert the serialized object
 * inline, preserving any top-level comments/header that were in the original.
 * Falls back to a pure-generated file if fetching fails.
 *
 * Special handling:
 *   - Known expression paths (e.g. 3D model rotations using Math.PI) are emitted
 *     as expressions, not numbers, when their value equals the known default.
 */

const EXPR_PATHS = {
    // Keep 3D model rotations as Math.PI/2 when possible.
    'features.models3d.models': (models) => {
        if (!Array.isArray(models)) return JSON.stringify(models);
        return '[\n' + models.map((m, i) => {
            const rot = m.rotation;
            const rotStr = Array.isArray(rot) && rot.length === 3
                ? `[${rot.map(v => {
                      // convert any value that looks like π/2 back to symbolic form
                      if (Math.abs(v - Math.PI / 2) < 1e-9) return 'Math.PI / 2';
                      if (Math.abs(v - Math.PI)     < 1e-9) return 'Math.PI';
                      if (Math.abs(v + Math.PI / 2) < 1e-9) return '-Math.PI / 2';
                      return String(v);
                  }).join(', ')}]`
                : serializeValue(rot, '        ');
            return `        {
            id: ${JSON.stringify(m.id)},
            url: ${JSON.stringify(m.url)},
            origin: ${JSON.stringify(m.origin)},
            altitude: ${m.altitude ?? 0},
            rotation: ${rotStr},
            scale: ${m.scale},
        }`;
        }).join(',\n') + '\n    ]';
    },
};

/**
 * Default serializer — JSON-like but with unquoted keys and single-quoted strings.
 */
function serializeValue(value, indent = '') {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'string') {
        // use single-quotes, escaping embedded ones
        return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const allPrimitive = value.every(v => v === null || ['number','string','boolean'].includes(typeof v));
        if (allPrimitive) {
            return '[' + value.map(v => serializeValue(v, indent)).join(', ') + ']';
        }
        const ind = indent + '    ';
        return '[\n' + value.map(v => ind + serializeValue(v, ind)).join(',\n') + '\n' + indent + ']';
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        const ind = indent + '    ';
        return '{\n' + keys.map(k => {
            const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
            return ind + safeKey + ': ' + serializeValueForKey(value[k], k, ind, []);
        }).join(',\n') + '\n' + indent + '}';
    }
    return String(value);
}

function serializeValueForKey(v, key, indent, parentPath) {
    const path = [...parentPath, key].join('.');
    if (EXPR_PATHS[path]) return EXPR_PATHS[path](v);
    // recurse with path tracking
    return serializeValueWithPath(v, indent, [...parentPath, key]);
}

function serializeValueWithPath(value, indent, parentPath) {
    const fullPath = parentPath.join('.');
    if (EXPR_PATHS[fullPath]) return EXPR_PATHS[fullPath](value);

    if (value === null || value === undefined) return String(value);
    if (typeof value !== 'object') return serializeValue(value, indent);
    if (Array.isArray(value)) return serializeValue(value, indent);

    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const ind = indent + '    ';
    return '{\n' + keys.map(k => {
        const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        return ind + safeKey + ': ' + serializeValueWithPath(value[k], ind, [...parentPath, k]);
    }).join(',\n') + '\n' + indent + '}';
}

const VALID_INTERFACES = ['web', 'kiosk', 'kiosk-portrait', 'mobile'];

/**
 * Produce an interface-scoped copy of the config for export.
 *
 * - `interfaces` is set to the selected list and `initialView` is derived:
 *   a single interface pins the build to it; multiple interfaces ship as
 *   'auto' (the runtime resolver picks web↔mobile by viewport).
 * - Interface-specific theme blocks that aren't shipped are dropped so the
 *   exported config only carries the selected interfaces' configuration.
 */
export function filterConfigForInterfaces(configObj, interfaces) {
    const sel = (Array.isArray(interfaces) ? interfaces : []).filter(i => VALID_INTERFACES.includes(i));
    const list = sel.length ? sel : VALID_INTERFACES.slice();

    const out = (typeof structuredClone === 'function')
        ? structuredClone(configObj)
        : JSON.parse(JSON.stringify(configObj));

    out.interfaces = list;
    out.initialView = list.length === 1 ? list[0] : 'auto';

    if (out.theme && typeof out.theme === 'object') {
        if (!list.includes('mobile')) delete out.theme.mobile;
        if (!list.includes('kiosk-portrait')) delete out.theme.kioskPortrait;
    }

    return out;
}

/**
 * Produce a `config.js` source string from a merged config object.
 */
export function generateConfigJs(configObj) {
    const header = `/**
 * Generated by Config Editor on ${new Date().toISOString()}
 *
 * Yalnızca editörde değiştirilen değerler merkezi konfigürasyonla birleştirildi.
 * Bu dosyayı olduğu gibi "src/core/config.js" üzerine kaydedebilirsin.
 */

`;
    const body = 'export const config = ' + serializeValueWithPath(configObj, '', []) + ';\n';
    return header + body;
}

/**
 * Trigger a browser download of the generated config.js.
 */
export function downloadConfigJs(configObj, filename = 'config.js') {
    const src = generateConfigJs(configObj);
    const blob = new Blob([src], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
