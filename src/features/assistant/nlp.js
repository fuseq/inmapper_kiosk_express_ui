/**
 * Lightweight natural-language layer for the mobile assistant.
 *
 * Hybrid data strategy: the search index is built over the live venue dataset
 * (`dataStore.locations` from Sheets/GeoJSON) using Fuse.js, while the intent /
 * category / facility keyword maps and the phonetic helpers are ported from the
 * speech-assistant prototype. No venue-specific bundled data is used.
 */

import { dataStore } from '../../core/state.js';

let fuse = null;
let indexedCount = -1;

function locations() {
    return dataStore.locations || [];
}

function ensureFuse() {
    const locs = locations();
    if (fuse && indexedCount === locs.length) return fuse;
    if (!window.Fuse) return null;
    fuse = new window.Fuse(locs, {
        keys: [
            { name: 'name', weight: 0.6 },
            { name: 'subtitle', weight: 0.2 },
            { name: 'category', weight: 0.2 },
        ],
        threshold: 0.4,
        distance: 120,
        includeScore: true,
        minMatchCharLength: 2,
    });
    indexedCount = locs.length;
    return fuse;
}

/** Whether the search index can be built (locations loaded + Fuse present). */
export function isReady() {
    return !!window.Fuse && locations().length > 0;
}

export function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[.,!?;:'"]/g, '')
        .trim();
}

/* ── intent ──────────────────────────────────────────────────────────── */
const INTENT_KEYWORDS = {
    greet: ['merhaba', 'selam', 'günaydın', 'iyi günler', 'hello', 'hi', 'hey'],
    navigate: ['git', 'gitmek', 'gidelim', 'gider', 'nasıl giderim', 'nasil giderim', 'götür', 'gotur',
        'yol', 'rota', 'tarif', 'navigate', 'go to', 'take me', 'how do i get', 'directions', 'route'],
    info: ['hangi kat', 'nerede', 'nerde', 'kaçıncı kat', 'where', 'which floor', 'what floor'],
};

export function detectIntent(text) {
    const t = normalize(text);
    for (const kw of INTENT_KEYWORDS.greet) if (t === kw || t.startsWith(kw + ' ') || t === kw) return 'greet';
    for (const kw of INTENT_KEYWORDS.navigate) if (t.includes(kw)) return 'navigate';
    for (const kw of INTENT_KEYWORDS.info) if (t.includes(kw)) return 'info';
    return 'find';
}

/* ── facility (toilet / atm / entrance) ──────────────────────────────── */
const FACILITY_DEFS = [
    {
        type: 'wc',
        label: { tr: 'tuvalet', en: 'restroom' },
        keywords: ['tuvalet', 'tuvalete', 'wc', 'lavabo', 'restroom', 'toilet', 'bathroom'],
        match: (loc) => loc.type === 'wc' || /tuvalet|wc|lavabo/i.test(loc.name || ''),
    },
    {
        type: 'atm',
        label: { tr: 'ATM', en: 'ATM' },
        keywords: ['atm', 'bankamatik', 'para çek', 'cash machine'],
        match: (loc) => loc.type === 'atm' || /\batm\b|bankamatik/i.test(loc.name || ''),
    },
    {
        type: 'entrance',
        label: { tr: 'giriş', en: 'entrance' },
        keywords: ['giriş', 'giris', 'çıkış', 'cikis', 'kapı', 'kapi', 'entrance', 'exit'],
        match: (loc) => /giriş|giris|çıkış|cikis|kapı|kapi|entrance|exit/i.test(loc.name || ''),
    },
];

export function detectFacility(text) {
    const t = normalize(text);
    for (const def of FACILITY_DEFS) {
        for (const kw of def.keywords) {
            if (t.includes(kw)) return def;
        }
    }
    return null;
}

export function findFacilities(type) {
    const def = FACILITY_DEFS.find(d => d.type === type);
    if (!def) return [];
    return locations().filter(def.match);
}

/* ── category ────────────────────────────────────────────────────────── */
/*
 * Category matching is fully driven by the live Sheets-backed mapping
 * (`dataStore.categoryMapping.categories`). The synonym groups below carry no
 * venue keys — they map common spoken phrases ("acıktım", "kahve içmek
 * istiyorum") onto live categories whose apiKey / display names match the
 * group's pattern. New categories added in the sheet work automatically.
 */
