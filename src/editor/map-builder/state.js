/**
 * Shared state for the Map Builder tab — multi-floor.
 *
 * The user's project is a list of floors (`mbState.floors`) plus an
 * `activeFloorKey`. Each floor holds its own SVG, geojson, alignment,
 * heights, labels and placed-icon list — i.e. the union of the old
 * single-floor state.
 *
 * Tab modules (upload/process/align/heights/labels/icons/routing) were
 * written for a single floor, so we expose the active floor's slice
 * through legacy property shims (`mbState.svgText`, `mbState.geojson`,
 * etc.). Reads/writes on those shims transparently land on the active
 * floor record. When the user switches floors we emit
 * `active-floor-changed` and tabs re-render against the new slice.
 */

import { storage } from '../storage.js';

const DEFAULT_HEIGHTS = {
    walking: 0, building: 0, stand: 8, service: 6, food: 6, water: 0.5,
    other: 5, shop: 8, green: 1, medical: 6, commercial: 7, social: 5, structure: 3,
};

export const SUBLAYER_COLORS = {
    walking: '#f5f5f5', building: '#e6e6e6', stand: '#d9d3d2', service: '#e9dad0',
    food: '#d1bbbc', water: '#cfe2f3', other: '#e9dad0', shop: '#d9d3d2',
    green: '#a8d08d', medical: '#ff9999', commercial: '#ffe0b2', social: '#c5cae9',
    structure: '#d0d0d0',
};

export const EDITABLE_SUBLAYERS = [
    'stand','service','food','water','other','shop','green','medical','commercial','social','structure'
];

const subs = new Map();

function makeFloor(meta = {}) {
    return {
        key: meta.key,
        name: meta.name || meta.key,
        order: meta.order ?? 0,

        svgText: null,
        svgFilename: null,
        svgInfo: null,

        geojson: null,
        stats: null,

        /* Set once the user moves/scales/rotates a unit directly on the
         * map (geometry-edit.js). When true, GeoJSON is the source of
         * truth for this floor and re-processing the SVG would discard
         * those edits, so process.js guards/confirms before overwriting. */
        geometryEdited: false,

        /* Per-floor 3D model placements (see storage.fkModels). */
        modelPlacements: [],

        // Per-floor: every SVG can have its own viewBox, but the world
        // alignment (centerLat/Lng/scale/rotation) defaults to the
        // project-wide record — see _internal.projectAlignment below.
        // `alignmentOverride` lifts a single floor out of that shared
        // record (irregular venues — e.g. tower / podium).
        contentExtent: null,
        alignmentOverride: null,

        heights: { ...DEFAULT_HEIGHTS },
        heightMode: 'auto',
        heightScaleAuto: 0.1,

        labelSizes: {},
        placedIcons: [],
    };
}

const _internal = {
    host: null,
    floors: [],            // [floor record]
    activeFloorKey: null,
    activeMbTab: 'original',
    /* Project-wide alignment shared by every floor. Once the user has
     * aligned the first floor to a real-world location, every other
     * floor inherits the same centre/scale/rotation so they stack on
     * top of each other automatically. */
    projectAlignment: { centerLat: 0, centerLng: 0, scale: 0.03, rotation: 0 },
};

function getActiveFloor() {
    if (!_internal.activeFloorKey) return null;
    return _internal.floors.find(f => f.key === _internal.activeFloorKey) || null;
}

/** Define a getter/setter that proxies to the active floor record. */
function defineFloorProp(target, prop) {
    Object.defineProperty(target, prop, {
        configurable: true,
        enumerable: true,
        get() {
            const f = getActiveFloor();
            return f ? f[prop] : undefined;
        },
        set(value) {
            const f = getActiveFloor();
            if (f) f[prop] = value;
        },
    });
}

