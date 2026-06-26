/**
 * IndexedDB-backed store for the editor's "venue project" assets.
 *
 * Two layouts coexist:
 *
 *   1. Multi-floor layout (preferred):
 *        kv:floors                → [{key, name, order}]
 *        kv:activeFloorKey        → string
 *        kv:floor:{key}:svg
 *        kv:floor:{key}:geojson
 *        kv:floor:{key}:meta
 *        kv:floor:{key}:heights
 *        kv:floor:{key}:placedIcons
 *        kv:floor:{key}:labelSizes
 *
 *   2. Legacy flat layout (single floor only) — older sessions wrote
 *      svg/geojson/meta/heights/placedIcons/labelSizes directly under kv.
 *      `migrateLegacy()` runs once on first open to lift those into a
 *      synthetic floor "0" (Zemin Kat) and delete the old keys.
 *
 * Categories and custom-icon Blobs stay shared across floors.
 *
 * Config overrides intentionally remain in localStorage (kiosk:configOverrides)
 * because they are tiny and shared with the existing preview-bridge logic.
 */

const DB_NAME = 'kiosk-editor-store';
const DB_VERSION = 1;
const STORE_KV = 'kv';
const STORE_ICONS = 'icons';

let _dbPromise = null;
let _migratePromise = null;

function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_KV)) {
                db.createObjectStore(STORE_KV);
            }
            if (!db.objectStoreNames.contains(STORE_ICONS)) {
                db.createObjectStore(STORE_ICONS, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return _dbPromise;
}

function tx(db, names, mode = 'readonly') {
    return db.transaction(names, mode);
}

function reqToPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/* ── KV store ────────────────────────────────────────────────────────── */

async function kvGet(key) {
    const db = await openDB();
    return reqToPromise(tx(db, STORE_KV).objectStore(STORE_KV).get(key));
}

async function kvSet(key, value) {
    const db = await openDB();
    const t = tx(db, STORE_KV, 'readwrite');
    t.objectStore(STORE_KV).put(value, key);
    return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}

async function kvDelete(key) {
    const db = await openDB();
    const t = tx(db, STORE_KV, 'readwrite');
    t.objectStore(STORE_KV).delete(key);
    return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}

async function kvKeys() {
    const db = await openDB();
    return reqToPromise(tx(db, STORE_KV).objectStore(STORE_KV).getAllKeys());
}

/* ── Icons store ─────────────────────────────────────────────────────── */

async function iconsAdd(record) {
    const db = await openDB();
    const t = tx(db, STORE_ICONS, 'readwrite');
    t.objectStore(STORE_ICONS).put(record);
    return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve(record);
        t.onerror = () => reject(t.error);
    });
}

async function iconsGetAll() {
    const db = await openDB();
    return reqToPromise(tx(db, STORE_ICONS).objectStore(STORE_ICONS).getAll());
}

async function iconsGet(id) {
    const db = await openDB();
    return reqToPromise(tx(db, STORE_ICONS).objectStore(STORE_ICONS).get(id));
}

async function iconsDelete(id) {
    const db = await openDB();
    const t = tx(db, STORE_ICONS, 'readwrite');
    t.objectStore(STORE_ICONS).delete(id);
    return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}

