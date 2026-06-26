/**
 * Map Builder → Veri Kaynağı sekmesi.
 *
 * Daha önce ayarlar sekmesinin sonunda yer alan Sheets/API form alanlarını
 * Harita sekmesinin sidebar'ına taşır. Akış basitleşir: kullanıcı önce
 * Sheets bağlantısını burada kurar, sonra SVG yükleyip işlemeye geçer.
 *
 * Form alanları doğrudan editor config'ine (venue.dataSource, venue.sheets.*,
 * venue.api.*, venue.geojsonPath) yazılır. Her değişiklikten sonra preview
 * iframe reload tetiklenir (`app.reload(['venue.sheets.sheetId'])` gibi
 * herhangi bir requiresReload alanı bunu yapar; biz tek seferde
 * `app.reload(['venue.sheets.sheetId'])` çağırıyoruz — schema'da requiresReload
 * olarak işaretli oldukları için cold path tetiklenir).
 *
 * "Bağlantıyı test et" düğmesi 4 sekmeyi (list / categories / info /
 * writeEndpoint) sırayla yoklar ve sidebar altında küçük bir durum
 * paneli gösterir.
 */

import { fetchSheetTab, makeSheetUrl } from '../../core/sheets.js';

const PATHS = {
    source:        'venue.dataSource',
    sheetId:       'venue.sheets.sheetId',
    tabList:       'venue.sheets.tabs.list',
    tabCategories: 'venue.sheets.tabs.categories',
    tabInfo:       'venue.sheets.tabs.info',
    writeEndpoint: 'venue.sheets.writeEndpointUrl',
    gid:           'venue.sheets.gid',
    apiBase:       'venue.api.baseUrl',
    geojson:       'venue.geojsonPath',
    routingVenue:  'venue.routing.venueSlug',
    routingRoute:  'venue.routing.routeUrl',
    routingDescribe: 'venue.routing.describeUrl',
    routingDescEngine: 'venue.routing.descriptionEngine',
};