export const mbState = {
    /* Direct fields. */
    get host() { return _internal.host; },
    set host(v) { _internal.host = v; },

    get floors() { return _internal.floors; },
    get activeFloorKey() { return _internal.activeFloorKey; },

    get activeMbTab() { return _internal.activeMbTab; },
    set activeMbTab(v) { _internal.activeMbTab = v; },

    /* Active floor accessor — handy for new code that wants to be explicit. */
    getActiveFloor,
    getFloor(key) { return _internal.floors.find(f => f.key === key) || null; },
    listFloors() { return _internal.floors.slice(); },

    /* ── Floor management ───────────────────────────────────────────── */

    async setActiveFloor(key) {
        if (!_internal.floors.some(f => f.key === key)) return;
        if (_internal.activeFloorKey === key) return;
        _internal.activeFloorKey = key;
        await storage.setActiveFloorKey(key);
        this.emit('active-floor-changed', { key });
    },

    async addFloor({ key, name }) {
        if (!key) throw new Error('Floor key is required');
        if (_internal.floors.some(f => f.key === key)) {
            throw new Error(`Floor "${key}" already exists`);
        }
        const order = _internal.floors.length;
        await storage.addFloor({ key, name, order });
        _internal.floors.push(makeFloor({ key, name, order }));
        _internal.floors.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        this.emit('floors-changed');
        return key;
    },

    async renameActiveFloor(name) {
        const f = getActiveFloor();
        if (!f) return;
        f.name = name;
        await storage.renameFloor(f.key, name);
        this.emit('floors-changed');
    },

    async renameFloor(key, name) {
        const f = this.getFloor(key);
        if (!f) return;
        f.name = name;
        await storage.renameFloor(key, name);
        this.emit('floors-changed');
    },

    async deleteFloor(key) {
        const idx = _internal.floors.findIndex(f => f.key === key);
        if (idx < 0) return;

        // Storage handles the "last floor" case by replacing it with a
        // fresh default floor, so we always re-hydrate from whatever
        // it returns instead of guessing in-memory.
        const remaining = await storage.deleteFloor(key);
        await this.hydrate();
        // hydrate already emits its own event, but downstream tabs
        // listen specifically to floors-changed / active-floor-changed
        // for redraw semantics — keep them in sync.
        this.emit('floors-changed');
        this.emit('active-floor-changed', { key: _internal.activeFloorKey });
        return remaining;
    },

    async reorderFloors(orderedKeys) {
        // orderedKeys: top-to-bottom list of keys representing new order.
        const nextOrder = new Map(orderedKeys.map((k, i) => [k, i]));
        for (const f of _internal.floors) {
            const o = nextOrder.get(f.key);
            if (o !== undefined) f.order = o;
        }
        _internal.floors.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const list = _internal.floors.map(f => ({ key: f.key, name: f.name, order: f.order }));
        await storage.setFloors(list);
        this.emit('floors-changed');
    },

    /* ── Hydration / persistence ────────────────────────────────────── */

    /** Re-load every floor from IndexedDB. Called once on tab activate. */
    async hydrate() {
        const floorsMeta = await storage.getFloors();
        const records = await Promise.all(floorsMeta.map(async (m) => {
            const [svg, gj, meta, heights, placed, labels, align, models] = await Promise.all([
                storage.getFloorSvg(m.key),
                storage.getFloorGeojson(m.key),
                storage.getFloorMeta(m.key),
                storage.getFloorHeights(m.key),
                storage.getFloorPlacedIcons(m.key),
                storage.getFloorLabelSizes(m.key),
                storage.getFloorAlignment(m.key),
                storage.getFloorModels(m.key),
            ]);
            const f = makeFloor(m);
            f.svgText        = svg || null;
            f.svgFilename    = meta?.svgFilename || null;
            f.svgInfo        = meta?.svgInfo || null;
            f.geojson        = gj || null;
            f.stats          = meta?.stats || null;
            f.contentExtent  = meta?.contentExtent || null;
            f.alignmentOverride = align || null;
            f.geometryEdited = !!meta?.geometryEdited;
            f.modelPlacements = Array.isArray(models) ? models : [];
            f.heights        = heights ? { ...DEFAULT_HEIGHTS, ...heights } : { ...DEFAULT_HEIGHTS };
            /* Backfill any sublayer the active SVG uses but the static
             * DEFAULT_HEIGHTS list doesn't know about (carpark, entrance,
             * wc, info, …). Without this, the runtime preview ends up
             * using its 5 m fallback for those features until the user
             * manually drags a slider in the 3D-heights panel. We also
             * re-persist when we backfill, so the next preview iframe
             * reload picks up the dynamic keys via
             * `applyEditorHeights` in app.js. */
            let _heightsBackfilled = false;
            for (const sl of Object.keys(f.svgInfo?.sublayers || {}).map(s => s.toLowerCase())) {
                if (sl === 'walking' || sl === 'building') continue;
                if (f.heights[sl] == null) {
                    f.heights[sl] = DEFAULT_HEIGHTS[sl] ?? 4;
                    _heightsBackfilled = true;
                }
            }
            if (_heightsBackfilled) {
                // Fire-and-forget: hydrate must not block on writes.
                storage.setFloorHeights(f.key, f.heights).catch(() => {});
            }
            f.heightMode     = meta?.heightMode || 'auto';
            f.heightScaleAuto = meta?.heightScaleAuto ?? 0.1;
            f.labelSizes     = labels || {};
            f.placedIcons    = placed || [];
            return f;
        }));
        _internal.floors = records;
        _internal.activeFloorKey = await storage.getActiveFloorKey();
        if (!_internal.floors.some(f => f.key === _internal.activeFloorKey)) {
            _internal.activeFloorKey = _internal.floors[0]?.key || null;
            if (_internal.activeFloorKey) await storage.setActiveFloorKey(_internal.activeFloorKey);
        }
        // Shared alignment — read once after floors so the back-compat
        // fallback in `getProjectAlignment` can derive from floor:0:meta.
        const pa = await storage.getProjectAlignment();
        _internal.projectAlignment = {
            centerLat: pa?.centerLat ?? 0,
            centerLng: pa?.centerLng ?? 0,
            scale:     pa?.scale     ?? 0.03,
            rotation:  pa?.rotation  ?? 0,
        };
        this.emit('hydrate');
    },

    /** Persist the active floor's meta block + the shared alignment +
     *  the active floor's per-floor alignment override (if any). */
    async persistMeta() {
        const f = getActiveFloor();
        if (f) {
            await storage.setFloorMeta(f.key, {
                svgFilename: f.svgFilename,
                svgInfo: f.svgInfo,
                stats: f.stats,
                contentExtent: f.contentExtent,
                heightMode: f.heightMode,
                heightScaleAuto: f.heightScaleAuto,
                geometryEdited: !!f.geometryEdited,
            });
            // null clears, otherwise persists override values.
            await storage.setFloorAlignment(f.key, f.alignmentOverride);
        }
        await storage.setProjectAlignment(_internal.projectAlignment);
    },

    /* ── Alignment override helpers ─────────────────────────────────── */

    /** Effective alignment used to convert / render `floorKey` (or the
     *  active floor): per-floor override if present, else project. */
    getEffectiveAlignment(floorKey) {
        const f = floorKey ? this.getFloor(floorKey) : getActiveFloor();
        return f?.alignmentOverride ? { ...f.alignmentOverride } : { ..._internal.projectAlignment };
    },

    hasFloorAlignmentOverride(floorKey) {
        const f = floorKey ? this.getFloor(floorKey) : getActiveFloor();
        return !!f?.alignmentOverride;
    },

    /** Lift `floorKey` out of the shared alignment by stamping its own
     *  record. Pass `null`/omit to seed from the current effective
     *  alignment (i.e. clone what the floor was using). */
    async setFloorAlignmentOverride(floorKey, alignment) {
        const f = this.getFloor(floorKey);
        if (!f) return;
        const seed = alignment || this.getEffectiveAlignment(floorKey);
        f.alignmentOverride = {
            centerLat: seed.centerLat ?? 0,
            centerLng: seed.centerLng ?? 0,
            scale:     seed.scale     ?? 0.03,
            rotation:  seed.rotation  ?? 0,
        };
        await storage.setFloorAlignment(floorKey, f.alignmentOverride);
        this.emit('floor-alignment-changed', { key: floorKey, override: true });
    },

    /** Drop `floorKey` back to inheriting the project alignment. */
    async clearFloorAlignmentOverride(floorKey) {
        const f = this.getFloor(floorKey);
        if (!f) return;
        f.alignmentOverride = null;
        await storage.setFloorAlignment(floorKey, null);
        this.emit('floor-alignment-changed', { key: floorKey, override: false });
    },

    /* ── Aggregations across floors ─────────────────────────────────── */

    /**
     * Build a single GeoJSON FeatureCollection that merges every floor's
     * features and tags each one with `properties.floor = floorKey`.
     * Used by export and (optionally) by the runtime renderer in preview.
     */
    buildMergedGeojson() {
        const features = [];
        for (const f of _internal.floors) {
            if (!f.geojson?.features) continue;
            for (const feat of f.geojson.features) {
                features.push({
                    ...feat,
                    properties: { ...(feat.properties || {}), floor: f.key },
                });
            }
        }
        return { type: 'FeatureCollection', features };
    },

    /** All placed icons across floors, flattened with a `floor` tag. */
    buildMergedPlacedIcons() {
        const out = [];
        for (const f of _internal.floors) {
            for (const p of (f.placedIcons || [])) out.push({ ...p, floor: f.key });
        }
        return out;
    },

    /** All 3D model placements across floors, flattened with a `floor`
     *  tag. Used by export + preview to build config.features.models3d. */
    buildMergedModelPlacements() {
        const out = [];
        for (const f of _internal.floors) {
            for (const p of (f.modelPlacements || [])) out.push({ ...p, floor: f.key });
        }
        return out;
    },

    /* ── Geometry editing (GeoJSON as source of truth) ──────────────── */

    /** Flag the active floor's geometry as user-edited so SVG re-process
     *  knows it would clobber manual edits. */
    async setGeometryEdited(value = true) {
        const f = getActiveFloor();
        if (!f) return;
        f.geometryEdited = !!value;
        await this.persistMeta();
    },

    isGeometryEdited(floorKey) {
        const f = floorKey ? this.getFloor(floorKey) : getActiveFloor();
        return !!f?.geometryEdited;
    },

    /**
     * Replace one or more features (matched by `layer` + `properties.id`)
     * in the active floor's geojson with edited geometry, persist, mark
     * the floor as geometry-edited and emit `geometry-edited` so the
     * processed map + preview bridge can sync.
     *
     * `layer` defaults to `'rooms'` for backwards compatibility, but room
     * edits now drag along their doors / paths / portals, so callers pass
     * those layers too.
     *
     * @param {Array<{id:string, layer?:string, geometry:object}>} updates
     */
    async applyEditedFeatures(updates) {
        const f = getActiveFloor();
        if (!f?.geojson?.features || !Array.isArray(updates) || !updates.length) return;
        const key = (layer, id) => `${layer || 'rooms'}::${id}`;
        const byKey = new Map(updates.map(u => [key(u.layer, String(u.id)), u.geometry]));
        f.geojson = {
            ...f.geojson,
            features: f.geojson.features.map(feat => {
                const g = byKey.get(key(feat.properties?.layer, String(feat.properties?.id)));
                return g ? { ...feat, geometry: g } : feat;
            }),
        };
        f.geometryEdited = true;
        await storage.setGeojson(f.geojson);
        await this.persistMeta();
        this.emit('geometry-edited', { keys: [...byKey.keys()] });
    },

    /* Merge property changes into matching features (by {id, layer}) without
     * touching geometry. The persist channel for non-geometry edits such as
     * enabling/disabling a unit. Same event/persist path as geometry edits so
     * the preview + processed map refresh identically. */
    async patchFeatureProperties(updates) {
        const f = getActiveFloor();
        if (!f?.geojson?.features || !Array.isArray(updates) || !updates.length) return;
        const key = (layer, id) => `${layer || 'rooms'}::${id}`;
        const byKey = new Map(updates.map(u => [key(u.layer, String(u.id)), u.properties || {}]));
        f.geojson = {
            ...f.geojson,
            features: f.geojson.features.map(feat => {
                const p = byKey.get(key(feat.properties?.layer, String(feat.properties?.id)));
                return p ? { ...feat, properties: { ...feat.properties, ...p } } : feat;
            }),
        };
        f.geometryEdited = true;
        await storage.setGeojson(f.geojson);
        await this.persistMeta();
        this.emit('geometry-edited', { props: [...byKey.keys()] });
    },

    /* Add whole new features (e.g. a new writing label, split pieces).
     * Emits only `geometry-edited` (NOT `geojson-changed`) so the processed
     * map updates via setData without the camera-resetting full re-render
     * (`geojson-changed` → applyGeojsonToMap → fitBounds). Callers refresh the
     * map sources directly (geometry-edit.refreshProcessedSources). */
    async addFeatures(features) {
        const f = getActiveFloor();
        if (!f?.geojson?.features || !Array.isArray(features) || !features.length) return;
        f.geojson = { ...f.geojson, features: [...f.geojson.features, ...features] };
        f.geometryEdited = true;
        await storage.setGeojson(f.geojson);
        await this.persistMeta();
        this.emit('geometry-edited', { added: features.length });
    },

    /* Remove features by {id, layer} reference (delete unit cascade, merge). */
    async removeFeatures(refs) {
        const f = getActiveFloor();
        if (!f?.geojson?.features || !Array.isArray(refs) || !refs.length) return;
        const key = (layer, id) => `${layer || 'rooms'}::${id}`;
        const kill = new Set(refs.map(r => key(r.layer, String(r.id))));
        f.geojson = {
            ...f.geojson,
            features: f.geojson.features.filter(
                ft => !kill.has(key(ft.properties?.layer, String(ft.properties?.id))),
            ),
        };
        f.geometryEdited = true;
        await storage.setGeojson(f.geojson);
        await this.persistMeta();
        this.emit('geometry-edited', {});
    },

    /* Atomic remove + add (merge → one feature, split → two+). */
    async replaceFeatures({ remove = [], add = [] } = {}) {
        const f = getActiveFloor();
        if (!f?.geojson?.features) return;
        const key = (layer, id) => `${layer || 'rooms'}::${id}`;
        const kill = new Set(remove.map(r => key(r.layer, String(r.id))));
        const kept = f.geojson.features.filter(
            ft => !kill.has(key(ft.properties?.layer, String(ft.properties?.id))),
        );
        f.geojson = { ...f.geojson, features: [...kept, ...add] };
        f.geometryEdited = true;
        await storage.setGeojson(f.geojson);
        await this.persistMeta();
        this.emit('geometry-edited', {});
    },

    /* ── 3D model placements ────────────────────────────────────────── */

    getActiveModelPlacements() {
        const f = getActiveFloor();
        return f ? (f.modelPlacements || []) : [];
    },

    async setActiveModelPlacements(list) {
        const f = getActiveFloor();
        if (!f) return;
        f.modelPlacements = Array.isArray(list) ? list : [];
        await storage.setFloorModels(f.key, f.modelPlacements);
        this.emit('models-changed', { key: f.key });
    },

    /* ── Pub/Sub ────────────────────────────────────────────────────── */

    on(event, fn) {
        if (!subs.has(event)) subs.set(event, new Set());
        subs.get(event).add(fn);
        return () => subs.get(event)?.delete(fn);
    },
    emit(event, payload) {
        const set = subs.get(event);
        if (!set) return;
        for (const fn of set) {
            try { fn(payload); }
            catch (e) { console.warn(`[mbState] ${event} subscriber failed`, e); }
        }
    },
};