async function iconsClear() {
    const db = await openDB();
    const t = tx(db, STORE_ICONS, 'readwrite');
    t.objectStore(STORE_ICONS).clear();
    return new Promise((resolve, reject) => {
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}

/* ── Key helpers ─────────────────────────────────────────────────────── */

const KEYS = {
    // Multi-floor index
    floors:        'floors',
    activeFloor:   'activeFloorKey',
    migrated:      '__multiFloorMigrated',

    // Shared (not per-floor)
    categories:        'categories',
    projectAlignment:  'projectAlignment',  // {centerLat, centerLng, scale, rotation}

    // Item edits — sheet write-back queue.
    // {[id]: {patch:{Title, Category, Subtitle, ...}, primaryCategory, dirty:bool, lastModified:ISO}}
    itemEdits:        'itemEdits',

    // Legacy flat keys (kept for migration; new code should never write these)
    svg:           'svg',
    geojson:       'geojson',
    meta:          'meta',
    heights:       'heights',
    placedIcons:   'placedIcons',
    labelSizes:    'labelSizes',
};

const fkSvg     = (k) => `floor:${k}:svg`;
const fkGeojson = (k) => `floor:${k}:geojson`;
const fkMeta    = (k) => `floor:${k}:meta`;
const fkHeights = (k) => `floor:${k}:heights`;
const fkPlaced  = (k) => `floor:${k}:placedIcons`;
const fkLabels  = (k) => `floor:${k}:labelSizes`;
/* Per-floor 3D model placements: [{ id, url, name, origin:[lng,lat],
 * altitude, scale, rotation:[x,y,z] }]. Merged into config.features.
 * models3d.models at export / preview time. */
const fkModels  = (k) => `floor:${k}:models3d`;
/* Per-floor alignment override.
 *
 * Most floors stack on top of each other and just inherit the project-
 * wide alignment (KEYS.projectAlignment). For irregular venues — e.g.
 * an upper tower with a smaller footprint than the base — the user can
 * pin a floor to its own centre/scale/rotation by writing a record
 * here. Absent or null  ⇒  inherit from project. */
const fkAlignment = (k) => `floor:${k}:alignment`;

const DEFAULT_FLOOR = { key: '0', name: 'Zemin Kat', order: 0 };

/* ── Migration ───────────────────────────────────────────────────────── */

/**
 * One-time migration: if this DB still uses the flat single-floor layout,
 * lift each legacy key into floor:0:* and seed the floors index. Idempotent.
 */
async function migrateLegacy() {
    if (_migratePromise) return _migratePromise;
    _migratePromise = (async () => {
        const flag = await kvGet(KEYS.migrated);
        if (flag) return;

        const existingFloors = await kvGet(KEYS.floors);
        if (Array.isArray(existingFloors) && existingFloors.length) {
            // Already on the new layout — just stamp the marker.
            await kvSet(KEYS.migrated, true);
            return;
        }

        // Pull every legacy flat blob.
        const [svg, gj, meta, heights, placed, labels] = await Promise.all([
            kvGet(KEYS.svg),
            kvGet(KEYS.geojson),
            kvGet(KEYS.meta),
            kvGet(KEYS.heights),
            kvGet(KEYS.placedIcons),
            kvGet(KEYS.labelSizes),
        ]);

        const writes = [];
        if (svg     != null) writes.push(kvSet(fkSvg(DEFAULT_FLOOR.key),     svg));
        if (gj      != null) writes.push(kvSet(fkGeojson(DEFAULT_FLOOR.key), gj));
        if (meta    != null) writes.push(kvSet(fkMeta(DEFAULT_FLOOR.key),    meta));
        if (heights != null) writes.push(kvSet(fkHeights(DEFAULT_FLOOR.key), heights));
        if (placed  != null) writes.push(kvSet(fkPlaced(DEFAULT_FLOOR.key),  placed));
        if (labels  != null) writes.push(kvSet(fkLabels(DEFAULT_FLOOR.key),  labels));
        await Promise.all(writes);

        await kvSet(KEYS.floors, [{ ...DEFAULT_FLOOR }]);
        await kvSet(KEYS.activeFloor, DEFAULT_FLOOR.key);

        // Wipe the old flat keys so we don't double-read.
        await Promise.all([
            kvDelete(KEYS.svg),
            kvDelete(KEYS.geojson),
            kvDelete(KEYS.meta),
            kvDelete(KEYS.heights),
            kvDelete(KEYS.placedIcons),
            kvDelete(KEYS.labelSizes),
        ]);

        await kvSet(KEYS.migrated, true);
    })().catch(err => {
        console.warn('[storage] migration failed', err);
    });
    return _migratePromise;
}

/* ── Floor index API ─────────────────────────────────────────────────── */

async function getFloors() {
    await migrateLegacy();
    let list = await kvGet(KEYS.floors);
    if (!Array.isArray(list) || list.length === 0) {
        list = [{ ...DEFAULT_FLOOR }];
        await kvSet(KEYS.floors, list);
    }
    // Always return sorted by order.
    return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

async function setFloors(list) {
    await kvSet(KEYS.floors, Array.isArray(list) ? list : []);
    notifyChange();
}

async function getActiveFloorKey() {
    await migrateLegacy();
    const k = await kvGet(KEYS.activeFloor);
    if (k) return k;
    const floors = await getFloors();
    return floors[0]?.key ?? DEFAULT_FLOOR.key;
}

async function setActiveFloorKey(key) {
    await kvSet(KEYS.activeFloor, key);
    notifyChange();
}

async function addFloor({ key, name, order }) {
    const floors = await getFloors();
    if (floors.some(f => f.key === key)) {
        throw new Error(`Floor key "${key}" already exists`);
    }
    const next = [...floors, { key, name: name || key, order: order ?? floors.length }];
    await setFloors(next);
    return next;
}

async function renameFloor(key, name) {
    const floors = await getFloors();
    const next = floors.map(f => f.key === key ? { ...f, name } : f);
    await setFloors(next);
    return next;
}

async function reorderFloor(key, newOrder) {
    const floors = await getFloors();
    const next = floors.map(f => f.key === key ? { ...f, order: newOrder } : f);
    await setFloors(next);
    return next;
}

/* ── Project-level alignment ─────────────────────────────────────────
 *
 * Floors that belong to the same building share the same world-position:
 * once the user has aligned floor 0 to a real-world location, every other
 * floor's SVG is converted using the same centre/scale/rotation so they
 * stack on top of each other. The alignment lives at the project level
 * (one record shared by all floors) instead of per-floor.
 */
async function getProjectAlignment() {
    await migrateLegacy();
    const direct = await kvGet(KEYS.projectAlignment);
    if (direct && Number.isFinite(direct.scale)) return direct;
    // Back-compat: derive from floor:0:meta the first time we read.
    const floors = await getFloors();
    for (const f of floors) {
        const meta = await getFloorMeta(f.key);
        if (meta && (meta.centerLat || meta.centerLng || meta.scale || meta.rotation)) {
            const seeded = {
                centerLat: meta.centerLat ?? 0,
                centerLng: meta.centerLng ?? 0,
                scale:     meta.scale     ?? 0.03,
                rotation:  meta.rotation  ?? 0,
            };
            await kvSet(KEYS.projectAlignment, seeded);
            return seeded;
        }
    }
    return { centerLat: 0, centerLng: 0, scale: 0.03, rotation: 0 };
}

async function setProjectAlignment(alignment) {
    const safe = {
        centerLat: alignment?.centerLat ?? 0,
        centerLng: alignment?.centerLng ?? 0,
        scale:     alignment?.scale     ?? 0.03,
        rotation:  alignment?.rotation  ?? 0,
    };
    await kvSet(KEYS.projectAlignment, safe);
    notifyChange();
    return safe;
}

async function deleteFloor(key) {
    const floors = await getFloors();
    const remaining = floors.filter(f => f.key !== key);

    // Wipe the deleted floor's per-floor blobs.
    await Promise.all([
        kvDelete(fkSvg(key)),
        kvDelete(fkGeojson(key)),
        kvDelete(fkMeta(key)),
        kvDelete(fkHeights(key)),
        kvDelete(fkPlaced(key)),
        kvDelete(fkLabels(key)),
        kvDelete(fkAlignment(key)),
        kvDelete(fkModels(key)),
    ]);

    // If this was the last floor in the project we don't leave the
    // editor in a "no floors at all" state — instead we replace it
    // with a fresh empty default floor (key "0"). This effectively
    // resets the venue map while keeping every other config setting
    // (theme, branding, categories, …) intact, which is what users
    // expect when they hit delete on the last remaining floor.
    if (remaining.length === 0) {
        const fallback = { ...DEFAULT_FLOOR };
        await setFloors([fallback]);
        await setActiveFloorKey(fallback.key);
        // Also clear the shared alignment — without any SVG the old
        // centre/scale/rotation are meaningless and would just confuse
        // the next upload.
        await kvDelete(KEYS.projectAlignment);
        return [fallback];
    }

    await setFloors(remaining);
    // If the deleted floor was active, fall back to the first remaining.
    const active = await getActiveFloorKey();
    if (active === key) await setActiveFloorKey(remaining[0].key);
    return remaining;
}

/* ── Per-floor accessors ─────────────────────────────────────────────── */

async function getFloorSvg(key)         { return kvGet(fkSvg(key)); }
async function setFloorSvg(key, text)   { await kvSet(fkSvg(key), text); notifyChange(); }

async function getFloorGeojson(key)     { return kvGet(fkGeojson(key)); }
async function setFloorGeojson(key, gj) { await kvSet(fkGeojson(key), gj); notifyChange(); }

async function getFloorMeta(key)        { return (await kvGet(fkMeta(key))) || {}; }
async function setFloorMeta(key, meta)  { await kvSet(fkMeta(key), meta || {}); notifyChange(); }
async function patchFloorMeta(key, patch) {
    const cur = (await kvGet(fkMeta(key))) || {};
    const next = { ...cur, ...patch };
    await kvSet(fkMeta(key), next);
    notifyChange();
    return next;
}

async function getFloorHeights(key)     { return (await kvGet(fkHeights(key))) || null; }
async function setFloorHeights(key, h)  { await kvSet(fkHeights(key), h); notifyChange(); }

async function getFloorPlacedIcons(key) { return (await kvGet(fkPlaced(key))) || []; }
async function setFloorPlacedIcons(key, list) {
    await kvSet(fkPlaced(key), list || []);
    notifyChange();
}

async function getFloorLabelSizes(key)  { return (await kvGet(fkLabels(key))) || {}; }
async function setFloorLabelSizes(key, s) {
    await kvSet(fkLabels(key), s || {});
    notifyChange();
}

async function getFloorModels(key)      { return (await kvGet(fkModels(key))) || []; }
async function setFloorModels(key, list) {
    await kvSet(fkModels(key), Array.isArray(list) ? list : []);
    notifyChange();
}

/* Per-floor alignment override. `null` deletes the override and the
 * floor falls back to the shared project alignment on next read. */
async function getFloorAlignment(key) {
    const v = await kvGet(fkAlignment(key));
    if (!v || !Number.isFinite(v.scale)) return null;
    return {
        centerLat: v.centerLat ?? 0,
        centerLng: v.centerLng ?? 0,
        scale:     v.scale     ?? 0.03,
        rotation:  v.rotation  ?? 0,
    };
}
async function setFloorAlignment(key, alignment) {
    if (alignment == null) {
        await kvDelete(fkAlignment(key));
    } else {
        await kvSet(fkAlignment(key), {
            centerLat: alignment.centerLat ?? 0,
            centerLng: alignment.centerLng ?? 0,
            scale:     alignment.scale     ?? 0.03,
            rotation:  alignment.rotation  ?? 0,
        });
    }
    notifyChange();
}

/* ── Active-floor shims (legacy single-floor API) ────────────────────── */

async function activeKey() { return getActiveFloorKey(); }

/* ── Aggregations ────────────────────────────────────────────────────── */

/** Cheap summary used by the topbar pill. */
async function summary() {
    await migrateLegacy();
    const floors = await getFloors();
    let featureCount = 0;
    let placedTotal = 0;
    let svgFloors = 0;
    for (const f of floors) {
        const [gj, placed, svg] = await Promise.all([
            getFloorGeojson(f.key),
            getFloorPlacedIcons(f.key),
            getFloorSvg(f.key),
        ]);
        if (gj?.features) featureCount += gj.features.length;
        if (Array.isArray(placed)) placedTotal += placed.length;
        if (svg) svgFloors++;
    }
    const [icons, categories] = await Promise.all([
        iconsGetAll(),
        kvGet(KEYS.categories),
    ]);
    return {
        floorCount:    floors.length,
        floorsWithSvg: svgFloors,
        hasGeojson:    featureCount > 0,
        featureCount,
        placedTotal,
        iconCount:     icons?.length || 0,
        hasCategories: !!categories,
    };
}

async function clearAll() {
    const floors = await getFloors();
    const writes = [];
    for (const f of floors) {
        writes.push(
            kvDelete(fkSvg(f.key)),
            kvDelete(fkGeojson(f.key)),
            kvDelete(fkMeta(f.key)),
            kvDelete(fkHeights(f.key)),
            kvDelete(fkPlaced(f.key)),
            kvDelete(fkLabels(f.key)),
            kvDelete(fkAlignment(f.key)),
            kvDelete(fkModels(f.key)),
        );
    }
    writes.push(
        kvDelete(KEYS.floors),
        kvDelete(KEYS.activeFloor),
        kvDelete(KEYS.categories),
        kvDelete(KEYS.itemEdits),
        iconsClear(),
    );
    await Promise.all(writes);
    try { localStorage.removeItem('kiosk:itemEdits'); } catch {}
    notifyChange();
}

/* Subscribers — used so other tabs (Export, status pill) can refresh. */
const _subs = new Set();
function onChange(fn) { _subs.add(fn); return () => _subs.delete(fn); }
function notifyChange() {
    for (const fn of _subs) {
        try { fn(); } catch (e) { console.warn('[storage] subscriber error', e); }
    }
}

/* ── Public API ──────────────────────────────────────────────────────── */

export const storage = {
    KEYS,

    // ── Floor index ──────────────────────────────────────────────────
    getFloors,
    setFloors,
    addFloor,
    renameFloor,
    reorderFloor,
    deleteFloor,
    getActiveFloorKey,
    setActiveFloorKey,

    // ── Project-level (shared across floors) ─────────────────────────
    getProjectAlignment,
    setProjectAlignment,

    // ── Per-floor (explicit) ─────────────────────────────────────────
    getFloorSvg,         setFloorSvg,
    getFloorGeojson,     setFloorGeojson,
    getFloorMeta,        setFloorMeta,        patchFloorMeta,
    getFloorHeights,     setFloorHeights,
    getFloorPlacedIcons, setFloorPlacedIcons,
    getFloorLabelSizes,  setFloorLabelSizes,
    getFloorAlignment,   setFloorAlignment,
    getFloorModels,      setFloorModels,

    // ── Active-floor shims (for legacy single-floor callers) ─────────
    async getSvg()         { return getFloorSvg(await activeKey()); },
    async setSvg(text)     { return setFloorSvg(await activeKey(), text); },
    async getGeojson()     { return getFloorGeojson(await activeKey()); },
    async setGeojson(gj)   { return setFloorGeojson(await activeKey(), gj); },
    async getMeta()        { return getFloorMeta(await activeKey()); },
    async setMeta(m)       { return setFloorMeta(await activeKey(), m); },
    async patchMeta(p)     { return patchFloorMeta(await activeKey(), p); },
    async getHeights()     { return getFloorHeights(await activeKey()); },
    async setHeights(h)    { return setFloorHeights(await activeKey(), h); },
    async getPlacedIcons() { return getFloorPlacedIcons(await activeKey()); },
    async setPlacedIcons(list) { return setFloorPlacedIcons(await activeKey(), list); },
    async getLabelSizes()  { return getFloorLabelSizes(await activeKey()); },
    async setLabelSizes(s) { return setFloorLabelSizes(await activeKey(), s); },

    // ── Categories override (shared) ─────────────────────────────────
    async getCategories()  { return kvGet(KEYS.categories); },
    async setCategories(c) { await kvSet(KEYS.categories, c); notifyChange(); },
    async clearCategories(){ await kvDelete(KEYS.categories); notifyChange(); },

    /* ── Item edits (sheet write-back queue) ────────────────────────
     *
     * The editor's "Birimler" tab stores in-flight changes here so they
     * survive page reloads even when the Apps Script endpoint is offline.
     * The runtime mirrors this map into localStorage on every change so
     * `location-service.mapSheetLocationToApp` can apply patches without
     * an async round-trip.
     */
    async getItemEdits()    { return (await kvGet(KEYS.itemEdits)) || {}; },
    async setItemEdits(map) {
        await kvSet(KEYS.itemEdits, map || {});
        try {
            // Mirror to localStorage for the runtime side. We keep the
            // shape minimal — just `patch` and `primaryCategory` — so
            // it stays well under the 5MB localStorage budget.
            const lite = {};
            for (const [id, rec] of Object.entries(map || {})) {
                lite[id] = {
                    patch: rec.patch || {},
                    primaryCategory: rec.primaryCategory || null,
                };
            }
            localStorage.setItem('kiosk:itemEdits', JSON.stringify(lite));
        } catch { /* localStorage full or disabled — non-fatal */ }
        notifyChange();
    },
    async clearItemEdits()  {
        await kvDelete(KEYS.itemEdits);
        try { localStorage.removeItem('kiosk:itemEdits'); } catch {}
        notifyChange();
    },

    // ── Custom icon Blobs (shared) ───────────────────────────────────
    async addIcon(record)  { const r = await iconsAdd(record); notifyChange(); return r; },
    async getIcons()       { return iconsGetAll(); },
    async getIcon(id)      { return iconsGet(id); },
    async deleteIcon(id)   { await iconsDelete(id); notifyChange(); },
    async clearIcons()     { await iconsClear(); notifyChange(); },

    // ── Misc ─────────────────────────────────────────────────────────
    summary,
    clearAll,
    onChange,
};

export const __testing = { fkSvg, fkGeojson, fkMeta, fkHeights, fkPlaced, fkLabels, fkAlignment, fkModels, kvKeys };
