export function formatPhoneNumber(phone) {
    if (!phone) return '';

    let cleaned = phone.replace(/[^\d+-]/g, '');

    let extension = '';
    if (cleaned.includes('-')) {
        const parts = cleaned.split('-');
        cleaned = parts[0];
        extension = parts[1] ? `-${parts[1]}` : '';
    }

    const hasPlus = cleaned.startsWith('+');
    if (hasPlus) cleaned = cleaned.substring(1);

    if (cleaned.startsWith('90') && cleaned.length >= 12) {
        const cc = cleaned.substring(0, 2);
        const area = cleaned.substring(2, 5);
        const p1 = cleaned.substring(5, 8);
        const p2 = cleaned.substring(8, 10);
        const p3 = cleaned.substring(10, 12);
        return `(+${cc}) ${area} ${p1} ${p2} ${p3}${extension}`;
    }

    return phone;
}

export function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current);
    return result;
}

/* Quote-aware row splitter. RFC-style CSV allows literal newlines inside
 * "..."-quoted fields (e.g. a Description column carrying multi-paragraph
 * text). A naive `text.split('\n')` would break those rows into pieces —
 * which is exactly what happened with the IFM sheet, where every
 * paragraph of a description was parsed as a new "location". Here we
 * walk the text character by character and only treat \n as a row
 * terminator when we're NOT inside a quoted field. Escaped quotes ("")
 * inside a field still toggle the state correctly because the second
 * quote re-opens it on the next pass. */
function splitCsvRows(text) {
    const rows = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') {
                current += '""';
                i++;
            } else {
                inQuotes = !inQuotes;
                current += ch;
            }
        } else if (ch === '\n' && !inQuotes) {
            rows.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.length > 0) rows.push(current);
    return rows;
}

export function parseCSV(text) {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const rows = splitCsvRows(normalized);
    if (rows.length === 0) return [];
    const headers = parseCsvLine(rows[0]);
    return rows.slice(1)
        .filter(line => line.trim())
        .map(line => {
            const values = parseCsvLine(line);
            const obj = {};
            headers.forEach((h, i) => obj[h.trim()] = (values[i] || '').trim());
            return obj;
        });
}

export function getLocationDisplayName(loc) {
    if (loc.subtitle) return `${loc.name} - ${loc.subtitle}`;
    return loc.name;
}
