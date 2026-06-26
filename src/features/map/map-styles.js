import { config } from '../../core/config.js';
import { dataStore } from '../../core/state.js';

/**
 * Color expression with two-tier resolution:
 *
 *   1. If the feature has a `primaryCategory` (injected from the sheet's
 *      Category column on locations:loaded), look up the category's
 *      color from the loaded category mapping.
 *   2. Otherwise fall back to the sublayer-based palette from
 *      `config.features.map.sublayerColors`.
 *
 * The expression rebuilds itself every time the layer is added/repainted,
 * so updating the category mapping requires reapplying the layer (the
 * map module already does this via `applyLayerStyle`).
 */
/* Validate a CSS color so a single bad value (e.g. a malformed hex typed into
 * the categories sheet like "#C42ABT") can't poison the whole MapLibre color
 * expression — MapLibre rejects the ENTIRE expression on one unparseable color,
 * which blanks every room (no fill, no walls). We accept #rgb/#rgba/#rrggbb/
 * #rrggbbaa and common rgb()/hsl()/named forms, and drop anything else. */
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function isValidColor(c) {
    if (typeof c !== 'string') return false;
    const v = c.trim();
    if (!v) return false;
    if (v.startsWith('#')) return HEX_RE.test(v);
    // Non-hex: allow functional/named colors (rgb/hsl/var/transparent/word).
    return /^(rgb|hsl)a?\(|^var\(|^[a-zA-Z]+$/.test(v);
}

export function buildColorExpr() {
    const sublayerColors = config.features.map.sublayerColors || {};

    const subExpr = ['match', ['get', 'sublayer']];
    for (const [sl, c] of Object.entries(sublayerColors)) {
        if (isValidColor(c)) subExpr.push(sl, c);
    }
    subExpr.push('#cccccc');

    const cats = dataStore?.categoryMapping?.categories || [];
    if (!cats.length) return subExpr; // no categories yet — pure sublayer mode

    const catExpr = ['match', ['get', 'primaryCategory']];
    let validCats = 0;
    for (const c of cats) {
        if (c?.apiKey && isValidColor(c?.color)) { catExpr.push(c.apiKey, c.color); validCats++; }
        else if (c?.apiKey && c?.color) {
            console.warn(`[map-styles] Geçersiz kategori rengi atlandı: "${c.apiKey}" → "${c.color}"`);
        }
    }
    catExpr.push(subExpr); // fallback: try sublayer color
    // `match` requires at least one label/output pair; if every category color
    // was invalid, skip the cat layer entirely and use sublayer colors.
    if (!validCats) return subExpr;

    // `primaryCategory` is a string property; `has` returns false for
    // missing or empty values, so the second branch picks up legacy
    // features without categories.
    return [
        'case',
        ['all',
            ['has', 'primaryCategory'],
            ['!=', ['get', 'primaryCategory'], ''],
        ],
        catExpr,
        subExpr,
    ];
}

export function buildHeightExpr() {
    const heights = config.features.map.sublayerHeights;
    const expr = ['match', ['get', 'sublayer']];
    for (const [sl, val] of Object.entries(heights)) expr.push(sl, val);
    expr.push(5);
    return expr;
}
