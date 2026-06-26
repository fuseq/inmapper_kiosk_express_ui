/**
 * Parsers + helpers for the richer per-unit detail fields (image gallery,
 * structured working hours, related units). Shared by the runtime location
 * service and the editor so the Sheets text formats are interpreted
 * identically in both places.
 *
 * Sheet column formats (all optional, backward compatible — empty == none):
 *   Images   : URLs separated by "|" or newlines (falls back to comma).
 *   Hours    : day-segments separated by ";" or newline, e.g.
 *              "Pzt-Cum 10:00-22:00; Cmt 10:00-20:00; Paz Kapalı"
 *              (TR or EN day names; "Kapalı/Closed"; "24 Saat/24h").
 *   Related  : unit ids separated by comma / space / pipe.
 */

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT_TR = { mon: 'Pzt', tue: 'Sal', wed: 'Çar', thu: 'Per', fri: 'Cum', sat: 'Cmt', sun: 'Paz' };
const DAY_FULL_TR = { mon: 'Pazartesi', tue: 'Salı', wed: 'Çarşamba', thu: 'Perşembe', fri: 'Cuma', sat: 'Cumartesi', sun: 'Pazar' };
const DAY_ALIASES = {
    pzt: 'mon', pazartesi: 'mon', mon: 'mon', monday: 'mon',
    sal: 'tue', sali: 'tue', 'salı': 'tue', tue: 'tue', tuesday: 'tue',
    car: 'wed', 'çar': 'wed', carsamba: 'wed', 'çarşamba': 'wed', wed: 'wed', wednesday: 'wed',
    per: 'thu', persembe: 'thu', 'perşembe': 'thu', thu: 'thu', thursday: 'thu',
    cum: 'fri', cuma: 'fri', fri: 'fri', friday: 'fri',
    cmt: 'sat', cumartesi: 'sat', sat: 'sat', saturday: 'sat',
    paz: 'sun', pazar: 'sun', sun: 'sun', sunday: 'sun',
};

/** URLs → string[]. */
export function parseImages(str) {
    if (!str || typeof str !== 'string') return [];
    let parts = str.split(/[|\n]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length <= 1 && str.includes(',')) parts = str.split(',').map(s => s.trim()).filter(Boolean);
    return parts;
}

/** Related unit ids → string[]. */
export function parseRelated(str) {
    if (!str || typeof str !== 'string') return [];
    return str.split(/[,;|\s]+/).map(s => s.trim()).filter(Boolean);
}

function resolveDayRange(spec) {
    const parts = spec.split('-').map(s => s.trim());
    if (parts.length === 2) {
        const a = DAY_ALIASES[parts[0]];
        const b = DAY_ALIASES[parts[1]];
        if (!a || !b) return [];
        const ai = DAY_KEYS.indexOf(a);
        const bi = DAY_KEYS.indexOf(b);
        if (ai < 0 || bi < 0) return [];
        const out = [];
        if (ai <= bi) { for (let i = ai; i <= bi; i++) out.push(DAY_KEYS[i]); }
        else { for (let i = ai; i < 7; i++) out.push(DAY_KEYS[i]); for (let i = 0; i <= bi; i++) out.push(DAY_KEYS[i]); }
        return out;
    }
    const k = DAY_ALIASES[parts[0]];
    return k ? [k] : [];
}

function parseTimeSpec(spec) {
    const s = spec.toLowerCase().trim();
    if (/kapal|closed/.test(s)) return { closed: true };
    if (/24\s*(saat|h|hour|hours)|7\s*\/\s*24|7\/24/.test(s)) return { allDay: true };
    const m = /(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})/.exec(s);
    if (m) {
        return { open: `${m[1].padStart(2, '0')}:${m[2]}`, close: `${m[3].padStart(2, '0')}:${m[4]}` };
    }
    return null;
}

/**
 * Parse a Hours string into a structured 7-day model, or null if unparseable.
 * Shape: { raw, days: [{ key, label, short, closed, allDay, ranges:[{open,close}] }] }
 */
export function parseStructuredHours(str) {
    if (!str || typeof str !== 'string') return null;
    const raw = str.trim();
    if (!raw) return null;

    const acc = {};
    let parsedAny = false;
    for (const seg of raw.split(/[;\n]+/).map(s => s.trim()).filter(Boolean)) {
        const m = /^([A-Za-zÇĞİÖŞÜçğıöşü.]+(?:\s*-\s*[A-Za-zÇĞİÖŞÜçğıöşü.]+)?)\s+(.+)$/.exec(seg);
        if (!m) continue;
        const dayKeys = resolveDayRange(m[1].toLowerCase().replace(/\./g, ''));
        if (!dayKeys.length) continue;
        const t = parseTimeSpec(m[2]);
        if (!t) continue;
        parsedAny = true;
        for (const k of dayKeys) {
            if (!acc[k]) acc[k] = { closed: false, allDay: false, ranges: [] };
            if (t.closed) { acc[k].closed = true; acc[k].allDay = false; acc[k].ranges = []; }
            else if (t.allDay) { acc[k].allDay = true; acc[k].closed = false; acc[k].ranges = []; }
            else if (!acc[k].closed) acc[k].ranges.push({ open: t.open, close: t.close });
        }
    }
    if (!parsedAny) return null;

    const days = DAY_KEYS.map(k => ({
        key: k, label: DAY_FULL_TR[k], short: DAY_SHORT_TR[k],
        closed: acc[k] ? acc[k].closed : true,
        allDay: acc[k] ? acc[k].allDay : false,
        ranges: acc[k] ? acc[k].ranges : [],
    }));
    return { raw, days };
}

/** true / false / null(unknown) — is the venue open at `now`? */
export function isOpenNow(structured, now = new Date()) {
    if (!structured?.days) return null;
    const key = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
    const day = structured.days.find(d => d.key === key);
    if (!day || day.closed) return false;
    if (day.allDay) return true;
    const mins = now.getHours() * 60 + now.getMinutes();
    for (const r of day.ranges) {
        const [oh, om] = r.open.split(':').map(Number);
        const [ch, cm] = r.close.split(':').map(Number);
        let o = oh * 60 + om;
        let c = ch * 60 + cm;
        if (c <= o) c += 24 * 60; // overnight range
        let mm = mins;
        if (mm < o && c > 24 * 60) mm += 24 * 60;
        if (mm >= o && mm < c) return true;
    }
    return false;
}

/** Per-day rows for the detail UI: [{ short, label, text }]. */
export function hoursRows(structured) {
    if (!structured?.days) return [];
    return structured.days.map(d => ({
        short: d.short,
        label: d.label,
        text: d.closed ? 'Kapalı'
            : d.allDay ? '24 Saat'
                : (d.ranges.map(r => `${r.open}–${r.close}`).join(', ') || 'Kapalı'),
    }));
}

/** Short one-liner for a collapsed hours header (today's hours + open state). */
export function hoursTodaySummary(structured, now = new Date()) {
    if (!structured?.days) return '';
    const key = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][now.getDay()];
    const day = structured.days.find(d => d.key === key);
    if (!day) return '';
    if (day.closed) return 'Bugün kapalı';
    if (day.allDay) return '24 saat açık';
    return day.ranges.map(r => `${r.open}–${r.close}`).join(', ');
}
