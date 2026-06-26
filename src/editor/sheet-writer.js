/**
 * Tiny client for the venue's Apps Script web app.
 *
 * The endpoint URL lives at `venue.sheets.writeEndpointUrl` (see
 * apps-script/sheet-writer.gs for the server-side script + deployment
 * instructions).
 *
 * Operations:
 *
 *   upsertRows({ sheetId, tab, keyColumn, rows, deleteKeys? })
 *     → matches each `row[keyColumn]` against the existing sheet, then
 *       updates in place when found and appends otherwise. `deleteKeys`
 *       is an array of key values whose rows should be removed.
 *
 *   ping({ url })
 *     → quick health-check, used by the editor to validate a freshly
 *       pasted endpoint URL before saving.
 *
 * The Apps Script returns `{ok: bool, ...}`; we wrap network failures
 * the same way so callers only need to check `.ok`.
 */

import { config } from '../core/config.js';

/* Endpoint URL resolution order:
 *   1. explicit `endpointUrl` field on the call (editor passes this when
 *      it has a fresher value from `app.getConfig()` — necessary because
 *      the static `config` import does NOT see editor overrides stored
 *      in localStorage),
 *   2. fallback to the static config — used at runtime in the kiosk app. */
function resolveEndpoint(payload) {
    if (payload?.endpointUrl) return String(payload.endpointUrl).trim();
    return config.venue?.sheets?.writeEndpointUrl || '';
}

async function postJson(payload) {
    const url = resolveEndpoint(payload);
    if (!url) return { ok: false, error: 'Endpoint URL boş' };

    // Don't ship the URL in the actual POST body — it's just transport.
    const { endpointUrl: _drop, ...requestBody } = payload;
    try {
        // Apps Script doPost cannot read JSON body with a non-simple
        // Content-Type without triggering a CORS preflight that
        // GoogleUserContent typically *blocks*. Workaround: send as
        // text/plain and let the script parse it.
        const r = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(requestBody),
        });
        const text = await r.text();
        let responseBody;
        try { responseBody = JSON.parse(text); }
        catch {
            return { ok: false, error: `Geçersiz yanıt: ${text.slice(0, 200)}` };
        }
        if (!r.ok || responseBody?.ok === false) {
            return { ok: false, error: responseBody?.error || `HTTP ${r.status}` };
        }
        return { ok: true, ...responseBody };
    } catch (e) {
        return { ok: false, error: e.message || String(e) };
    }
}

export const sheetWriter = {
    /**
     * Upsert a batch of rows into the given sheet tab. Each row must
     * include the `keyColumn` so the script can find / write the right
     * line. `endpointUrl` overrides the static config — required when
     * called from the editor (which holds the URL in app.getConfig()).
     */
    async upsertRows({ sheetId, tab, keyColumn, rows, deleteKeys, endpointUrl }) {
        return postJson({
            op: 'upsertRows',
            sheetId,
            tab,
            keyColumn,
            rows: rows || [],
            deleteKeys: deleteKeys || [],
            endpointUrl,
        });
    },

    /** Single-row update by key. Convenience for the Birimler tab where
     *  each save is a single item. */
    async updateRow({ sheetId, tab, keyColumn, key, values, endpointUrl }) {
        return postJson({
            op: 'updateRow',
            sheetId,
            tab,
            keyColumn,
            key,
            values,
            endpointUrl,
        });
    },

    /** GET-style health check. Returns {ok, version} on success. */
    async ping(url) {
        if (!url) return { ok: false, error: 'URL boş' };
        try {
            const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'op=ping', {
                method: 'GET',
                mode: 'cors',
            });
            const text = await r.text();
            try {
                const json = JSON.parse(text);
                return { ok: !!json?.ok, ...json };
            } catch {
                return { ok: false, error: `Geçersiz yanıt: ${text.slice(0, 200)}` };
            }
        } catch (e) {
            return { ok: false, error: e.message };
        }
    },
};
