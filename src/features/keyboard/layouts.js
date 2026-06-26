export const keyboardLayouts = {
    tr: {
        letters: [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç'],
        ],
        name: 'Türkçe',
        flag: '🇹🇷',
    },
    en: {
        letters: [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
        ],
        name: 'English',
        flag: '🇬🇧',
    },
    zh: {
        letters: [
            [
                { main: 'Q', sub: '手' }, { main: 'W', sub: '田' },
                { main: 'E', sub: '水' }, { main: 'R', sub: '口' },
                { main: 'T', sub: '庭' }, { main: 'Y', sub: '山' },
                { main: 'U', sub: '人' }, { main: 'I', sub: '心' },
                { main: 'O', sub: '火' }, { main: 'P', sub: '之' },
            ],
            [
                { main: 'A', sub: '日' }, { main: 'S', sub: '木' },
                { main: 'D', sub: '大' }, { main: 'F', sub: '土' },
                { main: 'G', sub: '王' }, { main: 'H', sub: '目' },
                { main: 'J', sub: '十' }, { main: 'K', sub: '竹' },
                { main: 'L', sub: '中' },
            ],
            [
                { main: 'Z', sub: '重' }, { main: 'X', sub: '難' },
                { main: 'C', sub: '金' }, { main: 'V', sub: '女' },
                { main: 'B', sub: '月' }, { main: 'N', sub: '弓' },
                { main: 'M', sub: '门' },
            ],
        ],
        common: ['商', '店', '铺', '餐', '厅', '咖', '啡', '厕', '所', '停', '车', '场'],
        name: '中文',
        flag: '🇨🇳',
        hasDualKeys: true,
    },
    ar: {
        letters: [
            ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح'],
            ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م'],
            ['ذ', 'د', 'ز', 'ر', 'و', 'ة', 'ى', 'ء'],
        ],
        name: 'العربية',
        flag: '🇸🇦',
        rtl: true,
    },
    numbers: [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['-', '/', ':', ';', '(', ')', '₺', '$', '€', '@'],
        ['.', ',', '?', '!', "'", '"', '#', '&', '*'],
    ],
};