// Wire the legacy single-floor properties to the active floor record so
// existing tab modules don't have to change their access patterns.
[
    'svgText','svgFilename','svgInfo',
    'geojson','stats',
    'contentExtent',
    'heights','heightMode','heightScaleAuto',
    'labelSizes','placedIcons',
    'geometryEdited','modelPlacements',
].forEach(prop => defineFloorProp(mbState, prop));

// Alignment shims — by default a floor inherits the *project-wide*
// record so floors stack on top of each other automatically. A floor
// may opt out by stamping its own `alignmentOverride` record (see
// setFloorAlignmentOverride). Reads and writes here transparently
// route to whichever record is currently in effect for the active
// floor:
//
//   override present  →  read/write goes to floor.alignmentOverride
//   override absent   →  read/write goes to projectAlignment
//
// This means form fields in the Dönüştürme/Hizala tabs always show
// "what is being used to convert this floor right now", and editing
// them only affects the appropriate scope without the user having to
// think about it.
['centerLat','centerLng','scale','rotation'].forEach(prop => {
    Object.defineProperty(mbState, prop, {
        configurable: true,
        enumerable: true,
        get() {
            const f = getActiveFloor();
            const src = f?.alignmentOverride || _internal.projectAlignment;
            return src[prop];
        },
        set(v) {
            const f = getActiveFloor();
            const target = f?.alignmentOverride || _internal.projectAlignment;
            target[prop] = v;
        },
    });
});

// Read-only handle for callers that want to inspect / clone the
// alignment record (e.g. align.js when applying the same params to
// every floor at once).
Object.defineProperty(mbState, 'projectAlignment', {
    configurable: true,
    enumerable: true,
    get() { return _internal.projectAlignment; },
});

export { DEFAULT_HEIGHTS, makeFloor };