export function initDataSource(app) {
    const $ = (id) => document.getElementById(id);

    const $source   = $('mbDataSource');
    const $sheets   = $('mbDataSheets');
    const $api      = $('mbDataApi');
    const $status   = $('mbDataStatus');
    const $test     = $('mbDataTest');
    if (!$source) return; // Map Builder shell mevcut değil (örn. başka bir yerde mount)

    const $sheetsGroup = $sheets?.closest('.ed-mb-data-group');
    const $apiGroup    = $api?.closest('.ed-mb-data-group');

    /* ── İlk değerleri config'ten doldur ─────────────────────────── */
    function hydrate() {
        const cfg = app.getConfig();
        const venue = cfg?.venue || {};

        $source.value                = venue.dataSource || 'sheets';
        $('mbDataSheetId').value     = venue.sheets?.sheetId || '';
        $('mbDataTabList').value     = venue.sheets?.tabs?.list || '';
        $('mbDataTabCategories').value = venue.sheets?.tabs?.categories || '';
        $('mbDataTabInfo').value     = venue.sheets?.tabs?.info || '';
        $('mbDataWriteEndpoint').value = venue.sheets?.writeEndpointUrl || '';
        $('mbDataGid').value         = venue.sheets?.gid || '';
        $('mbDataApiBase').value     = venue.api?.baseUrl || '';
        $('mbDataGeojson').value     = venue.geojsonPath || '';
        $('mbDataRoutingVenue').value       = venue.routing?.venueSlug || '';
        $('mbDataRoutingRouteUrl').value    = venue.routing?.routeUrl || '';
        $('mbDataRoutingDescribeUrl').value = venue.routing?.describeUrl || '';
        const $descEngine = $('mbDataRoutingDescEngine');
        if ($descEngine) $descEngine.value = venue.routing?.descriptionEngine || 'ml';
        syncDescEngineUi();

        toggleSourcePanels();
    }
    hydrate();

    /* Tarif motoru seçimi: 'metric' iken describe URL alanı kullanılmaz,
     * kullanıcıya görsel olarak sönükleştirilir ve kısa bir açıklama yazılır. */
    function syncDescEngineUi() {
        const engine = $('mbDataRoutingDescEngine')?.value || 'ml';
        const $describeField = $('mbDataRoutingDescribeUrl')?.closest('.ed-mb-field');
        const $hint = $('mbDataRoutingDescEngineHint');
        const isMetric = engine === 'metric';
        if ($describeField) $describeField.dataset.disabled = isMetric ? '1' : '0';
        if ($('mbDataRoutingDescribeUrl')) $('mbDataRoutingDescribeUrl').disabled = isMetric;
        if ($hint) {
            $hint.textContent = isMetric
                ? 'Aşamalar tarayıcı içi metrik motor (route-engine) ile üretilir; insan-tarif API çağrılmaz.'
                : 'Aşamalar backend insan-tarif API’sinden (describe) alınır.';
        }
    }

    /* ── Source toggle — both panels stay visible; active source is
     * highlighted so Sheets + API can be configured side by side. ── */
    function toggleSourcePanels() {
        const isSheets = $source.value === 'sheets';
        if ($sheetsGroup) $sheetsGroup.dataset.active = isSheets ? '1' : '0';
        if ($apiGroup)    $apiGroup.dataset.active    = isSheets ? '0' : '1';
    }
    $source.addEventListener('change', () => {
        toggleSourcePanels();
        commitField(PATHS.source, $source.value);
    });

    /* ── Field bindings ─────────────────────────────────────────── */
    const fieldMap = [
        ['mbDataSheetId',       PATHS.sheetId],
        ['mbDataTabList',       PATHS.tabList],
        ['mbDataTabCategories', PATHS.tabCategories],
        ['mbDataTabInfo',       PATHS.tabInfo],
        ['mbDataWriteEndpoint', PATHS.writeEndpoint],
        ['mbDataGid',           PATHS.gid],
        ['mbDataApiBase',       PATHS.apiBase],
        ['mbDataGeojson',       PATHS.geojson],
        ['mbDataRoutingVenue',       PATHS.routingVenue],
        ['mbDataRoutingRouteUrl',    PATHS.routingRoute],
        ['mbDataRoutingDescribeUrl', PATHS.routingDescribe],
        ['mbDataRoutingDescEngine',  PATHS.routingDescEngine],
    ];
    for (const [id, path] of fieldMap) {
        const el = $(id);
        if (!el) continue;
        el.addEventListener('change', () => {
            commitField(path, (el.value || '').trim());
            if (id === 'mbDataRoutingDescEngine') syncDescEngineUi();
        });
    }

    function commitField(path, value) {
        /* Editor app, override mekanizmasıyla çalışır: setOverride
         * config'i mutate eder, localStorage'a yazar ve UI'yi yeniden
         * çizer. Veri kaynağı alanları schema'da requiresReload:true
         * olduğundan reload'u açıkça tetikliyoruz; aksi halde override
         * panelinde yeni değer görünür ama iframe eski değerle çalışır. */
        app.setOverride?.(path, value);
        app.reload?.([path]);
    }

    /* ── Bağlantı testi ─────────────────────────────────────────── */
    $test?.addEventListener('click', () => runConnectionTest());

    async function runConnectionTest() {
        const sheetId = $('mbDataSheetId').value.trim();
        const tabList = $('mbDataTabList').value.trim();
        const tabCats = $('mbDataTabCategories').value.trim();
        const tabInfo = $('mbDataTabInfo').value.trim();
        const writeUrl = $('mbDataWriteEndpoint').value.trim();
        const apiUrl = $('mbDataApiBase').value.trim();

        if ($source.value === 'api') {
            if (!apiUrl) {
                showStatus('error', 'API Birim Listesi URL boş.');
                return;
            }
            showStatus('progress', 'API test ediliyor…');
            const results = [];
            try {
                const r = await fetch(apiUrl);
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json();
                const count = Array.isArray(data) ? data.length : (data?.length ?? '?');
                results.push(['ok', `Birim listesi (${count} kayıt)`]);
            } catch (e) {
                results.push(['err', `Birim listesi — ${e.message}`]);
            }
            const allOk = results.every(r => r[0] === 'ok');
            showStatus(allOk ? 'success' : 'mixed', renderResultLines(results));
            return;
        }

        if (!sheetId) {
            showStatus('error', 'Sheet ID boş.');
            return;
        }

        showStatus('progress', 'Bağlantı test ediliyor…');
        const results = [];
        try { await fetch(makeSheetUrl(sheetId, tabList || 1)); results.push(['ok', 'Sheet erişimi']); }
        catch { results.push(['err', 'Sheet erişimi']); }

        if (tabList) {
            try {
                const rows = await fetchSheetTab(sheetId, tabList);
                results.push(['ok', `Birim listesi (${rows.length} satır)`]);
            } catch (e) { results.push(['err', `Birim listesi — ${e.message}`]); }
        }
        if (tabCats) {
            try {
                const rows = await fetchSheetTab(sheetId, tabCats);
                results.push(['ok', `Kategoriler (${rows.length} kategori)`]);
            } catch (e) { results.push(['err', `Kategoriler — ${e.message}`]); }
        }
        if (tabInfo) {
            try {
                const rows = await fetchSheetTab(sheetId, tabInfo);
                results.push(['ok', `Info (${rows.length} satır)`]);
            } catch (e) { results.push(['err', `Info — ${e.message}`]); }
        }
        if (writeUrl) {
            try {
                const r = await fetch(writeUrl + (writeUrl.includes('?') ? '&' : '?') + 'ping=1');
                results.push([r.ok ? 'ok' : 'warn', `Yazma endpoint — HTTP ${r.status}`]);
            } catch (e) { results.push(['err', `Yazma endpoint — ${e.message}`]); }
        }

        const allOk = results.every(r => r[0] === 'ok');
        showStatus(allOk ? 'success' : 'mixed', renderResultLines(results));
    }

    function renderResultLines(rows) {
        return rows.map(([k, t]) =>
            `<div class="ed-mb-data-status-line is-${k}">
                <span class="dot"></span><span>${escapeHtml(t)}</span>
            </div>`
        ).join('');
    }
    function showStatus(kind, html) {
        if (!$status) return;
        $status.hidden = false;
        $status.dataset.kind = kind;
        $status.innerHTML = html;
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
        );
    }

    /* Diğer modüller override'ı değiştirip storage'ı tazelerse formun
     * eski değerleri göstermemesi için minimal bir re-hydrate kancası:
     * sekmeye geri girildiğinde shell tekrar mount edilir. Şimdilik
     * yeterli — gerekirse global bir 'config:changed' event'i eklenir. */
}
