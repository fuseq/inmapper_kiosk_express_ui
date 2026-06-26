/**
 * Minimal, dependency-free XML/SVG parser.
 *
 * Produces a uniform element tree so the rest of the engine never depends on
 * the host's DOM. Works identically in the browser and in Node, which keeps
 * routing results deterministic across environments.
 *
 * Node shape: { tag, attrs: { [name]: value }, children: Node[] }
 * Only element nodes are kept (text/comments/PI/CDATA are skipped) since the
 * SVG schema we consume carries all data in attributes (id, d, x1, y1, ...).
 *
 * This is intentionally small and tolerant rather than a spec-complete XML
 * parser: it handles the well-formed Inkscape/inMapper SVG export reliably
 * (elements, attributes with single/double quotes, self-closing tags,
 * namespaces such as `inkscape:label`, declarations, comments, CDATA,
 * DOCTYPE).
 */

const TAG_RE = /<([!?/]?)([a-zA-Z0-9:_-]*)([^>]*?)(\/?)>/g;
const ATTR_RE = /([a-zA-Z0-9:_.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

function decodeEntities(value) {
    if (value.indexOf('&') === -1) return value;
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
        .replace(/&amp;/g, '&');
}

function parseAttrs(raw) {
    const attrs = {};
    if (!raw) return attrs;
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(raw)) !== null) {
        const name = m[1];
        const value = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : '');
        attrs[name] = decodeEntities(value);
    }
    return attrs;
}

/**
 * Parse an XML/SVG string into a single root element node.
 * Returns null if no root element is found.
 */
export function parseXml(xmlText) {
    if (typeof xmlText !== 'string' || !xmlText.length) return null;

    // Strip comments, CDATA and DOCTYPE bodies up-front so their contents
    // never confuse the tag scanner (they cannot contain real elements we
    // care about).
    const text = xmlText
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '');

    const root = { tag: '#root', attrs: {}, children: [] };
    const stack = [root];

    let m;
    TAG_RE.lastIndex = 0;
    while ((m = TAG_RE.exec(text)) !== null) {
        const prefix = m[1];      // '', '/', '!', '?'
        const tag = m[2];
        const attrRaw = m[3] || '';
        const selfClose = m[4] === '/';

        if (prefix === '?' || prefix === '!') continue;       // declaration / DOCTYPE leftovers
        if (!tag) continue;

        if (prefix === '/') {
            // Closing tag: pop the nearest matching open element.
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].tag === tag) {
                    stack.length = i;
                    break;
                }
            }
            continue;
        }

        const node = { tag, attrs: parseAttrs(attrRaw), children: [] };
        stack[stack.length - 1].children.push(node);
        if (!selfClose) stack.push(node);
    }

    // Return the first real element child of the synthetic root.
    return root.children.find(c => c.tag && c.tag !== '#root') || null;
}

/** Local name of a (possibly namespaced) tag: `svg:g` -> `g`. */
export function localName(tag) {
    const i = tag.indexOf(':');
    return i === -1 ? tag : tag.slice(i + 1);
}

/** Depth-first iterator over all descendant elements (excluding `node`). */
export function* descendants(node) {
    if (!node || !node.children) return;
    for (const child of node.children) {
        yield child;
        yield* descendants(child);
    }
}

/** All descendants whose local tag name matches `name`. */
export function findAllByTag(node, name) {
    const out = [];
    for (const el of descendants(node)) {
        if (localName(el.tag) === name) out.push(el);
    }
    return out;
}

/** Direct element children whose local tag name matches `name`. */
export function childrenByTag(node, name) {
    if (!node || !node.children) return [];
    return node.children.filter(c => localName(c.tag) === name);
}

/**
 * Find a `<g>` group by its `id` or `inkscape:label`, searched anywhere under
 * `root`. Mirrors the backend which accepts either attribute so venue SVGs
 * exported from Inkscape (label) or tooling (id) both resolve.
 */
export function findGroup(root, name) {
    for (const el of descendants(root)) {
        if (localName(el.tag) !== 'g') continue;
        if (el.attrs.id === name) return el;
        if (el.attrs['inkscape:label'] === name) return el;
    }
    return null;
}
