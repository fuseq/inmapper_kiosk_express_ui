/**
 * Phonetic dictionary — Turkish pronunciation of foreign brand names, used to
 * make the assistant's text-to-speech read store names naturally. Ported to an
 * ES module from the speech-assistant prototype (`phonetic-dictionary.js`).
 *
 * Venue-agnostic by design: it is a best-effort spoken-form map. Names not
 * present pass through unchanged.
 */

const dictionary = {
    'Victoria\'s Secret': 'Viktoryas Sikret',
    'Starbucks': 'Starbaks',
    'Nike': 'Nayk',
    'H&M': 'Eyç End Em',
    'Calvin Klein': 'Kelvin Klayn',
    'Tommy Hilfiger': 'Tomi Hilfiger',
    'Levi\'s': 'Livays',
    'Gap': 'Gep',
    'COS': 'Kos',
    'Under Armour': 'Andır Armır',
    'Columbia': 'Kolambiya',
    'Skechers': 'Skeçırs',
    'Lacoste': 'Lakost',
    'Guess': 'Ges',
    'Louis Vuitton': 'Lui Viton',
    'Gucci': 'Guçi',
    'Chanel': 'Şanel',
    'Dior': 'Diyor',
    'Burberry': 'Börberi',
    'Balenciaga': 'Balensiyaga',
    'Bottega Veneta': 'Bottega Veneta',
    'Celine': 'Selin',
    'Bvlgari': 'Bulgari',
    'Rolex': 'Roleks',
    'Swarovski': 'Svarovski',
    'Sephora': 'Sefora',
    'MAC': 'Mek',
    'Jo Malone': 'Co Malon',
    'L\'Occitane': 'Loksitan',
    'Yves Rocher': 'İv Roşe',
    'English Home': 'İngliş Houm',
    'Nespresso': 'Nespreso',
    'Apple': 'Epıl',
    'JBL': 'Cey Bi El',
    'MediaMarkt': 'Medya Markt',
    'Dyson': 'Daysın',
    'Burger King': 'Börger King',
    'McDonald\'s': 'Mekdonalds',
    'Popeyes': 'Popays',
    'BigChefs': 'Big Şefs',
    'Godiva': 'Godiva',
    'Caffe Nero': 'Kafe Nero',
    'SushiCo': 'Suşiko',
    'D&R': 'Di End Ar',
    'Watsons': 'Vatsıns',
    'Coffee': 'Kafi',
    'Company': 'Kampani',
    'Kitchen': 'Kiçın',
    'House': 'Haus',
    'Home': 'Houm',
    'Beauty': 'Byuti',
    'Fashion': 'Feşın',
    'Design': 'Dizayn',
    'Collection': 'Kolekşın',
    'Exclusive': 'Ekskluziv',
    'Boutique': 'Butik',
    'Lounge': 'Launc',
    'Cafe': 'Kafe',
    'Restaurant': 'Restoran',
    'Store': 'Stor',
    'Shop': 'Şop',
};

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const sortedKeys = Object.keys(dictionary).sort((a, b) => b.length - a.length);

/** Replace brand tokens in `text` with their Turkish spoken form. */
export function toPhonetic(text) {
    if (!text) return text;
    let result = String(text);
    for (const original of sortedKeys) {
        const re = new RegExp(escapeRegex(original), 'gi');
        result = result.replace(re, dictionary[original]);
    }
    return result;
}
