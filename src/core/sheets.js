/**
 * Google Sheets reading helper.
 *
 * Multi-tab venues live in a single Sheets document with named tabs:
 *
 *   Zorlu_List        → birimler  (ID, Title, Category, Floor, …)
 *   Zorlu_Categories  → kategori → renk + display name + icon
 *   Info              → hizalama anchor + rotation (opsiyonel)
 *
 * The gviz endpoint accepts either a numeric `gid` query param or a
 * `sheet=<TabName>` param. We pick whichever matches the user's input —
 * if it's all digits we treat it as a gid, otherwise as a tab name.
 *
 * NOTE: this module is read-only. Writing back to the sheet uses the
 * Apps Script endpoint configured in `venue.sheets.writeEndpointUrl`
 * (see src/editor/sheet-writer.js).
 */

import { parseCSV } from './utils.js';

const GVIZ_BASE = 'https://docs.google.com/spreadsheets/d';

/**
 * Build a CSV-export URL for a single tab. `tab` may be a numeric gid
 * ("959188093") or a sheet name ("Zorlu_List"). Falsy → null.
 */
export function makeSheetUrl(sheetId, tab) {
    if (!sheetId || !tab) return null;
    const tabStr = String(tab).trim();
    if (!tabStr) return null;
    if (/^\d+$/.test(tabStr)) {
        return `${GVIZ_BASE}/${sheetId}/gviz/tq?tqx=out:csv&gid=${tabStr}`;
    }
    return `${GVIZ_BASE}/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabStr)}`;
}

/**
 * Fetch and CSV-parse a single tab. Returns an array of row objects
 * keyed by the header row. Throws if the request fails or the response
 * is HTML (which Sheets returns when access is denied — usually means
 * the sheet hasn't been shared with "Anyone with the link").
 */
export async function fetchSheetTab(sheetId, tab) {
    const url = makeSheetUrl(sheetId, tab);
    if (!url) throw new Error('sheets: missing sheetId or tab');
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error(`sheets: HTTP ${r.status} for ${tab}`);
    const text = await r.text();
    // gviz returns an HTML error page (200 OK!) when the sheet is
    // private. The first chars are predictable — bail early instead of
    // letting parseCSV produce nonsense.
    if (/^\s*<!DOCTYPE|^\s*<html/i.test(text)) {
        throw new Error(`sheets: tab "${tab}" not accessible (paylaşım iznini "Anyone with the link" yapın)`);
    }
    return parseCSV(text);
}

/**
 * Fetch a sheet tab WITHOUT treating row 1 as a header. Returns the raw
 * 2D string array (rows of cells). Useful for unstructured tabs like the
 * legacy "Info" sheet where column A is a key and column B is its value
 * — there's no header row to consume.
 *
 * Implementation note: this goes through the gviz JSON endpoint (not
 * CSV) so that decimal values like 41.067832 don't collide with the CSV
 * delimiter when the sheet is in a locale that uses comma-as-decimal
 * (TR, DE, FR …). gviz JSON returns typed values (`v: 41.067832`),
 * which we then stringify with "." as the decimal point.
 */
export async function fetchSheetTabRaw(sheetId, tab) {
    if (!sheetId || !tab) throw new Error('sheets: missing sheetId or tab');
    const tabStr = String(tab).trim();
    const base = `${GVIZ_BASE}/${sheetId}/gviz/tq?tqx=out:json&headers=0`;
    const url = /^\d+$/.test(tabStr)
        ? `${base}&gid=${tabStr}`
        : `${base}&sheet=${encodeURIComponent(tabStr)}`;
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error(`sheets: HTTP ${r.status} for ${tab}`);
    const text = await r.text();
    if (/^\s*<!DOCTYPE|^\s*<html/i.test(text)) {
        throw new Error(`sheets: tab "${tab}" not accessible (paylaşım iznini "Anyone with the link" yapın)`);
    }
    /* gviz JSON is wrapped in a JSONP-style callback:
     *   /*O_o*\/
     *   google.visualization.Query.setResponse({...});
     * Pull out the JSON payload. */
    const match = text.match(/setResponse\(([\s\S]+?)\)\s*;?\s*$/);
    if (!match) throw new Error(`sheets: "${tab}" — gviz yanıtı çözümlenemedi`);
    let payload;
    try { payload = JSON.parse(match[1]); }
    catch (e) { throw new Error('sheets: JSON parse failed: ' + e.message); }
    if (payload.status === 'error') {
        const err = payload.errors?.[0]?.detailed_message || 'gviz error';
        throw new Error('sheets: ' + err);
    }
    const rows = payload.table?.rows || [];
    return rows.map(row => (row.c || []).map(cellToString));
}

/** Convert a gviz cell ({v, f} | null) to a normalised string. Numbers
 *  always come out with "." as the decimal point regardless of the
 *  sheet's locale because gviz already gives us the raw numeric value. */
function cellToString(cell) {
    if (!cell) return '';
    const v = cell.v;
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
}

/**
 * Parse a 2-column key/value sheet (column A = key, column B = value).
 * Returns a plain `{ [key]: value }` map. Used by the legacy Info tab.
 */
export function rowsToKeyValueMap(rawRows) {
    const out = {};
    for (const row of rawRows || []) {
        if (!row || row.length < 1) continue;
        const k = String(row[0] ?? '').trim();
        if (!k) continue;
        const v = row.length > 1 ? String(row[1] ?? '').trim() : '';
        out[k] = v;
    }
    return out;
}

/**
 * Return the first non-empty tab identifier from `tabs.<key>`, falling
 * back to a list of legacy keys (e.g. `gid` for the items list). Lets us
 * keep the new `tabs.list` config working alongside older deployments
 * that still use the flat `gid` field.
 */
export function pickTab(sheetsCfg, key, ...legacyKeys) {
    if (!sheetsCfg) return null;
    const fromTabs = sheetsCfg.tabs?.[key];
    if (fromTabs && String(fromTabs).trim()) return String(fromTabs).trim();
    for (const k of legacyKeys) {
        const v = sheetsCfg[k];
        if (v && String(v).trim()) return String(v).trim();
    }
    return null;
}
