/**
 * Inmapper Kiosk · Apps Script Sheet Writer
 * ──────────────────────────────────────────
 *
 * Bu Apps Script web app'i, editor'ın Birimler ve Kategoriler
 * sekmelerinden gelen düzenlemeleri Google Sheets'e geri yazar.
 *
 * KURULUM
 * -------
 *   1. https://script.google.com adresine gidin → "Yeni proje".
 *   2. Bu dosyanın TÜM içeriğini Code.gs içine yapıştırın.
 *   3. Üst menüden "Deploy" → "New deployment" → "Web app".
 *        - Description       : Inmapper Sheet Writer
 *        - Execute as         : Me
 *        - Who has access     : Anyone (anonim okumayı/yazmayı destekler)
 *      Deploy → URL'i kopyalayın.
 *   4. Editor → Ayarlar → "Sheets Yazma Endpoint" alanına URL'i yapıştırın.
 *
 * SHEET ID GÜVENLİĞİ
 * ------------------
 * Bu script gelen istekteki `sheetId`'i açar. Yanlış kişiler endpoint'i
 * kullanmasın diye `ALLOWED_SHEET_IDS` listesine sadece izin verdiğiniz
 * sheet ID'lerini ekleyin. Liste boş ise (varsayılan) HER sheet ID
 * yazılabilir — kapalı bir alan kurmak istiyorsanız MUTLAKA listeyi
 * doldurun.
 *
 * DESTEKLENEN İŞLEMLER
 * --------------------
 *   GET  ?op=ping
 *     → { ok: true, version: "..." }
 *
 *   POST { op: "upsertRows", sheetId, tab, keyColumn, rows[], deleteKeys[] }
 *     - keyColumn ile satırları bul → patch'le; yoksa ekle.
 *     - deleteKeys: bu key değerlerine sahip satırları siler.
 *
 *   POST { op: "updateRow", sheetId, tab, keyColumn, key, values }
 *     - Tek satır pratiği — Birimler tab'i için.
 */

const VERSION = '1.0.0';

/* Allowlist — boş bırakırsanız tüm sheet'ler yazılabilir. */
const ALLOWED_SHEET_IDS = [
  // '1oyRNQNzcZ46pvV76rH8hK-k3QkUNfGqZ',
];

function doGet(e) {
  const op = (e?.parameter?.op || '').toLowerCase();
  if (op === 'ping') {
    return jsonOut({ ok: true, version: VERSION });
  }
  return jsonOut({ ok: false, error: 'Unsupported GET. Use POST.' });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents || '{}');
  } catch (err) {
    return jsonOut({ ok: false, error: 'Geçersiz JSON' });
  }

  const op = (body.op || '').trim();
  try {
    switch (op) {
      case 'ping':       return jsonOut({ ok: true, version: VERSION });
      case 'upsertRows': return handleUpsertRows(body);
      case 'updateRow':  return handleUpdateRow(body);
      default:           return jsonOut({ ok: false, error: 'Unknown op: ' + op });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/* ──────────────────────── handlers ─────────────────────────────── */

function handleUpsertRows(body) {
  const { sheetId, tab, keyColumn, rows, deleteKeys } = body;
  guardSheetId(sheetId);
  if (!tab) throw new Error('tab boş');
  if (!keyColumn) throw new Error('keyColumn boş');

  const sheet = openTab(sheetId, tab);
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (!values.length) throw new Error('Sayfa boş — header bulunamadı');

  const header = values[0].map(String);
  const keyIdx = header.indexOf(keyColumn);
  if (keyIdx < 0) throw new Error(`keyColumn "${keyColumn}" header'da yok`);

  // Auto-extend the header with any new columns present in the incoming rows
  // (e.g. Hours / Images / Related) so newly-added fields are written without
  // hand-editing the sheet first. Existing columns are left untouched.
  const newCols = [];
  for (const r of (rows || [])) {
    for (const k of Object.keys(r || {})) {
      if (k && header.indexOf(k) < 0 && newCols.indexOf(k) < 0) newCols.push(k);
    }
  }
  if (newCols.length) {
    sheet.getRange(1, header.length + 1, 1, newCols.length).setValues([newCols]);
    for (const c of newCols) header.push(c);
  }

  // index existing key → row index (1-based for Sheets API)
  const keyRow = new Map();
  for (let i = 1; i < values.length; i++) {
    const k = String(values[i][keyIdx] || '').trim();
    if (k) keyRow.set(k, i);
  }

  // ── 1. Deletes ────────────────────────────────────────────────
  if (Array.isArray(deleteKeys) && deleteKeys.length) {
    // Sheet rows shift on delete, so do them bottom-up.
    const toDelete = deleteKeys
      .map(k => keyRow.get(String(k).trim()))
      .filter(i => i !== undefined)
      .sort((a, b) => b - a);
    for (const i of toDelete) {
      sheet.deleteRow(i + 1); // +1 because keyRow is 0-based
      keyRow.delete(deleteKeys[deleteKeys.length - 1]); // best-effort cleanup
    }
  }

  // After deletes, refresh values + keyRow.
  const fresh = sheet.getDataRange().getValues();
  const newKeyRow = new Map();
  for (let i = 1; i < fresh.length; i++) {
    const k = String(fresh[i][keyIdx] || '').trim();
    if (k) newKeyRow.set(k, i);
  }

  // ── 2. Upserts ────────────────────────────────────────────────
  const updated = [];
  const inserted = [];
  for (const r of rows || []) {
    const key = String(r[keyColumn] || '').trim();
    if (!key) continue;
    const existing = newKeyRow.get(key);
    if (existing !== undefined) {
      // Update only the columns provided — leave others untouched.
      const rowVals = fresh[existing].slice();
      for (let c = 0; c < header.length; c++) {
        if (Object.prototype.hasOwnProperty.call(r, header[c])) {
          rowVals[c] = r[header[c]];
        }
      }
      sheet.getRange(existing + 1, 1, 1, header.length).setValues([rowVals]);
      updated.push(key);
    } else {
      // Append a new row matching the header order.
      const rowVals = header.map(h => (Object.prototype.hasOwnProperty.call(r, h) ? r[h] : ''));
      sheet.appendRow(rowVals);
      inserted.push(key);
    }
  }

  return jsonOut({
    ok: true,
    updated, inserted,
    deleted: (deleteKeys || []).filter(k => keyRow.has(String(k).trim())),
  });
}

function handleUpdateRow(body) {
  const { sheetId, tab, keyColumn, key, values } = body;
  return handleUpsertRows({
    sheetId, tab, keyColumn,
    rows: [{ ...(values || {}), [keyColumn]: key }],
  });
}

/* ──────────────────────── helpers ──────────────────────────────── */

function guardSheetId(id) {
  if (!id) throw new Error('sheetId boş');
  if (ALLOWED_SHEET_IDS.length && !ALLOWED_SHEET_IDS.includes(id)) {
    throw new Error('İzin verilmeyen sheetId');
  }
}

function openTab(sheetId, tab) {
  const ss = SpreadsheetApp.openById(sheetId);
  // `tab` may be a tab name or a numeric gid.
  if (/^\d+$/.test(String(tab))) {
    const gid = Number(tab);
    const sheets = ss.getSheets();
    for (const s of sheets) {
      if (s.getSheetId() === gid) return s;
    }
    throw new Error('gid bulunamadı: ' + tab);
  }
  const sheet = ss.getSheetByName(String(tab));
  if (!sheet) throw new Error('Sayfa bulunamadı: ' + tab);
  return sheet;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
