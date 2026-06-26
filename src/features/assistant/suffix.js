/**
 * Turkish grammatical-suffix helper (vowel harmony) for the assistant's
 * spoken/written phrases. Ported to an ES module from the speech-assistant
 * prototype (`turkish-suffix.js`).
 */

const backVowels = ['a', 'ı', 'o', 'u'];
const frontVowels = ['e', 'i', 'ö', 'ü'];
const voicelessConsonants = ['f', 's', 't', 'k', 'ç', 'ş', 'h', 'p'];

const numberPronunciations = {
    '0': { lastVowel: 'ı', lastConsonant: 'r' },
    '1': { lastVowel: 'i', lastConsonant: 'r' },
    '2': { lastVowel: 'i', lastConsonant: 'i' },
    '3': { lastVowel: 'ü', lastConsonant: 'ç' },
    '4': { lastVowel: 'ö', lastConsonant: 't' },
    '5': { lastVowel: 'e', lastConsonant: 'ş' },
    '6': { lastVowel: 'ı', lastConsonant: 'ı' },
    '7': { lastVowel: 'i', lastConsonant: 'i' },
    '8': { lastVowel: 'i', lastConsonant: 'z' },
    '9': { lastVowel: 'u', lastConsonant: 'z' },
};

const allVowels = [...backVowels, ...frontVowels];

function getLastVowel(word) {
    const lastChar = word.slice(-1);
    if (numberPronunciations[lastChar]) return numberPronunciations[lastChar].lastVowel;
    const chars = word.toLowerCase().split('').reverse();
    for (const c of chars) if (allVowels.includes(c)) return c;
    return 'a';
}

function getLastSound(word) {
    const lastChar = word.slice(-1).toLowerCase();
    if (numberPronunciations[lastChar]) return numberPronunciations[lastChar].lastConsonant;
    return lastChar;
}

function isBackVowel(v) { return backVowels.includes(v.toLowerCase()); }
function isVowel(c) { return allVowels.includes(c.toLowerCase()); }
function isVoiceless(c) { return voicelessConsonants.includes(c.toLowerCase()); }

/** Locative: "Starbucks'ta", "Mavi'de". */
export function getLocativeSuffix(word) {
    const hard = isVoiceless(getLastSound(word));
    return isBackVowel(getLastVowel(word)) ? (hard ? "'ta" : "'da") : (hard ? "'te" : "'de");
}

/** Dative: "Starbucks'a", "Mavi'ye". */
export function getDativeSuffix(word) {
    const buffer = isVowel(getLastSound(word));
    return isBackVowel(getLastVowel(word)) ? (buffer ? "'ya" : "'a") : (buffer ? "'ye" : "'e");
}

/** Ablative: "Starbucks'tan", "Mavi'den". */
export function getAblativeSuffix(word) {
    const hard = isVoiceless(getLastSound(word));
    return isBackVowel(getLastVowel(word)) ? (hard ? "'tan" : "'dan") : (hard ? "'ten" : "'den");
}

export function withLocative(word) { return word + getLocativeSuffix(word); }
export function withDative(word) { return word + getDativeSuffix(word); }
export function withAblative(word) { return word + getAblativeSuffix(word); }