const CATEGORY_INTENTS = [
    {
        pattern: /food|yeme|yiyecek|restoran|restaurant|cafe|kafe|coffee|kahve|pastane|bakery|fast/i,
        keywords: ['yemek', 'aç', 'acım', 'acıktım', 'restoran', 'cafe', 'kafe', 'kahve', 'yeme',
            'food', 'eat', 'hungry', 'coffee', 'drink', 'içecek', 'icecek'],
        label: { tr: 'Yeme & İçme', en: 'Food & Drink' },
    },
    {
        pattern: /shop|alisveris|alışveriş|moda|fashion|giyim|magaza|mağaza|market|store/i,
        keywords: ['alışveriş', 'alisveris', 'mağaza', 'magaza', 'giyim', 'kıyafet', 'kiyafet',
            'shop', 'clothes', 'fashion', 'store'],
        label: { tr: 'Alışveriş', en: 'Shopping' },
    },
    {
        pattern: /elektronik|electronic|teknoloji|tech/i,
        keywords: ['elektronik', 'teknoloji', 'telefon', 'bilgisayar', 'electronics', 'tech', 'phone', 'computer'],
        label: { tr: 'Elektronik', en: 'Electronics' },
    },
    {
        pattern: /kozmetik|cosmetic|güzellik|guzellik|beauty|health|sağlık|saglik/i,
        keywords: ['kozmetik', 'güzellik', 'guzellik', 'makyaj', 'parfüm', 'parfum',
            'cosmetics', 'beauty', 'makeup', 'perfume'],
        label: { tr: 'Kozmetik', en: 'Cosmetics' },
    },
];

function liveCategories() {
    return dataStore.categoryMapping?.categories || [];
}

/** Live categories whose apiKey or display names match the given pattern. */
function matchLiveCategories(pattern) {
    return liveCategories().filter(c =>
        pattern.test(c.apiKey || '')
        || pattern.test(c.displayName || '')
        || pattern.test(c.displayName_en || ''));
}

function categoryResult(cats, fallbackLabel) {
    if (!cats.length) return null;
    if (cats.length === 1) {
        const c = cats[0];
        return {
            keys: [c.apiKey],
            label: { tr: c.displayName || c.apiKey, en: c.displayName_en || c.displayName || c.apiKey },
        };
    }
    return { keys: cats.map(c => c.apiKey), label: fallbackLabel };
}

/** Resolve a category intent to live (Sheets) apiKeys + display label. */
export function detectCategory(text) {
    const t = normalize(text);

    // 1) Exact mention of a live category name ("kozmetik", "fashion"…).
    for (const c of liveCategories()) {
        const tr = (c.displayName || '').toLowerCase();
        const en = (c.displayName_en || '').toLowerCase();
        const key = String(c.apiKey || '').toLowerCase().replace(/[_-]+/g, ' ');
        if ((tr.length > 2 && t.includes(tr)) || (en.length > 2 && t.includes(en)) || (key.length > 2 && t.includes(key))) {
            return categoryResult([c]);
        }
    }

    // 2) Spoken-intent synonyms ("acıktım" → food-like live categories).
    for (const def of CATEGORY_INTENTS) {
        if (!def.keywords.some(kw => t.includes(kw))) continue;
        const cats = matchLiveCategories(def.pattern);
        const res = categoryResult(cats, def.label);
        if (res) return res;
    }
    return null;
}

export function filterByCategory(keys) {
    const set = new Set((keys || []).map(k => String(k).toLowerCase()));
    return locations().filter(loc => {
        const cats = (loc.apiCategories || []).map(c => String(c).toLowerCase());
        if (cats.some(c => set.has(c))) return true;
        return set.has(String(loc.primaryCategory || '').toLowerCase());
    });
}

/* ── unit lookup ─────────────────────────────────────────────────────── */
export function findLocationInText(text) {
    const f = ensureFuse();
    if (!f) return null;
    const t = normalize(text);
    const results = f.search(t);
    if (results.length && results[0].score < 0.5) return results[0].item;

    const words = t.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
        for (let j = words.length; j > i; j--) {
            const phrase = words.slice(i, j).join(' ');
            if (phrase.length > 2) {
                const r = f.search(phrase);
                if (r.length && r[0].score < 0.4) return r[0].item;
            }
        }
    }
    return null;
}

export function suggestLocations(text, limit = 3) {
    const f = ensureFuse();
    if (!f) return [];
    return f.search(normalize(text)).slice(0, limit).map(r => r.item);
}

/* ── confirmation (yes / no) ─────────────────────────────────────────── */
const YES = ['evet', 'tamam', 'olur', 'başlat', 'baslat', 'tabii', 'yes', 'yeah', 'ok', 'okay', 'sure', 'start'];
const NO = ['hayır', 'hayir', 'yok', 'iptal', 'vazgeç', 'vazgec', 'no', 'cancel', 'nope'];

export function detectConfirmation(text) {
    const t = normalize(text);
    if (YES.some(p => t.includes(p))) return 'yes';
    if (NO.some(p => t.includes(p))) return 'no';
    return null;
}
