// ==================== API CONFIGURATION ====================
const API_CONFIG = {
    BASE_URL: 'https://api.inmapper.com/zorlu-center',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    CATEGORY_MAPPING_FILE: 'category-mapping.json',
};

// Category mapping from API to app
// Category mapping will be loaded from category-mapping.json
let CATEGORY_MAPPING = null;

// Load category mapping from JSON file
async function loadCategoryMapping() {
    try {
        const response = await fetch(API_CONFIG.CATEGORY_MAPPING_FILE);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        CATEGORY_MAPPING = await response.json();
        console.log('✅ Category mapping loaded:', CATEGORY_MAPPING.categories.length, 'categories');
        return CATEGORY_MAPPING;
    } catch (error) {
        console.error('❌ Error loading category mapping:', error);
        // Fallback to empty mapping
        CATEGORY_MAPPING = {
            categories: [],
            defaultCategory: { displayName: 'Diğer', icon: '📍', description: '' }
        };
        return CATEGORY_MAPPING;
    }
}

// Floor mapping from API to app
const FLOOR_MAP = {
    '-3': '-3. Kat',
    '-2': '-2. Kat',
    '-1': '-1. Kat',
    '0': 'Zemin Kat',
    '1': '1. Kat',
    '2': '2. Kat',
    '3': '3. Kat',
};

// ==================== UTILITY FUNCTIONS ====================
/**
 * Format phone number to readable format
 * Example: "+902122820808-07" -> "(+90) 212 282 08 08-07"
 */
function formatPhoneNumber(phone) {
    if (!phone) return '';
    
    // Remove all spaces and non-numeric characters except + and -
    let cleaned = phone.replace(/[^\d+-]/g, '');
    
    // Check if there's an extension (after -)
    let extension = '';
    if (cleaned.includes('-')) {
        const parts = cleaned.split('-');
        cleaned = parts[0];
        extension = parts[1] ? `-${parts[1]}` : '';
    }
    
    // Remove + from the beginning for processing
    const hasPlus = cleaned.startsWith('+');
    if (hasPlus) {
        cleaned = cleaned.substring(1);
    }
    
    // Format Turkish phone numbers (+90 XXX XXX XX XX)
    if (cleaned.startsWith('90') && cleaned.length >= 12) {
        const countryCode = cleaned.substring(0, 2); // 90
        const areaCode = cleaned.substring(2, 5);     // 212
        const part1 = cleaned.substring(5, 8);        // 282
        const part2 = cleaned.substring(8, 10);       // 08
        const part3 = cleaned.substring(10, 12);      // 08
        return `(+${countryCode}) ${areaCode} ${part1} ${part2} ${part3}${extension}`;
    }
    
    // Return original if format doesn't match
    return phone;
}

// ==================== STATE MANAGEMENT ====================
const state = {
    currentView: 'initial', // 'initial', 'search', 'route'
    searchQuery: '',
    sidePanelSearchQuery: '', // Search query for side panel
    sideListSearchQuery: '', // Search query for side panel location list
    sideListCategory: 'all', // Selected category in side panel location list
    selectedCategory: 'all',
    selectedLocation: null,
    startPoint: null,
    endPoint: null,
    editingPoint: 'start', // 'start' or 'end' - which point is being edited
    currentFloor: null, // Current selected floor (null = all floors)
    keyboardLanguage: 'tr', // 'tr', 'en', 'zh', 'ar'
    keyboardMode: 'letters', // 'letters' or 'numbers'
    routeType: 'shortest', // 'shortest' or 'accessible'
    panelSide: 'right', // 'left' or 'right' - which side the panel is on (default: right)
    sidePanelMode: 'preview', // 'preview' or 'route' - side panel display mode
    isEditMode: false, // Edit mode state
    hasPendingEditChanges: false, // Whether there are pending edit changes
    selectedCategories: [], // Selected categories for editing
    kioskLocation: { id: 0, name: 'Bulunduğunuz Konum', category: 'Kiosk', floor: 'Zemin Kat', type: 'kiosk', icon: '📍' }, // Default kiosk location
    apiData: null, // Store API data
    lastFetch: null, // Last fetch timestamp
};

// Keyboard layouts
const keyboardLayouts = {
    tr: {
        letters: [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'Ğ', 'Ü'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ş', 'İ'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'Ö', 'Ç']
        ],
        name: 'Türkçe',
        flag: '🇹🇷'
    },
    en: {
        letters: [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
        ],
        name: 'English',
        flag: '🇬🇧'
    },
        zh: {
        letters: [
            [
                {main: 'Q', sub: '手'},
                {main: 'W', sub: '田'},
                {main: 'E', sub: '水'},
                {main: 'R', sub: '口'},
                {main: 'T', sub: '庭'},
                {main: 'Y', sub: '山'},
                {main: 'U', sub: '人'},
                {main: 'I', sub: '心'},
                {main: 'O', sub: '火'},
                {main: 'P', sub: '之'}
            ],
            [
                {main: 'A', sub: '日'},
                {main: 'S', sub: '木'},
                {main: 'D', sub: '大'},
                {main: 'F', sub: '土'},
                {main: 'G', sub: '王'},
                {main: 'H', sub: '目'},
                {main: 'J', sub: '十'},
                {main: 'K', sub: '竹'},
                {main: 'L', sub: '中'}
            ],
            [
                {main: 'Z', sub: '重'},
                {main: 'X', sub: '難'},
                {main: 'C', sub: '金'},
                {main: 'V', sub: '女'},
                {main: 'B', sub: '月'},
                {main: 'N', sub: '弓'},
                {main: 'M', sub: '门'}
            ]
        ],
        common: ['商', '店', '铺', '餐', '厅', '咖', '啡', '厕', '所', '停', '车', '场'],
        name: '中文',
        flag: '🇨🇳',
        hasDualKeys: true
    },
    ar: {
        letters: [
            ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح'],
            ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م'],
            ['ذ', 'د', 'ز', 'ر', 'و', 'ة', 'ى', 'ء']
        ],
        name: 'العربية',
        flag: '🇸🇦',
        rtl: true
    },
    numbers: [
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
        ['-', '/', ':', ';', '(', ')', '₺', '$', '€', '@'],
        ['.', ',', '?', '!', '\'', '"', '#', '&', '*']
    ]
};

// Floor data
// Floors array - will be dynamically populated from API
let floors = [];

// All available categories/tags
const allCategories = [
    'Alışveriş', 'Moda', 'Mağaza', 'Spor', 'Ayakkabı', 'Giyim',
    'Yemek', 'Restoran', 'Lezzet', 'Fast Food', 'Kahvaltı', 'Öğle Yemeği',
    'Kafe', 'İçecek', 'Kahve', 'Çay', 'Bakery',
    'Eğlence', 'Aktivite', 'Keyif', 'Sinema', 'Oyun',
    'Tuvalet', 'WC', 'Hizmet', 'Restroom',
    'ATM', 'Banka', 'Finans', 'Para Çekme',
    'Otopark', 'Park', 'Araç', 'Parking'
];

// ==================== MOCK DATA ====================
// Locations will be loaded from API
let locations = [];

// ==================== API FUNCTIONS ====================
async function fetchLocationsFromAPI() {
    try {
        console.log('🔄 Fetching locations from API:', API_CONFIG.BASE_URL);
        
        // Check cache
        const now = Date.now();
        if (state.apiData && state.lastFetch && (now - state.lastFetch < API_CONFIG.CACHE_DURATION)) {
            console.log('✅ Using cached data');
            return state.apiData;
        }
        
        const response = await fetch(API_CONFIG.BASE_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✅ Fetched ${data.length} locations from API`);
        
        // Cache the data
        state.apiData = data;
        state.lastFetch = now;
        
        return data;
    } catch (error) {
        console.error('❌ Error fetching locations from API:', error);
        throw error;
    }
}

function mapAPILocationToApp(apiLocation) {
    // Skip entries without title or with empty category
    if (!apiLocation.title || !apiLocation.category) {
        return null;
    }
    
    // Parse multiple categories (comma-separated)
    const apiCategories = apiLocation.category
        .split(',')
        .map(cat => cat.trim())
        .filter(cat => cat.length > 0);
    
    // Get primary category (first one) for display
    const primaryCategory = apiCategories[0];
    const categoryInfo = getCategoryDisplayInfo(primaryCategory);
    
    // Use category info from JSON
    let type = primaryCategory; // Use primary API category as type by default
    let icon = categoryInfo.icon;
    let category = categoryInfo.label;
    
    // Override for specific cases (special handling)
    if (apiLocation.title.toLowerCase().includes('tuvalet') || apiLocation.title.toLowerCase().includes('wc')) {
        type = 'wc';
        icon = '🚻';
        category = 'Tuvalet';
    } else if (apiLocation.title.toLowerCase().includes('otopark') || apiLocation.title.toLowerCase().includes('carpark')) {
        type = 'parking';
        icon = '🅿️';
        category = 'Otopark';
    } else if (apiLocation.title.toLowerCase().includes('atm')) {
        type = 'atm';
        icon = '🏧';
        category = 'ATM';
    } else if (primaryCategory === 'restaurant_cafe') {
        // Check if it's specifically coffee
        if (apiLocation.title.toLowerCase().includes('coffee') || 
            apiLocation.title.toLowerCase().includes('kahve') ||
            apiLocation.title.toLowerCase().includes('starbucks') ||
            apiLocation.title.toLowerCase().includes('café')) {
            type = 'coffee';
            icon = '☕';
            category = 'Kafe';
        }
    }
    
    // Map floor
    const floorKey = apiLocation.floor.toString(); // Original floor key from API
    const floor = FLOOR_MAP[floorKey] || floorKey; // Display name
    
    // Build hours string
    let hours = 'Mon-Sun • 10:00-22:00'; // Default
    if (type === 'wc' || type === 'parking' || type === 'atm') {
        hours = 'Every Day • Open 24 Hours';
    }
    
    return {
        id: apiLocation.id,
        name: apiLocation.title,
        subtitle: apiLocation.subtitle,
        category: category,
        floor: floor,
        floorKey: floorKey, // Store original floor key for filtering
        type: type,
        icon: icon,
        hours: hours,
        telephone: apiLocation.telephone !== '-' ? apiLocation.telephone : null,
        web: apiLocation.web || null,
        logo: apiLocation.logo || null,
        apiCategories: apiCategories, // Store all API categories as array for filtering
    };
}

async function loadLocations() {
    try {
        const apiData = await fetchLocationsFromAPI();
        
        // Map API data to app format
        locations = apiData
            .map(mapAPILocationToApp)
            .filter(location => location !== null); // Remove null entries
        
        console.log(`✅ Loaded ${locations.length} locations`);
        
        // Extract unique categories and update UI
        updateDynamicCategories();
        
        return locations;
    } catch (error) {
        console.error('❌ Error loading locations:', error);
        
        // Fallback: show error message
        alert('Mağaza verileri yüklenemedi. Lütfen sayfayı yenileyin.');
        
        return [];
    }
}

function getUniqueCategories() {
    // Extract unique API categories from locations
    const apiCategories = new Set();
    
    locations.forEach(location => {
        if (location.apiCategories && Array.isArray(location.apiCategories)) {
            // Add all categories from the array
            location.apiCategories.forEach(cat => {
                apiCategories.add(cat);
            });
        }
    });
    
    return Array.from(apiCategories).sort();
}

function getCategoryDisplayInfo(apiCategory) {
    // Return from loaded category mapping
    if (!CATEGORY_MAPPING) {
        console.warn('⚠️ Category mapping not loaded yet');
        return { label: apiCategory, icon: '📍', description: '' };
    }
    
    // Find category in mapping
    const category = CATEGORY_MAPPING.categories.find(cat => cat.apiKey === apiCategory);
    
    if (category) {
        return {
            label: category.displayName,
            icon: category.icon,
            description: category.description
        };
    }
    
    // Return default category if not found
    return {
        label: CATEGORY_MAPPING.defaultCategory.displayName,
        icon: CATEGORY_MAPPING.defaultCategory.icon,
        description: CATEGORY_MAPPING.defaultCategory.description
    };
}

/**
 * Get display names for an array of API categories
 * @param {Array<string>} apiCategories - Array of API category keys
 * @returns {Array<string>} - Array of display names
 */
function getCategoryDisplayNames(apiCategories) {
    if (!apiCategories || apiCategories.length === 0) {
        return ['Alışveriş', 'Mağaza'];
    }
    
    return apiCategories.map(apiCat => {
        const info = getCategoryDisplayInfo(apiCat);
        return info.label;
    });
}

function updateDynamicCategories() {
    const uniqueCategories = getUniqueCategories();
    console.log('📂 Unique categories:', uniqueCategories);
    
    // Update category tabs
    updateCategoryTabs(uniqueCategories);
    
    // Update side panel category tabs
    updateSidePanelCategoryTabs(uniqueCategories);
    
    // Update floor dropdowns with API data
    updateFloorDropdowns();
}

// ==================== FLOOR MANAGEMENT ====================
function getUniqueFloors() {
    // Extract unique floors directly from API data (before mapping)
    const floorsSet = new Set();
    
    if (state.apiData && Array.isArray(state.apiData)) {
        state.apiData.forEach(apiLocation => {
            if (apiLocation.floor !== undefined && apiLocation.floor !== null && apiLocation.floor !== '') {
                floorsSet.add(apiLocation.floor.toString());
            }
        });
    }
    
    // Convert to array and sort numerically (descending: 2, 1, 0, -1, -2)
    const floorsArray = Array.from(floorsSet).sort((a, b) => {
        return parseInt(b) - parseInt(a);
    });
    
    console.log('🏢 Unique floors from API:', floorsArray);
    return floorsArray;
}

function getFloorDisplayName(floorKey) {
    return FLOOR_MAP[floorKey] || floorKey;
}

function updateFloorDropdowns() {
    const uniqueFloors = getUniqueFloors();
    
    if (uniqueFloors.length === 0) {
        console.warn('⚠️ No floors found in API data');
        return;
    }
    
    console.log('🔄 Updating floor dropdowns with:', uniqueFloors);
    
    // Update floors array for changeFloor function
    floors = uniqueFloors.map(floorKey => {
        const floorId = parseInt(floorKey);
        return {
            id: floorId,
            name: getFloorDisplayName(floorKey),
            number: floorKey
        };
    });
    
    console.log('✅ Updated floors array:', floors);
    
    // Update main search panel floor dropdown
    updateFloorDropdown('floorDropdown', 'floor-dropdown-item', 'floor-label', uniqueFloors);
    
    // Update map panel floor dropdown
    updateFloorDropdown('mapFloorDropdown', 'map-floor-dropdown-item', 'map-floor-label', uniqueFloors);
}

function updateFloorDropdown(dropdownId, itemClass, labelClass, floors) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) {
        console.warn(`⚠️ Dropdown ${dropdownId} not found`);
        return;
    }
    
    // Determine which close function to use based on dropdown type
    const isMapDropdown = dropdownId === 'mapFloorDropdown';
    const closeFunction = isMapDropdown ? closeMapFloorDropdown : closeFloorDropdown;
    
    // Clear existing items
    dropdown.innerHTML = '';
    
    // Add "Tüm Katlar" option first
    const allFloorsItem = document.createElement('div');
    allFloorsItem.className = itemClass;
    allFloorsItem.dataset.floor = 'all';
    
    // Mark as active if currentFloor is null
    if (state.currentFloor === null || state.currentFloor === undefined) {
        allFloorsItem.classList.add('active');
    }
    
    const allFloorsLabel = document.createElement('span');
    allFloorsLabel.className = labelClass;
    allFloorsLabel.textContent = 'Tüm Katlar';
    
    // Add event listener for "Tüm Katlar"
    allFloorsItem.addEventListener('click', (e) => {
        e.stopPropagation();
        changeFloor(null); // null means show all floors
        closeFunction();
    });
    
    allFloorsItem.appendChild(allFloorsLabel);
    dropdown.appendChild(allFloorsItem);
    
    // Add floors dynamically
    floors.forEach((floorKey) => {
        const floorItem = document.createElement('div');
        floorItem.className = itemClass;
        floorItem.dataset.floor = floorKey;
        
        // Mark as active if this floor matches currentFloor
        if (state.currentFloor !== null && floorKey === state.currentFloor.toString()) {
            floorItem.classList.add('active');
        }
        
        const floorLabel = document.createElement('span');
        floorLabel.className = labelClass;
        floorLabel.textContent = getFloorDisplayName(floorKey);
        
        // Add event listener to each floor item
        floorItem.addEventListener('click', (e) => {
            e.stopPropagation();
            const floorId = parseInt(floorKey);
            changeFloor(floorId);
            closeFunction();
        });
        
        floorItem.appendChild(floorLabel);
        dropdown.appendChild(floorItem);
    });
    
    console.log(`✅ Updated ${dropdownId} with ${floors.length + 1} items (including "Tüm Katlar")`);
}

function updateCategoryTabs(categories, filterQuery = '') {
    const categoryTabsContainer = document.querySelector('.category-tabs-wrapper');
    if (!categoryTabsContainer) return;
    
    // Clear existing tabs
    categoryTabsContainer.innerHTML = '';
    
    // Filter categories based on query
    let filteredCategories = categories;
    if (filterQuery && filterQuery.trim() !== '') {
        const queryLower = filterQuery.toLowerCase();
        filteredCategories = categories.filter(apiCategory => {
            const info = getCategoryDisplayInfo(apiCategory);
            // Search in display name or API key
            return info.label.toLowerCase().includes(queryLower) ||
                   apiCategory.toLowerCase().includes(queryLower);
        });
    }
    
    // Add "Tümü" button - active only if selectedCategory is 'all'
    const allButton = document.createElement('button');
    allButton.className = 'category-tab';
    if (state.selectedCategory === 'all') {
        allButton.classList.add('active');
    }
    allButton.dataset.category = 'all';
    allButton.textContent = 'Tümü';
    allButton.addEventListener('click', () => {
        selectCategory('all');
    });
    categoryTabsContainer.appendChild(allButton);
    
    // Add filtered categories
    filteredCategories.forEach(apiCategory => {
        const info = getCategoryDisplayInfo(apiCategory);
        const button = document.createElement('button');
        button.className = 'category-tab';
        if (state.selectedCategory === apiCategory) {
            button.classList.add('active');
        }
        button.dataset.category = apiCategory;
        button.textContent = info.label;
        
        button.addEventListener('click', () => {
            selectCategory(apiCategory);
        });
        
        categoryTabsContainer.appendChild(button);
    });
}

function updateSidePanelCategoryTabs(categories, filterQuery = '') {
    const sideCategoryTabsContainer = document.querySelector('.side-list-category-tabs');
    if (!sideCategoryTabsContainer) return;
    
    // Clear existing tabs
    sideCategoryTabsContainer.innerHTML = '';
    
    // Filter categories based on query
    let filteredCategories = categories;
    if (filterQuery && filterQuery.trim() !== '') {
        const queryLower = filterQuery.toLowerCase();
        filteredCategories = categories.filter(apiCategory => {
            const info = getCategoryDisplayInfo(apiCategory);
            // Search in display name or API key
            return info.label.toLowerCase().includes(queryLower) ||
                   apiCategory.toLowerCase().includes(queryLower);
        });
    }
    
    // Add "Tümü" button - active only if sideListCategory is 'all'
    const allButton = document.createElement('button');
    allButton.className = 'side-list-category-tab';
    if (state.sideListCategory === 'all') {
        allButton.classList.add('active');
    }
    allButton.dataset.category = 'all';
    allButton.textContent = 'Tümü';
    allButton.addEventListener('click', () => {
        selectSideListCategory('all');
    });
    sideCategoryTabsContainer.appendChild(allButton);
    
    // Add filtered categories
    filteredCategories.forEach(apiCategory => {
        const info = getCategoryDisplayInfo(apiCategory);
        const button = document.createElement('button');
        button.className = 'side-list-category-tab';
        if (state.sideListCategory === apiCategory) {
            button.classList.add('active');
        }
        button.dataset.category = apiCategory;
        button.textContent = info.label;
        
        button.addEventListener('click', () => {
            selectSideListCategory(apiCategory);
        });
        
        sideCategoryTabsContainer.appendChild(button);
    });
}

// ==================== DOM ELEMENTS ====================
const elements = {
    initialHome: document.getElementById('initialHome'),
    homeSearchTrigger: document.getElementById('homeSearchTrigger'),
    exploreMapBtn: document.getElementById('exploreMapBtn'),
    mapBackBtn: document.getElementById('mapBackBtn'),
    searchPlaceholder: document.getElementById('searchPlaceholder'),
    
    // Floor selector
    floorSelectorCompact: document.getElementById('floorSelectorCompact'),
    floorUpBtn: document.getElementById('floorUpBtn'),
    floorDownBtn: document.getElementById('floorDownBtn'),
    floorDisplayBtn: document.getElementById('floorDisplayBtn'),
    floorDropdown: document.getElementById('floorDropdown'),
    currentFloorNumber: document.getElementById('currentFloorNumber'),
    currentFloorName: document.getElementById('currentFloorName'),
    
    // Route point selectors
    startPointSelector: document.getElementById('startPointSelector'),
    endPointSelector: document.getElementById('endPointSelector'),
    startPointDisplay: document.getElementById('startPointDisplay'),
    endPointDisplay: document.getElementById('endPointDisplay'),
    
    searchTab: document.getElementById('searchTab'),
    tabBackBtn: document.getElementById('tabBackBtn'),
    tabSearchInput: document.getElementById('tabSearchInput'),
    tabClearBtn: document.getElementById('tabClearBtn'),
    tabResults: document.getElementById('tabResults'),
    
        mapPanel: document.getElementById('mapPanel'),
    mapSidePanel: document.getElementById('mapSidePanel'),
    panelToggleBtnTop: document.getElementById('panelToggleBtnTop'),
    sidePanelSearchBar: document.getElementById('sidePanelSearchBar'),
    sidePanelStartPoint: document.getElementById('sidePanelStartPoint'),
    sidePanelEndPoint: document.getElementById('sidePanelEndPoint'),
    sidePanelStartName: document.getElementById('sidePanelStartName'),
    sidePanelEndName: document.getElementById('sidePanelEndName'),
    sidePanelQRCode: document.getElementById('sidePanelQRCode'),
    mapContainer: document.getElementById('mapContainer'),
    sidePanelStartFloor: document.getElementById('sidePanelStartFloor'),
    sidePanelEndFloor: document.getElementById('sidePanelEndFloor'),
    routeTypeNormal: document.getElementById('routeTypeNormal'),
    routeTypeAccessible: document.getElementById('routeTypeAccessible'),
    
    // Side panel store info
    sidePanelStoreLogo: document.getElementById('sidePanelStoreLogo'),
    sidePanelStoreName: document.getElementById('sidePanelStoreName'),
    sidePanelStoreFloor: document.getElementById('sidePanelStoreFloor'),
    sidePanelStoreHours: document.getElementById('sidePanelStoreHours'),
    sidePanelStoreTags: document.getElementById('sidePanelStoreTags'),
    sidePanelStoreDescription: document.getElementById('sidePanelStoreDescription'),
    sidePanelPhoneCard: document.getElementById('sidePanelPhoneCard'),
    sidePanelPhoneNumber: document.getElementById('sidePanelPhoneNumber'),
    sidePanelSimilarStores: document.getElementById('sidePanelSimilarStores'),
    
    qrModal: document.getElementById('qrModal'),
    qrCloseBtn: document.getElementById('qrCloseBtn'),
    qrCodeImage: document.getElementById('qrCodeImage'),
    
    keyboard: document.getElementById('keyboard'),
    keyboardDisplay: document.getElementById('keyboardDisplay'),
    
    // Side keyboard elements
    sideKeyboardOverlay: document.getElementById('sideKeyboardOverlay'),
    sideKeyboardSheet: document.getElementById('sideKeyboardSheet'),
    sideInlineKeyboard: document.getElementById('sideInlineKeyboard'),
    
    // Map floor selector
    mapFloorSelectorCompact: document.getElementById('mapFloorSelectorCompact'),
    mapFloorUpBtn: document.getElementById('mapFloorUpBtn'),
    mapFloorDownBtn: document.getElementById('mapFloorDownBtn'),
    mapFloorDisplayBtn: document.getElementById('mapFloorDisplayBtn'),
    mapFloorDropdown: document.getElementById('mapFloorDropdown'),
    mapCurrentFloorName: document.getElementById('mapCurrentFloorName'),
    
    // Side panel new elements
    sideLocationListView: document.getElementById('sideLocationListView'),
    sideListResults: document.getElementById('sideListResults'),
    sideStorePreviewMode: document.getElementById('sideStorePreviewMode'),
    sideStoreDetailView: document.getElementById('sideStoreDetailView'),
    sideRouteInfoMode: document.getElementById('sideRouteInfoMode'),
    sideDrawRouteBtn: document.getElementById('sideDrawRouteBtn'),
    sidePanelSearchPlaceholder: document.getElementById('sidePanelSearchPlaceholder'),
    sidePanelSearchInput: document.getElementById('sidePanelSearchInput'),
    
    // Route info mode elements
    sideRouteStoreLogo: document.getElementById('sideRouteStoreLogo'),
    sideRouteStoreName: document.getElementById('sideRouteStoreName'),
    sideRouteStoreFloor: document.getElementById('sideRouteStoreFloor'),
    sideRouteStoreHours: document.getElementById('sideRouteStoreHours'),
    sideRouteStoreTags: document.getElementById('sideRouteStoreTags'),
    sideRouteStoreDescription: document.getElementById('sideRouteStoreDescription'),
    sideRoutePhoneCard: document.getElementById('sideRoutePhoneCard'),
    sideRoutePhoneNumber: document.getElementById('sideRoutePhoneNumber'),
    sideRouteSimilarStores: document.getElementById('sideRouteSimilarStores'),
    
    // Edit mode elements
    sidePanelEditBtn: document.getElementById('sidePanelEditBtn'),
    sidePanelStoreNameInput: document.getElementById('sidePanelStoreNameInput'),
    sidePanelFloorDropdown: document.getElementById('sidePanelFloorDropdown'),
    sidePanelFloorDropdownBtn: document.getElementById('sidePanelFloorDropdownBtn'),
    sidePanelFloorDropdownText: document.getElementById('sidePanelFloorDropdownText'),
    sidePanelFloorDropdownMenu: document.getElementById('sidePanelFloorDropdownMenu'),
    sidePanelStoreDescriptionInput: document.getElementById('sidePanelStoreDescriptionInput'),
    sidePanelPhoneNumberInput: document.getElementById('sidePanelPhoneNumberInput'),
    sidePanelStoreHoursEdit: document.getElementById('sidePanelStoreHoursEdit'),
    sideHoursDaysDropdown: document.getElementById('sideHoursDaysDropdown'),
    sideHoursDaysDropdownBtn: document.getElementById('sideHoursDaysDropdownBtn'),
    sideHoursDaysDropdownText: document.getElementById('sideHoursDaysDropdownText'),
    sideHoursDaysDropdownMenu: document.getElementById('sideHoursDaysDropdownMenu'),
    sideHoursTimeDropdown: document.getElementById('sideHoursTimeDropdown'),
    sideHoursTimeDropdownBtn: document.getElementById('sideHoursTimeDropdownBtn'),
    sideHoursTimeDropdownText: document.getElementById('sideHoursTimeDropdownText'),
    sideHoursTimeDropdownMenu: document.getElementById('sideHoursTimeDropdownMenu'),
    sideCategorySelectionCard: document.getElementById('sideCategorySelectionCard'),
    sideCategorySelectionGrid: document.getElementById('sideCategorySelectionGrid'),
    sidePanelSimilarStoresSection: document.getElementById('sidePanelSimilarStoresSection'),
    sideSubmitEditBtn: document.getElementById('sideSubmitEditBtn'),
    sideEditAlert: document.getElementById('sideEditAlert'),
};

// ==================== PARENT WINDOW COMMUNICATION ====================
/**
 * Send message to parent window (app.html)
 */
function sendToParent(type, data = {}) {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type, data }, '*');
    }
}

/**
 * Listen for messages from parent window
 */
window.addEventListener('message', (event) => {
    const { type, data } = event.data || {};
    
    switch (type) {
        case 'INIT':
            // Parent initialized
            console.log('Route navigation initialized by parent');
            // Notify parent that route frame is ready
            sendToParent('ROUTE_READY', {});
            break;
            
        case 'ROUTE_ACTIVATED':
            // Route navigation is now visible
            console.log('Route navigation activated');
            break;
            
        default:
            break;
    }
});

// ==================== VIEW MANAGEMENT ====================
function showInitialHome() {
    state.currentView = 'initial';
    
    // Hide store detail and show search content
    hideStoreDetailInSearchTab();
    
    // Show mini slideshow
    showMiniSlideshow();
    
    // Safely update initialHome
    if (elements.initialHome) {
        elements.initialHome.style.opacity = '1';
        elements.initialHome.style.visibility = 'visible';
        elements.initialHome.style.pointerEvents = 'auto';
        elements.initialHome.classList.remove('search-mode');
    }
    
    // Safely update searchTab
    if (elements.searchTab) {
        elements.searchTab.classList.remove('open');
    }
    
    // Hide floor selectors on home screen
    if (elements.floorSelectorCompact) {
        elements.floorSelectorCompact.style.display = 'none';
    }
    if (elements.mapFloorSelectorCompact) {
        elements.mapFloorSelectorCompact.style.display = 'none';
    }
    
    // Start mini slideshow auto-play when returning to home
    startMiniAutoPlay();
    
    // If we're in an iframe and showing initial home, notify parent to show landing
    // Only do this if we're truly at the initial state (not just hiding search)
    if (window.parent && window.parent !== window && 
        elements.searchTab && !elements.searchTab.classList.contains('open') && 
        elements.mapPanel && !elements.mapPanel.classList.contains('visible')) {
        sendToParent('HIDE_ROUTE', {});
    }
}

function showSearchTab() {
    state.currentView = 'search';
    
    // Hide store detail if it's showing and show search content
    hideStoreDetailInSearchTab();
    
    // Hide mini slideshow
    hideMiniSlideshow();
    
    // Reset floor to "Tüm Katlar" when opening search tab
    state.currentFloor = null;
    
    // Update floor display text
    if (elements.currentFloorName) {
        elements.currentFloorName.textContent = 'Tüm Katlar';
    }
    
    // Update floor dropdown active states
    document.querySelectorAll('.floor-dropdown-item').forEach(item => {
        item.classList.toggle('active', item.dataset.floor === 'all');
    });
    
    // Show floor selector in search tab
    if (elements.floorSelectorCompact) {
        elements.floorSelectorCompact.style.display = 'flex';
    }
    
    // Hide map floor selector
    if (elements.mapFloorSelectorCompact) {
        elements.mapFloorSelectorCompact.style.display = 'none';
    }
    
    // Guard clause: Check if elements exist
    if (!elements.initialHome || !elements.searchTab) {
        console.warn('⚠️ Required elements not found for showSearchTab');
        return;
    }
    
    // Step 1: Add animating class to keep logo/button visible during animation
    elements.initialHome.classList.add('animating');
    
    // Step 2: Start logo and button fade out (0.4s)
    setTimeout(() => {
        if (elements.initialHome) {
            elements.initialHome.classList.add('search-mode');
        }
    }, 50);
    
    // Step 3: After logo/button fade, expand search bar (0.7s)
    // Logo/button fade: 0.4s, then search bar expands
    
    // Step 4: After search bar expansion, show panel (0.6s)
    // Total: 0.4s (fade) + 0.7s (expand) = 1.1s, panel starts at 0.5s into expansion
    setTimeout(() => {
        if (elements.searchTab) {
            elements.searchTab.classList.add('open');
            loadAllLocations();
            
            // Render keyboard after panel is visible
            setTimeout(() => {
                console.log('🎹 Rendering keyboard after panel opened');
                renderInlineKeyboard();
            }, 100);
            
            // Remove animating class after all animations
            setTimeout(() => {
                if (elements.initialHome) {
                    elements.initialHome.classList.remove('animating');
                }
            }, 700);
        }
    }, 100);
    
    // Focus on search after all animations complete
    setTimeout(() => {
        if (elements.tabSearchInput) {
            elements.tabSearchInput.focus();
        }
    }, 1300);
}

function hideSearchTab() {
    console.log('🔽 Hiding search tab - Reverse animation...');
    
    // Guard clause: Check if elements exist
    if (!elements.initialHome || !elements.searchTab) {
        console.warn('⚠️ Required elements not found for hideSearchTab');
        return;
    }
    
    // Also hide store detail if it's showing
    hideStoreDetailInSearchTab();
    
    // Reverse animation sequence (opposite of showSearchTab)
    
    // Step 1: Close search panel (scale down) - 600ms
    console.log('📉 Closing panel...');
    elements.searchTab.classList.remove('open');
    
    // Step 2: After panel closes, shrink search bar - 700ms
    setTimeout(() => {
        console.log('🔽 Shrinking search bar...');
        if (elements.initialHome) {
            elements.initialHome.classList.remove('search-mode');
        }
        
        // Step 3: After search bar shrinks, fade in logo and explore button - 400ms
        setTimeout(() => {
            console.log('✨ Fading in home elements...');
            if (elements.initialHome) {
                elements.initialHome.classList.remove('animating');
            }
            
            if (!state.selectedLocation) {
                state.currentView = 'initial';
            }
            console.log('✅ Search tab fully hidden');
        }, 700); // search bar shrink animation time
        
    }, 600); // panel close animation time
}

// ==================== SEARCH FUNCTIONALITY ====================
function loadAllLocations() {
    let filteredLocations = locations;
    
    // Filter by category
    if (state.selectedCategory !== 'all') {
        filteredLocations = filteredLocations.filter(loc => 
            loc.apiCategories && 
            loc.apiCategories.includes(state.selectedCategory)
        );
    }
    
    // Filter by floor if currentFloor is set
    if (state.currentFloor !== undefined && state.currentFloor !== null) {
        const currentFloorKey = state.currentFloor.toString();
        filteredLocations = filteredLocations.filter(loc => 
            loc.floorKey === currentFloorKey
        );
    }
    
    displayLocations(filteredLocations);
}

function searchLocations(query) {
    let results = locations;
    
    if (query && query.trim() !== '') {
        const queryLower = query.toLowerCase();
        // Search ONLY in location name
        results = locations.filter(loc => 
            loc.name.toLowerCase().includes(queryLower)
        );
        
        // Filter category tabs based on query
        const allCategories = getUniqueCategories();
        updateCategoryTabs(allCategories, query);
    } else {
        // No query - show all categories
        const allCategories = getUniqueCategories();
        updateCategoryTabs(allCategories);
    }
    
    // Apply category filter if not "all"
    if (state.selectedCategory !== 'all') {
        results = results.filter(loc => 
            loc.apiCategories && 
            loc.apiCategories.includes(state.selectedCategory)
        );
    }
    
    // Apply floor filter if currentFloor is set
    if (state.currentFloor !== undefined && state.currentFloor !== null) {
        const currentFloorKey = state.currentFloor.toString();
        results = results.filter(loc => 
            loc.floorKey === currentFloorKey
        );
    }
    
    displayLocations(results);
}

function displayLocations(locationsList) {
    if (locationsList.length === 0) {
        elements.tabResults.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                <p style="font-size: 16px;">Sonuç bulunamadı</p>
            </div>
        `;
        return;
    }
    
        elements.tabResults.innerHTML = locationsList.map(loc => `
        <div class="location-item" data-id="${loc.id}">
            <div class="location-icon-wrapper">
                ${loc.logo ? `<img src="${loc.logo}" alt="${loc.name}">` : loc.icon}
            </div>
            <div class="location-info">
                <div class="location-name">${loc.name}</div>
                <div class="location-details">${loc.category} • ${loc.floor}</div>
            </div>
            <svg class="location-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
    `).join('');
    
    // Add click listeners
    document.querySelectorAll('.location-item').forEach(item => {
        item.addEventListener('click', () => {
            const locationId = item.dataset.id; // Keep as string
            selectLocation(locationId);
        });
    });
}

function selectLocation(locationId) {
    const location = locations.find(loc => String(loc.id) === String(locationId));
    if (!location) return;
    
    state.selectedLocation = location;
    
    // Hangi nokta seçili ise onu güncelle
    if (state.editingPoint === 'start') {
        state.startPoint = location;
        if (elements.startPointDisplay) {
            elements.startPointDisplay.textContent = location.name;
        }
        if (elements.sidePanelStartName) {
            elements.sidePanelStartName.textContent = location.name;
        }
        
        // After selecting start, switch to end point
        state.editingPoint = 'end';
        if (elements.endPointSelector) elements.endPointSelector.classList.add('active');
        if (elements.startPointSelector) elements.startPointSelector.classList.remove('active');
        
        // Don't hide search tab, just reload locations for end point
        loadAllLocations();
        
            } else {
        state.endPoint = location;
        if (elements.endPointDisplay) {
            elements.endPointDisplay.textContent = location.name;
        }
        if (elements.sidePanelEndName) {
            elements.sidePanelEndName.textContent = location.name;
        }
        
        // Instead of going directly to map, show store detail in search tab
        if (state.endPoint && state.startPoint) {
            // Show store detail in search tab
            showStoreDetailInSearchTab(location);
        }
    }
}

function transitionToMapView() {
    console.log('🎬 Starting transition to map view...');
    
    // Ensure start point is kiosk location
    if (!state.startPoint) {
        state.startPoint = state.kioskLocation;
    }
    
    // Close store detail if open
    hideStoreDetailInSearchTab();
    
    // Step 1: Add closing class to fade panel content
    console.log('📉 Step 1: Fading panel content...');
    elements.searchTab.classList.add('closing');
    
    // Step 2: After content fade, close panel (scale up - reverse)
    setTimeout(() => {
        console.log('⬆️ Step 2: Closing panel upwards...');
        elements.searchTab.classList.remove('open');
        
        // Step 3: After panel closes, immediately show map
        setTimeout(() => {
            console.log('🗺️ Step 3: Showing map...');
            
            // Hide home screen immediately
            elements.initialHome.style.transition = 'none';
            elements.initialHome.style.opacity = '0';
            elements.initialHome.style.visibility = 'hidden';
            elements.initialHome.style.pointerEvents = 'none';
            elements.initialHome.classList.remove('search-mode');
            elements.initialHome.classList.remove('animating');
            elements.searchTab.classList.remove('closing');
            
            // Show side panel in preview mode with store info
            showSideStorePreviewMode(state.endPoint);
            
            // Update search bar placeholder to show selected location
            if (elements.sidePanelSearchPlaceholder) {
                elements.sidePanelSearchPlaceholder.textContent = state.endPoint ? state.endPoint.name : 'Nereye gitmek istersiniz?';
            }
            
            // Show side panel
            if (elements.mapSidePanel) {
                elements.mapSidePanel.classList.remove('hidden');
            }
            
            // Add panel-visible class to map-container based on panel side
            if (elements.mapContainer) {
                if (state.panelSide === 'right') {
                    elements.mapContainer.classList.add('panel-visible-right');
                } else {
                    elements.mapContainer.classList.add('panel-visible-left');
                }
            }
            
            state.currentView = 'map';
            
            // Show floor selector on map view
            if (elements.mapFloorSelectorCompact) {
                elements.mapFloorSelectorCompact.style.display = 'flex';
            }
            
            console.log('✅ Transition complete!');
            
        }, 650); // Wait for panel close animation (600ms + 50ms buffer)
        
    }, 300); // Wait for content fade
}

function showMapWithRoute() {
    // Legacy function - redirects to new transition
    transitionToMapView();
}

function swapRoutePoints() {
    if (!state.startPoint || !state.endPoint) return;
    
    // Swap the points
    const temp = state.startPoint;
    state.startPoint = state.endPoint;
    state.endPoint = temp;
    
    // Update UI
    if (elements.sidePanelStartName) {
        elements.sidePanelStartName.textContent = state.startPoint.name;
    }
    if (elements.sidePanelEndName) {
        elements.sidePanelEndName.textContent = state.endPoint.name;
    }
    if (elements.sidePanelStartFloor) {
        elements.sidePanelStartFloor.textContent = state.startPoint.floor;
    }
    if (elements.sidePanelEndFloor) {
        elements.sidePanelEndFloor.textContent = state.endPoint.floor;
    }
    
    // Regenerate QR code
    generateQRCode();
}

function changeRouteType(type) {
    state.routeType = type;
    
    // Update button states
    if (elements.routeTypeNormal) {
        elements.routeTypeNormal.classList.toggle('active', type === 'shortest' || type === 'normal');
    }
    if (elements.routeTypeAccessible) {
        elements.routeTypeAccessible.classList.toggle('active', type === 'accessible');
    }
    
    // In a real implementation, you would recalculate the route here
    console.log('Route type changed to:', type);
}

function togglePanelSide() {
    console.log('🔄 Toggling panel side');
    
    // Toggle state
    state.panelSide = state.panelSide === 'left' ? 'right' : 'left';
    
    // Update classes
    if (state.panelSide === 'right') {
        if (elements.mapSidePanel) {
            elements.mapSidePanel.classList.add('panel-right');
        }
        if (elements.mapContainer) {
            elements.mapContainer.classList.add('panel-right');
        }
        if (elements.panelToggleBtnTop) {
            elements.panelToggleBtnTop.classList.add('panel-right');
        }
    } else {
        if (elements.mapSidePanel) {
            elements.mapSidePanel.classList.remove('panel-right');
        }
        if (elements.mapContainer) {
            elements.mapContainer.classList.remove('panel-right');
        }
        if (elements.panelToggleBtnTop) {
            elements.panelToggleBtnTop.classList.remove('panel-right');
        }
    }
    
    console.log('✅ Panel moved to:', state.panelSide);
}

function generateQRCode() {
    if (!state.endPoint || !state.startPoint) return;
    
    const routeUrl = `https://zorlu.center/route?from=${state.startPoint.id}&to=${state.endPoint.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(routeUrl)}`;
    
    if (elements.sidePanelQRCode) {
        elements.sidePanelQRCode.src = qrUrl;
    }
}

function updateSidePanelStoreInfo(location) {
    if (!location) return;
    
    // Update store logo
    if (elements.sidePanelStoreLogo) {
        if (location.logo) {
            elements.sidePanelStoreLogo.innerHTML = `<img src="${location.logo}" alt="${location.name}">`;
        } else {
            elements.sidePanelStoreLogo.textContent = location.icon || '🏪';
        }
    }
    
    // Update store name
    if (elements.sidePanelStoreName) {
        elements.sidePanelStoreName.textContent = location.name;
    }
    
    // Update floor info
    if (elements.sidePanelStoreFloor) {
        elements.sidePanelStoreFloor.textContent = `${location.floor} • Zorlu Center`;
    }
    
    // Update hours
    if (elements.sidePanelStoreHours) {
        const hours = location.hours || 'Mon-Sun • 10:00-22:00';
        const hoursSpan = elements.sidePanelStoreHours.querySelector('span');
        if (hoursSpan) {
            hoursSpan.textContent = hours;
        }
    }
    
    // Update tags (from location's actual categories with display names)
    if (elements.sidePanelStoreTags) {
        // Get display names for categories
        const displayNames = getCategoryDisplayNames(location.apiCategories);
        
        elements.sidePanelStoreTags.innerHTML = displayNames.map(tag => 
            `<span class="side-store-tag">
                ${tag}
                <button class="side-store-tag-remove hidden" data-tag="${tag}">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </span>`
        ).join('');
        
        // Store selected categories for edit mode
        state.selectedCategories = [...displayNames];
    }
    
    // Update description
    if (elements.sidePanelStoreDescription) {
        const descriptions = {
            'shopping': 'Modern moda ve stil tutkunları için geniş ürün yelpazesi ile hizmetinizdeyiz. Kaliteli markaları uygun fiyatlarla keşfedin.',
            'food': 'Lezzetli yemekler ve içeceklerle damak zevkinize hitap ediyoruz. Her öğün için özel menülerimizi keşfedin.',
            'coffee': 'Taze kahve aroması ve samimi atmosferimizle mola vermeniz için ideal mekan. Premium kahve çeşitlerimizi deneyin.',
            'entertainment': 'Eğlence ve dinlenme için mükemmel aktiviteler sunuyoruz. Ailenizle keyifli vakit geçirin.',
            'wc': 'Temiz ve modern tuvalet hizmetleri misafirlerimizin kullanımına sunulmuştur.',
            'atm': 'Çeşitli hizmetlerimizle size yardımcı olmaktan mutluluk duyarız.',
            'parking': 'Güvenli ve geniş otopark alanımız müşterilerimizin hizmetindedir.'
        };
        
        elements.sidePanelStoreDescription.textContent = 
            location.description || descriptions[location.type] || 
            'Zorlu Center\'da hizmet veren kaliteli işletmeler arasındayız. Detaylı bilgi için lütfen ziyaret edin.';
    }
    
    // Update phone
    if (elements.sidePanelPhoneNumber && elements.sidePanelPhoneCard) {
        if (location.telephone) {
            elements.sidePanelPhoneNumber.textContent = formatPhoneNumber(location.telephone);
            elements.sidePanelPhoneCard.style.display = 'flex';
        } else {
            elements.sidePanelPhoneCard.style.display = 'none';
        }
    }
    
    // Update similar stores (same category)
    if (elements.sidePanelSimilarStores) {
        const similarStores = locations
            .filter(loc => loc.id !== location.id && loc.type === location.type)
            .slice(0, 3); // Get max 3 similar stores
        
        if (similarStores.length > 0) {
            const storesHTML = similarStores.map(store => {
                // Show logo if available, otherwise show icon
                if (store.logo) {
                    return `
                        <div class="side-similar-item" data-store-id="${store.id}">
                            <img src="${store.logo}" alt="${store.name}" class="side-similar-logo-img">
                        </div>
                    `;
                } else {
                    return `
                        <div class="side-similar-item" data-store-id="${store.id}">
                            <div class="side-similar-name-only">
                                <span class="side-similar-store-name">${store.name}</span>
                            </div>
                        </div>
                    `;
                }
            }).join('');
            
            elements.sidePanelSimilarStores.innerHTML = storesHTML;
            
            // Add click listeners to similar store items
            elements.sidePanelSimilarStores.querySelectorAll('.side-similar-item[data-store-id]').forEach(item => {
                item.addEventListener('click', () => {
                    const storeId = item.dataset.storeId; // String ID'yi olduğu gibi kullan
                    console.log('🖱️ Similar store clicked, ID:', storeId);
                    const store = locations.find(loc => loc.id === storeId || loc.id === String(storeId));
                    if (store) {
                        console.log('✅ Found store:', store.name);
                        state.endPoint = store;
                        state.selectedLocation = store;
                        
                        // Update search bar placeholder
                        if (elements.sidePanelSearchPlaceholder) {
                            elements.sidePanelSearchPlaceholder.textContent = store.name;
                        }
                        
                        // If in route mode, regenerate QR code; if in preview mode, just update info
                        if (state.sidePanelMode === 'route') {
                            updateSidePanelStoreInfo(store);
                            // Update route mode store info
                            if (elements.sideRouteStoreLogo) {
                                if (store.logo) {
                                    elements.sideRouteStoreLogo.innerHTML = `<img src="${store.logo}" alt="${store.name}">`;
                                } else {
                                    elements.sideRouteStoreLogo.textContent = store.icon || '🏪';
                                }
                            }
                            if (elements.sideRouteStoreName) {
                                elements.sideRouteStoreName.textContent = store.name;
                            }
                            if (elements.sideRouteStoreFloor) {
                                elements.sideRouteStoreFloor.textContent = `${store.floor} • Zorlu Center`;
                            }
                            generateQRCode();
                        } else {
                            showSideStorePreviewMode(store);
                        }
                    } else {
                        console.error('❌ Store not found with ID:', storeId);
                    }
                });
            });
        } else {
            // No similar stores found
            elements.sidePanelSimilarStores.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 12px; color: rgba(255, 255, 255, 0.7);">
                    <p style="margin: 0; font-size: clamp(10px, 0.85vw, 13px);">Benzer mağaza bulunamadı</p>
                </div>
            `;
        }
    }
}

function toggleSidePanel() {
    console.log('🎛️ Toggling side panel');
    if (elements.mapSidePanel) {
        const isExpanded = elements.mapSidePanel.classList.contains('expanded');
        
        if (isExpanded) {
            // Closing
            elements.mapSidePanel.classList.remove('expanded');
            if (elements.sidePanelSearch) {
                elements.sidePanelSearch.style.display = 'none';
            }
        } else {
            // Opening
            elements.mapSidePanel.classList.add('expanded');
            if (elements.sidePanelSearch) {
                elements.sidePanelSearch.style.display = 'flex';
                // Clear search when opening
                clearSidePanelSearch();
            }
        }
    }
    if (elements.mapContainer) {
        elements.mapContainer.classList.toggle('panel-expanded');
    }
}

function closeSidePanel() {
    console.log('✖️ Closing side panel');
    if (elements.mapSidePanel) {
        elements.mapSidePanel.classList.remove('expanded');
    }
    if (elements.mapContainer) {
        elements.mapContainer.classList.remove('panel-expanded');
    }
    if (elements.sidePanelSearch) {
        elements.sidePanelSearch.style.display = 'none';
    }
    // Hide keyboard when closing side panel
    hideSideKeyboard();
}

// ==================== SIDE PANEL LOCATION LIST FUNCTIONS ====================
function showSideLocationList() {
    console.log('📋 Showing side panel location list');
    
    // Hide store detail view and route info mode
    if (elements.sideStoreDetailView) {
        elements.sideStoreDetailView.classList.add('hidden');
    }
    if (elements.sideRouteInfoMode) {
        elements.sideRouteInfoMode.classList.add('hidden');
    }
    
    // Show sideStorePreviewMode (parent container) to make sideLocationListView visible
    // This is important when in route mode, as sideStorePreviewMode might be hidden
    if (elements.sideStorePreviewMode) {
        elements.sideStorePreviewMode.classList.remove('hidden');
    }
    
    // Show list view
    if (elements.sideLocationListView) {
        elements.sideLocationListView.classList.remove('hidden');
    }
    
    // Show search input, hide placeholder
    if (elements.sidePanelSearchInput) {
        elements.sidePanelSearchInput.style.display = 'block';
        elements.sidePanelSearchInput.focus();
    }
    if (elements.sidePanelSearchPlaceholder) {
        elements.sidePanelSearchPlaceholder.style.display = 'none';
    }
    
    // Re-fetch sideListResults element reference after making it visible
    // This ensures the element is accessible even if it was hidden when initially loaded
    elements.sideListResults = document.getElementById('sideListResults');
    console.log('🔄 Fetched sideListResults element:', elements.sideListResults);
    
    // Load initial locations (with a small delay to ensure DOM is updated)
    setTimeout(() => {
        loadSideListLocations();
    }, 0);
}

function hideSideLocationList() {
    console.log('📋 Hiding side panel location list');
    
    // Hide list view
    if (elements.sideLocationListView) {
        elements.sideLocationListView.classList.add('hidden');
    }
    
    // Show the appropriate view based on current mode
    if (state.sidePanelMode === 'route') {
        // If in route mode, show route info mode and hide preview mode
        if (elements.sideRouteInfoMode) {
            elements.sideRouteInfoMode.classList.remove('hidden');
        }
        if (elements.sideStorePreviewMode) {
            elements.sideStorePreviewMode.classList.add('hidden');
        }
        if (elements.sideStoreDetailView) {
            elements.sideStoreDetailView.classList.add('hidden');
        }
    } else {
        // Otherwise, show store detail view (preview mode)
        if (elements.sideStorePreviewMode) {
            elements.sideStorePreviewMode.classList.remove('hidden');
        }
        if (elements.sideStoreDetailView) {
            elements.sideStoreDetailView.classList.remove('hidden');
        }
        if (elements.sideRouteInfoMode) {
            elements.sideRouteInfoMode.classList.add('hidden');
        }
    }
    
    // Hide search input, show placeholder
    if (elements.sidePanelSearchInput) {
        elements.sidePanelSearchInput.style.display = 'none';
        elements.sidePanelSearchInput.value = '';
    }
    if (elements.sidePanelSearchPlaceholder) {
        elements.sidePanelSearchPlaceholder.style.display = 'block';
    }
    
    // Update alert visibility
    updateEditAlertVisibility();
    
    // Clear search
    state.sideListSearchQuery = '';
    state.sideListCategory = 'all';
    
    // Reset category tabs
    document.querySelectorAll('.side-list-category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === 'all');
    });
}

function loadSideListLocations() {
    // Check if locations array exists
    if (!locations || !Array.isArray(locations)) {
        console.error('❌ Locations array is not available!');
        return;
    }
    
    console.log('🔄 Loading side list locations, total locations:', locations.length);
    console.log('🔄 Current filter - category:', state.sideListCategory, 'search:', state.sideListSearchQuery);
    
    let filteredLocations = locations;
    
    // Filter by category
    if (state.sideListCategory !== 'all') {
        filteredLocations = filteredLocations.filter(loc => 
            loc.apiCategories && 
            loc.apiCategories.includes(state.sideListCategory)
        );
        console.log('🔄 After category filter:', filteredLocations.length);
    }
    
    // Filter by search query
    if (state.sideListSearchQuery && state.sideListSearchQuery.trim() !== '') {
        const query = state.sideListSearchQuery.toLowerCase();
        // Search ONLY in location name
        filteredLocations = filteredLocations.filter(loc => 
            loc.name.toLowerCase().includes(query)
        );
        console.log('🔄 After search filter:', filteredLocations.length);
        
        // Filter side panel category tabs based on query
        const allCategories = getUniqueCategories();
        updateSidePanelCategoryTabs(allCategories, state.sideListSearchQuery);
    } else {
        // No query - show all categories
        const allCategories = getUniqueCategories();
        updateSidePanelCategoryTabs(allCategories);
    }
    
    console.log('🔄 Displaying', filteredLocations.length, 'locations');
    displaySideListLocations(filteredLocations);
}

function displaySideListLocations(locationsList) {
    // Try to get element reference again if it's null
    if (!elements.sideListResults) {
        elements.sideListResults = document.getElementById('sideListResults');
        console.log('⚠️ sideListResults was null, re-fetched:', elements.sideListResults);
    }
    
    if (!elements.sideListResults) {
        console.error('❌ sideListResults element not found!');
        return;
    }
    
    console.log('✅ Displaying', locationsList.length, 'locations in sideListResults');
    
    // Debug: Check if locations have IDs
    if (locationsList.length > 0) {
        console.log('🔍 First location sample:', {
            id: locationsList[0].id,
            name: locationsList[0].name,
            hasId: locationsList[0].id !== undefined
        });
    }
    
    if (locationsList.length === 0) {
        elements.sideListResults.innerHTML = `
            <div class="side-list-no-results">
                <div class="side-list-no-results-icon">🔍</div>
                <p class="side-list-no-results-text">Sonuç bulunamadı</p>
            </div>
        `;
        return;
    }
    
    // Generate HTML for all locations
    const html = locationsList.map(loc => {
        // Ensure we have a valid ID
        if (!loc.id && loc.id !== 0) {
            console.warn('⚠️ Location missing ID:', loc.name);
            return '';
        }
        
        return `
        <div class="side-list-location-item" data-id="${loc.id}">
            <div class="side-list-location-icon">
                ${loc.logo ? `<img src="${loc.logo}" alt="${loc.name}" style="width: 100%; height: 100%; object-fit: contain;">` : (loc.icon || '📍')}
            </div>
            <div class="side-list-location-info">
                <div class="side-list-location-name">${loc.name}</div>
                <div class="side-list-location-details">${loc.category} • ${loc.floor}</div>
            </div>
            <svg class="side-list-location-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        `;
    }).filter(html => html !== '').join('');
    
    elements.sideListResults.innerHTML = html;
    
    // Add click listeners - scope to sideListResults container
    const items = elements.sideListResults.querySelectorAll('.side-list-location-item');
    console.log('🔗 Adding click listeners to', items.length, 'location items');
    
    items.forEach((item, index) => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const locationId = item.dataset.id; // String ID'yi olduğu gibi kullan
            console.log('🖱️ Clicked on location item:', locationId);
            
            if (!locationId) {
                console.error('❌ No locationId found! Full dataset:', item.dataset);
                return;
            }
            
            selectLocationFromSideList(locationId);
        });
    });
    
    console.log('✅ Successfully rendered', locationsList.length, 'location items with click handlers');
}

function selectLocationFromSideList(locationId) {
    console.log('🎯 selectLocationFromSideList called with ID:', locationId, 'Type:', typeof locationId);
    const location = locations.find(loc => loc.id === locationId || loc.id === String(locationId));
    if (!location) {
        console.error('❌ Location not found with ID:', locationId);
        console.log('Available IDs:', locations.slice(0, 5).map(l => ({id: l.id, name: l.name})));
        return;
    }
    
    console.log('📍 Selected location from side list:', location.name);
    
    // Update state
    state.selectedLocation = location;
    state.endPoint = location;
    
    // Hide location list
    hideSideLocationList();
    
    // Update search bar placeholder to show selected location
    if (elements.sidePanelSearchPlaceholder) {
        elements.sidePanelSearchPlaceholder.textContent = location.name;
    }
    
    // Switch to preview mode (exit route mode if active)
    // This ensures we show the store detail view without route components
    showSideStorePreviewMode(location);
}

// ==================== SIDE PANEL MODE FUNCTIONS ====================
function showSideStorePreviewMode(location) {
    console.log('🏪 Showing store preview mode for:', location.name);
    
    state.sidePanelMode = 'preview';
    state.isEditMode = false; // Reset edit mode
    
    // Update store info in preview mode
    updateSidePanelStoreInfo(location);
    
    // Reset edit mode UI
    exitEditMode();
    
    // Show store detail view, hide list view
    if (elements.sideStoreDetailView) {
        elements.sideStoreDetailView.classList.remove('hidden');
    }
    if (elements.sideLocationListView) {
        elements.sideLocationListView.classList.add('hidden');
    }
    
    // Show preview mode, hide route mode
    if (elements.sideStorePreviewMode) {
        elements.sideStorePreviewMode.classList.remove('hidden');
    }
    if (elements.sideRouteInfoMode) {
        elements.sideRouteInfoMode.classList.add('hidden');
    }
    
    // Update alert visibility
    updateEditAlertVisibility();
}

// ==================== EDIT MODE FUNCTIONS ====================
function toggleEditMode() {
    if (!state.endPoint) return;
    
    if (state.isEditMode) {
        // Cancel edit mode
        exitEditMode();
        state.isEditMode = false;
    } else {
        // Enter edit mode
        state.isEditMode = true;
        enterEditMode();
    }
}

function submitEditChanges() {
    if (!state.endPoint) return;
    
    console.log('✅ Submitting edit changes');
    
    // Don't apply changes directly - just mark as pending
    state.hasPendingEditChanges = true;
    
    // Exit edit mode
    exitEditMode();
    state.isEditMode = false;
    
    // Update alert visibility
    updateEditAlertVisibility();
}

function updateEditAlertVisibility() {
    // Show alert only in preview mode (detail view) and if there are pending changes
    if (elements.sideEditAlert) {
        if (state.hasPendingEditChanges && state.sidePanelMode === 'preview' && 
            elements.sideStoreDetailView && !elements.sideStoreDetailView.classList.contains('hidden')) {
            elements.sideEditAlert.classList.remove('hidden');
        } else {
            elements.sideEditAlert.classList.add('hidden');
        }
    }
}

function enterEditMode() {
    console.log('✏️ Entering edit mode');
    
    const location = state.endPoint;
    
    // Change edit button text to "İptal"
    if (elements.sidePanelEditBtn) {
        const btnText = elements.sidePanelEditBtn.querySelector('span');
        if (btnText) {
            btnText.textContent = 'İptal';
        }
    }
    
    // Hide "Beğenebileceğiniz Yerler" section
    if (elements.sidePanelSimilarStoresSection) {
        elements.sidePanelSimilarStoresSection.classList.add('hidden');
    }
    
    // Hide "Rota Çiz" button, show "Gönder" button
    if (elements.sideDrawRouteBtn) {
        elements.sideDrawRouteBtn.classList.add('hidden');
    }
    if (elements.sideSubmitEditBtn) {
        elements.sideSubmitEditBtn.classList.remove('hidden');
    }
    
    // Show edit inputs, hide display elements
    if (elements.sidePanelStoreName) {
        elements.sidePanelStoreName.classList.add('hidden');
    }
    if (elements.sidePanelStoreNameInput) {
        elements.sidePanelStoreNameInput.classList.remove('hidden');
        elements.sidePanelStoreNameInput.value = location.name || '';
    }
    
    if (elements.sidePanelStoreFloor) {
        elements.sidePanelStoreFloor.classList.add('hidden');
    }
    if (elements.sidePanelFloorDropdown) {
        elements.sidePanelFloorDropdown.classList.remove('hidden');
        // Set current floor
        const floorId = floors.find(f => f.name === location.floor)?.id || 0;
        const floor = floors.find(f => f.id === floorId) || floors.find(f => f.id === 0);
        if (elements.sidePanelFloorDropdownText) {
            elements.sidePanelFloorDropdownText.textContent = floor.name;
        }
        // Update active state
        if (elements.sidePanelFloorDropdownMenu) {
            elements.sidePanelFloorDropdownMenu.querySelectorAll('.side-custom-dropdown-item').forEach(item => {
                item.classList.toggle('active', item.dataset.value === floorId.toString());
            });
        }
    }
    
    if (elements.sidePanelStoreDescription) {
        elements.sidePanelStoreDescription.classList.add('hidden');
    }
    if (elements.sidePanelStoreDescriptionInput) {
        elements.sidePanelStoreDescriptionInput.classList.remove('hidden');
        const descriptions = {
            'shopping': 'Modern moda ve stil tutkunları için geniş ürün yelpazesi ile hizmetinizdeyiz. Kaliteli markaları uygun fiyatlarla keşfedin.',
            'food': 'Lezzetli yemekler ve içeceklerle damak zevkinize hitap ediyoruz. Her öğün için özel menülerimizi keşfedin.',
            'coffee': 'Taze kahve aroması ve samimi atmosferimizle mola vermeniz için ideal mekan. Premium kahve çeşitlerimizi deneyin.',
            'entertainment': 'Eğlence ve dinlenme için mükemmel aktiviteler sunuyoruz. Ailenizle keyifli vakit geçirin.',
            'wc': 'Temiz ve modern tuvalet hizmetleri misafirlerimizin kullanımına sunulmuştur.',
            'atm': 'Çeşitli hizmetlerimizle size yardımcı olmaktan mutluluk duyarız.',
            'parking': 'Güvenli ve geniş otopark alanımız müşterilerimizin hizmetindedir.'
        };
        elements.sidePanelStoreDescriptionInput.value = location.description || descriptions[location.type] || '';
    }
    
    // Show hours edit, hide display
    if (elements.sidePanelStoreHours) {
        elements.sidePanelStoreHours.classList.add('hidden');
    }
    if (elements.sidePanelStoreHoursEdit) {
        elements.sidePanelStoreHoursEdit.classList.remove('hidden');
        // Parse current hours and set values
        const currentHours = location.hours || 'Mon-Sun • 10:00-22:00';
        parseAndSetHours(currentHours);
    }
    
    if (elements.sidePanelPhoneNumber) {
        elements.sidePanelPhoneNumber.classList.add('hidden');
    }
    if (elements.sidePanelPhoneNumberInput) {
        elements.sidePanelPhoneNumberInput.classList.remove('hidden');
        elements.sidePanelPhoneNumberInput.value = formatPhoneNumber(location.telephone) || '(+90) 555 000 00 00';
    }
    
    // Show tag remove buttons
    document.querySelectorAll('.side-store-tag-remove').forEach(btn => {
        btn.classList.remove('hidden');
    });
    
    // Show category selection card directly
    if (elements.sideCategorySelectionCard) {
        elements.sideCategorySelectionCard.classList.remove('hidden');
    }
    
    // Populate category selection
    populateCategorySelection();
}

function exitEditMode() {
    console.log('✖️ Exiting edit mode');
    
    // Restore original categories from location
    if (state.endPoint) {
        const location = state.endPoint;
        // Get display names for categories
        const originalTags = getCategoryDisplayNames(location.apiCategories);
        state.selectedCategories = [...originalTags];
        
        // Restore original tags display
        if (elements.sidePanelStoreTags) {
            const tagsHTML = originalTags.map(tag => 
                `<span class="side-store-tag">
                    ${tag}
                    <button class="side-store-tag-remove hidden" data-tag="${tag}">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </span>`
            ).join('');
            elements.sidePanelStoreTags.innerHTML = tagsHTML;
        }
    }
    
    // Change edit button text back to "Düzenle"
    if (elements.sidePanelEditBtn) {
        const btnText = elements.sidePanelEditBtn.querySelector('span');
        if (btnText) {
            btnText.textContent = 'Düzenle';
        }
    }
    
    // Show "Beğenebileceğiniz Yerler" section
    if (elements.sidePanelSimilarStoresSection) {
        elements.sidePanelSimilarStoresSection.classList.remove('hidden');
    }
    
    // Show "Rota Çiz" button, hide "Gönder" button
    if (elements.sideDrawRouteBtn) {
        elements.sideDrawRouteBtn.classList.remove('hidden');
    }
    if (elements.sideSubmitEditBtn) {
        elements.sideSubmitEditBtn.classList.add('hidden');
    }
    
    // Hide edit inputs, show display elements
    if (elements.sidePanelStoreName) {
        elements.sidePanelStoreName.classList.remove('hidden');
    }
    if (elements.sidePanelStoreNameInput) {
        elements.sidePanelStoreNameInput.classList.add('hidden');
    }
    
    if (elements.sidePanelStoreFloor) {
        elements.sidePanelStoreFloor.classList.remove('hidden');
    }
    if (elements.sidePanelFloorDropdown) {
        elements.sidePanelFloorDropdown.classList.add('hidden');
        elements.sidePanelFloorDropdown.classList.remove('open');
    }
    
    if (elements.sidePanelStoreDescription) {
        elements.sidePanelStoreDescription.classList.remove('hidden');
    }
    if (elements.sidePanelStoreDescriptionInput) {
        elements.sidePanelStoreDescriptionInput.classList.add('hidden');
    }
    
    if (elements.sidePanelStoreHours) {
        elements.sidePanelStoreHours.classList.remove('hidden');
    }
    if (elements.sidePanelStoreHoursEdit) {
        elements.sidePanelStoreHoursEdit.classList.add('hidden');
    }
    
    if (elements.sidePanelPhoneNumber) {
        elements.sidePanelPhoneNumber.classList.remove('hidden');
    }
    if (elements.sidePanelPhoneNumberInput) {
        elements.sidePanelPhoneNumberInput.classList.add('hidden');
    }
    
    // Hide tag remove buttons
    document.querySelectorAll('.side-store-tag-remove').forEach(btn => {
        btn.classList.add('hidden');
    });
    
    // Hide category selection card
    if (elements.sideCategorySelectionCard) {
        elements.sideCategorySelectionCard.classList.add('hidden');
    }
    
    // Update alert visibility
    updateEditAlertVisibility();
}

function populateCategorySelection() {
    if (!elements.sideCategorySelectionGrid) return;
    
    const html = allCategories.map(category => {
        const isSelected = state.selectedCategories.includes(category);
        return `
            <div class="category-selection-item ${isSelected ? 'selected' : ''}" data-category="${category}">
                ${category}
            </div>
        `;
    }).join('');
    
    elements.sideCategorySelectionGrid.innerHTML = html;
    
    // Add click listeners
    elements.sideCategorySelectionGrid.querySelectorAll('.category-selection-item').forEach(item => {
        item.addEventListener('click', () => {
            toggleCategorySelection(item.dataset.category);
        });
    });
}

function toggleCategorySelection(category) {
    const index = state.selectedCategories.indexOf(category);
    
    if (index > -1) {
        // Remove category
        state.selectedCategories.splice(index, 1);
    } else {
        // Add category
        state.selectedCategories.push(category);
    }
    
    // Update UI
    updateSelectedCategories();
    populateCategorySelection();
}

function updateSelectedCategories() {
    if (!elements.sidePanelStoreTags) return;
    
    const tagsHTML = state.selectedCategories.map(tag => 
        `<span class="side-store-tag">
            ${tag}
            <button class="side-store-tag-remove ${state.isEditMode ? '' : 'hidden'}" data-tag="${tag}">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </span>`
    ).join('');
    
    elements.sidePanelStoreTags.innerHTML = tagsHTML;
    
    // Re-attach remove button listeners
    document.querySelectorAll('.side-store-tag-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tag = btn.dataset.tag;
            removeCategoryTag(tag);
        });
    });
}

function removeCategoryTag(tag) {
    const index = state.selectedCategories.indexOf(tag);
    if (index > -1) {
        state.selectedCategories.splice(index, 1);
        updateSelectedCategories();
        populateCategorySelection();
    }
}

function parseAndSetHours(hoursString) {
    if (!elements.sideHoursDaysDropdownText || !elements.sideHoursTimeDropdownText) return;
    
    // Parse hours string like "Mon-Sun • 10:00-22:00" or "Every Day • Open until 23:00"
    const parts = hoursString.split('•');
    if (parts.length !== 2) {
        // Default values if parsing fails
        if (elements.sideHoursDaysDropdownText) elements.sideHoursDaysDropdownText.textContent = 'Her Gün';
        if (elements.sideHoursTimeDropdownText) elements.sideHoursTimeDropdownText.textContent = '11:00 PM';
        return;
    }
    
    const daysPart = parts[0].trim();
    const timePart = parts[1].trim();
    
    // Set days dropdown - check for "Every Day" or "Mon-Fri" patterns
    let selectedDays = 'everyday';
    let daysText = 'Her Gün';
    
    if (daysPart.toLowerCase().includes('every day') || daysPart.toLowerCase().includes('mon-sun')) {
        selectedDays = 'everyday';
        daysText = 'Her Gün';
    } else if (daysPart.toLowerCase().includes('mon-fri') || daysPart.toLowerCase().includes('hafta içi')) {
        selectedDays = 'weekdays';
        daysText = 'Hafta İçi';
    }
    
    if (elements.sideHoursDaysDropdownText) {
        elements.sideHoursDaysDropdownText.textContent = daysText;
    }
    
    // Update active state for days
    if (elements.sideHoursDaysDropdownMenu) {
        elements.sideHoursDaysDropdownMenu.querySelectorAll('.side-custom-dropdown-item').forEach(item => {
            item.classList.toggle('active', item.dataset.value === selectedDays);
        });
    }
    
    // Parse time - look for "23:00" or "until 23:00" or "11:00 PM" format
    let timeValue = '11:00 PM'; // Default time
    
    // Try to find 24-hour format first (e.g., "23:00")
    const time24Match = timePart.match(/(\d{1,2}):(\d{2})/);
    if (time24Match) {
        const hour24 = parseInt(time24Match[1]);
        let hour12 = hour24;
        let ampm = 'AM';
        
        if (hour24 === 0) {
            hour12 = 12;
            ampm = 'AM';
        } else if (hour24 === 12) {
            hour12 = 12;
            ampm = 'PM';
        } else if (hour24 < 12) {
            hour12 = hour24;
            ampm = 'AM';
        } else {
            hour12 = hour24 - 12;
            ampm = 'PM';
        }
        
        timeValue = `${hour12}:00 ${ampm}`;
    } else {
        // Try 12-hour format (e.g., "11:00 PM" or "11 PM")
        const time12Match = timePart.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)/i);
        if (time12Match) {
            const hour = parseInt(time12Match[1]);
            const minute = time12Match[2] || '00';
            const ampm = time12Match[3].toUpperCase();
            timeValue = `${hour}:${minute} ${ampm}`;
        }
    }
    
    // Set the time dropdown value
    if (elements.sideHoursTimeDropdownText) {
        elements.sideHoursTimeDropdownText.textContent = timeValue;
    }
    
    // Update active state for time
    if (elements.sideHoursTimeDropdownMenu) {
        elements.sideHoursTimeDropdownMenu.querySelectorAll('.side-custom-dropdown-item').forEach(item => {
            item.classList.toggle('active', item.dataset.value === timeValue);
        });
    }
}

// Custom dropdown toggle functions
function toggleCustomDropdown(dropdown) {
    if (!dropdown) return;
    
    // Close all other dropdowns
    document.querySelectorAll('.side-custom-dropdown').forEach(d => {
        if (d !== dropdown) {
            d.classList.remove('open');
        }
    });
    
    // Toggle current dropdown
    dropdown.classList.toggle('open');
}

function closeAllCustomDropdowns() {
    document.querySelectorAll('.side-custom-dropdown').forEach(d => {
        d.classList.remove('open');
    });
}

function showSideRouteInfoMode() {
    console.log('🗺️ Showing route info mode');
    
    state.sidePanelMode = 'route';
    
    const location = state.endPoint;
    if (!location) return;
    
    // Update route mode store info - all components
    if (elements.sideRouteStoreLogo) {
        if (location.logo) {
            elements.sideRouteStoreLogo.innerHTML = `<img src="${location.logo}" alt="${location.name}">`;
        } else {
            elements.sideRouteStoreLogo.textContent = location.icon || '🏪';
        }
    }
    if (elements.sideRouteStoreName) {
        elements.sideRouteStoreName.textContent = location.name;
    }
    if (elements.sideRouteStoreFloor) {
        elements.sideRouteStoreFloor.textContent = `${location.floor} • Zorlu Center`;
    }
    
    // Update hours
    if (elements.sideRouteStoreHours) {
        const hours = location.hours || 'Mon-Sun • 10:00-22:00';
        const hoursSpan = elements.sideRouteStoreHours.querySelector('span');
        if (hoursSpan) {
            hoursSpan.textContent = hours;
        }
    }
    
    // Update tags (from location's actual categories with display names)
    if (elements.sideRouteStoreTags) {
        // Get display names for categories
        const displayNames = getCategoryDisplayNames(location.apiCategories);
        
        elements.sideRouteStoreTags.innerHTML = displayNames.map(tag => 
            `<span class="side-store-tag">${tag}</span>`
        ).join('');
    }
    
    // Update description
    if (elements.sideRouteStoreDescription) {
        const descriptions = {
            'shopping': 'Modern moda ve stil tutkunları için geniş ürün yelpazesi ile hizmetinizdeyiz. Kaliteli markaları uygun fiyatlarla keşfedin.',
            'food': 'Lezzetli yemekler ve içeceklerle damak zevkinize hitap ediyoruz. Her öğün için özel menülerimizi keşfedin.',
            'coffee': 'Taze kahve aroması ve samimi atmosferimizle mola vermeniz için ideal mekan. Premium kahve çeşitlerimizi deneyin.',
            'entertainment': 'Eğlence ve dinlenme için mükemmel aktiviteler sunuyoruz. Ailenizle keyifli vakit geçirin.',
            'wc': 'Temiz ve modern tuvalet hizmetleri misafirlerimizin kullanımına sunulmuştur.',
            'atm': 'Çeşitli hizmetlerimizle size yardımcı olmaktan mutluluk duyarız.',
            'parking': 'Güvenli ve geniş otopark alanımız müşterilerimizin hizmetindedir.'
        };
        
        elements.sideRouteStoreDescription.textContent = 
            location.description || descriptions[location.type] || 
            'Zorlu Center\'da hizmet veren kaliteli işletmeler arasındayız. Detaylı bilgi için lütfen ziyaret edin.';
    }
    
    // Update phone
    if (elements.sideRoutePhoneNumber && elements.sideRoutePhoneCard) {
        if (location.telephone) {
            elements.sideRoutePhoneNumber.textContent = formatPhoneNumber(location.telephone);
            elements.sideRoutePhoneCard.style.display = 'flex';
        } else {
            elements.sideRoutePhoneCard.style.display = 'none';
        }
    }
    
    // Update similar stores
    updateRouteSimilarStores(location);
    
    // Generate QR code
    generateQRCode();
    
    // Hide preview mode, show route mode
    if (elements.sideStorePreviewMode) {
        elements.sideStorePreviewMode.classList.add('hidden');
    }
    if (elements.sideRouteInfoMode) {
        elements.sideRouteInfoMode.classList.remove('hidden');
    }
}

function updateRouteSimilarStores(location) {
    if (!elements.sideRouteSimilarStores) return;
    
    const similarStores = locations
        .filter(loc => loc.id !== location.id && loc.type === location.type)
        .slice(0, 3);
    
    if (similarStores.length > 0) {
        const storesHTML = similarStores.map(store => {
            // Show logo if available, otherwise show icon
            if (store.logo) {
                return `
                    <div class="side-similar-item" data-store-id="${store.id}">
                        <img src="${store.logo}" alt="${store.name}" class="side-similar-logo-img">
                    </div>
                `;
            } else {
                return `
                    <div class="side-similar-item" data-store-id="${store.id}">
                        <div class="side-similar-name-only">
                            <span class="side-similar-store-name">${store.name}</span>
                        </div>
                    </div>
                `;
            }
        }).join('');
        
        elements.sideRouteSimilarStores.innerHTML = storesHTML;
        
        // Add click listeners to similar store items in route mode
        elements.sideRouteSimilarStores.querySelectorAll('.side-similar-item[data-store-id]').forEach(item => {
            item.addEventListener('click', () => {
                const storeId = item.dataset.storeId; // String ID'yi olduğu gibi kullan
                console.log('🖱️ Similar store clicked (route mode), ID:', storeId);
                const store = locations.find(loc => loc.id === storeId || loc.id === String(storeId));
                if (store) {
                    console.log('✅ Found store:', store.name);
                    state.endPoint = store;
                    state.selectedLocation = store;
                    
                    // Update search bar placeholder
                    if (elements.sidePanelSearchPlaceholder) {
                        elements.sidePanelSearchPlaceholder.textContent = store.name;
                    }
                    
                    // Update route mode with new store
                    showSideRouteInfoMode();
                } else {
                    console.error('❌ Store not found with ID:', storeId);
                }
            });
        });
    } else {
        elements.sideRouteSimilarStores.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 12px; color: rgba(255, 255, 255, 0.7);">
                <p style="margin: 0; font-size: clamp(10px, 0.85vw, 13px);">Benzer mağaza bulunamadı</p>
            </div>
        `;
    }
}

function loadSidePanelLocations() {
    let filteredLocations = locations;
    
    // Filter by category
    if (state.selectedCategory !== 'all') {
        filteredLocations = filteredLocations.filter(loc => loc.type === state.selectedCategory);
    }
    
    // Filter by search query
    if (state.sidePanelSearchQuery && state.sidePanelSearchQuery.trim() !== '') {
        const query = state.sidePanelSearchQuery.toLowerCase();
        filteredLocations = filteredLocations.filter(loc => 
            loc.name.toLowerCase().includes(query) ||
            loc.category.toLowerCase().includes(query)
        );
    }
    
    displaySidePanelLocations(filteredLocations);
}

function clearSidePanelSearch() {
    state.sidePanelSearchQuery = '';
    if (elements.sidePanelSearchInput) elements.sidePanelSearchInput.value = '';
    if (elements.sidePanelSearchClear) elements.sidePanelSearchClear.classList.remove('visible');
    loadSidePanelLocations();
}

// ==================== SIDE KEYBOARD FUNCTIONS ====================
function showSideKeyboard() {
    if (elements.sideKeyboardOverlay) {
        elements.sideKeyboardOverlay.classList.add('active');
        renderSideKeyboard();
    }
}

function hideSideKeyboard() {
    if (elements.sideKeyboardOverlay) {
        elements.sideKeyboardOverlay.classList.remove('active');
    }
}

function handleSideKeyPress(key) {
    if (key === 'Backspace') {
        state.sidePanelSearchQuery = state.sidePanelSearchQuery.slice(0, -1);
    } else if (key.startsWith('LANG_')) {
        const lang = key.replace('LANG_', '');
        changeKeyboardLanguage(lang);
        renderSideKeyboard();
        return;
    } else if (key === 'Space') {
        state.sidePanelSearchQuery += ' ';
    } else {
        // For Arabic and Chinese, don't convert to lowercase
        // For numbers, keep as is
        if (state.keyboardLanguage === 'ar' || state.keyboardLanguage === 'zh' || /\d/.test(key)) {
            state.sidePanelSearchQuery += key;
        } else {
            state.sidePanelSearchQuery += key.toLowerCase();
        }
    }
    
    // Update input value
    if (elements.sidePanelSearchInput) {
        elements.sidePanelSearchInput.value = state.sidePanelSearchQuery;
    }
    
    // Show/hide clear button
    if (elements.sidePanelSearchClear) {
        elements.sidePanelSearchClear.classList.toggle('visible', state.sidePanelSearchQuery.length > 0);
    }
    
    // Auto search
    loadSidePanelLocations();
}

function renderSideKeyboard() {
    const keyboardContainer = elements.sideInlineKeyboard;
    if (!keyboardContainer) {
        console.error('❌ Side keyboard container not found!');
        return;
    }
    
    console.log('🎹 Rendering side keyboard - Language:', state.keyboardLanguage);
    
    let html = '';
    
    const layout = keyboardLayouts[state.keyboardLanguage];
    const isRTL = layout.rtl || false;
    const hasDualKeys = layout.hasDualKeys || false;
    
    // Numbers row (always visible at top)
    html += '<div class="keyboard-row numbers-row">';
    // Special characters at the start
    ['&', '.'].forEach(char => {
        html += `<button class="inline-key special-char-key" data-key="${char}">${char}</button>`;
    });
    // Numbers
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach(num => {
        html += `<button class="inline-key number-key" data-key="${num}">${num}</button>`;
    });
    // Special characters at the end
    ['-', '/'].forEach(char => {
        html += `<button class="inline-key special-char-key" data-key="${char}">${char}</button>`;
    });
    html += '</div>';
    
    // First letter row
    html += `<div class="keyboard-row ${isRTL ? 'rtl' : ''}">`;
    layout.letters[0].forEach(key => {
        if (hasDualKeys && key.main) {
            html += `<button class="inline-key chinese-key" data-key="${key.main}">
                <span class="key-main">${key.main}</span>
                <span class="key-sub">${key.sub}</span>
            </button>`;
        } else {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        }
    });
    html += '</div>';
    
    // Second letter row
    html += `<div class="keyboard-row ${isRTL ? 'rtl' : ''}">`;
    layout.letters[1].forEach(key => {
        if (hasDualKeys && key.main) {
            html += `<button class="inline-key chinese-key" data-key="${key.main}">
                <span class="key-main">${key.main}</span>
                <span class="key-sub">${key.sub}</span>
            </button>`;
        } else {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        }
    });
    html += '</div>';
    
    // Third letter row with backspace
    html += `<div class="keyboard-row ${isRTL ? 'rtl' : ''}">`;
    layout.letters[2].forEach(key => {
        if (hasDualKeys && key.main) {
            html += `<button class="inline-key chinese-key" data-key="${key.main}">
                <span class="key-main">${key.main}</span>
                <span class="key-sub">${key.sub}</span>
            </button>`;
        } else {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        }
    });
    html += `
        <button class="inline-key special" data-key="Backspace">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 4H9L3 12L9 20H21C21.5523 20 22 19.5523 22 19V5C22 4.44772 21.5523 4 21 4Z" stroke="currentColor" stroke-width="2"/>
                <path d="M17 9L11 15M11 9L17 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </button>
    `;
    html += '</div>';
    
    // Space bar row
    html += '<div class="keyboard-row">';
    html += '<button class="inline-key space-key" data-key="Space">Space</button>';
    html += '</div>';
    
    keyboardContainer.innerHTML = html;
    
    console.log('✅ Side keyboard rendered successfully');
    
    // Re-attach event listeners
    setTimeout(() => {
        attachSideKeyboardListeners();
    }, 0);
}

function attachSideKeyboardListeners() {
    const allKeys = elements.sideInlineKeyboard.querySelectorAll('.inline-key');
    allKeys.forEach(key => {
        key.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const keyValue = key.dataset.key;
            console.log('Side key pressed:', keyValue);
            handleSideKeyPress(keyValue);
        });
    });
}

function displaySidePanelLocations(locationsList) {
    if (!elements.sidePanelResults) return;
    
    if (locationsList.length === 0) {
        elements.sidePanelResults.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
                <p style="font-size: 14px;">Sonuç bulunamadı</p>
            </div>
        `;
        return;
    }
    
    elements.sidePanelResults.innerHTML = locationsList.map(loc => `
        <div class="side-location-item" data-id="${loc.id}">
            <div class="side-location-icon">Z</div>
            <div class="side-location-info">
                <div class="side-location-name">${loc.name}</div>
                <div class="side-location-details">${loc.category} • ${loc.floor}</div>
            </div>
        </div>
    `).join('');
    
    // Add click listeners
    document.querySelectorAll('.side-location-item').forEach(item => {
        item.addEventListener('click', () => {
            const locationId = parseInt(item.dataset.id);
            selectLocationFromSidePanel(locationId);
        });
    });
}

function selectLocationFromSidePanel(locationId) {
    const location = locations.find(loc => loc.id === locationId);
    if (!location) return;
    
    // Update the selected point
    if (state.editingPoint === 'start') {
        state.startPoint = location;
        if (elements.sidePanelStartName) {
            elements.sidePanelStartName.textContent = location.name;
        }
    } else {
        state.endPoint = location;
        if (elements.sidePanelEndName) {
            elements.sidePanelEndName.textContent = location.name;
        }
    }
    
    // Regenerate QR code
    generateQRCode();
    
    // Hide keyboard
    hideSideKeyboard();
    
    // Close side panel
    closeSidePanel();
}

// ==================== FLOOR SELECTOR ====================
function changeFloor(floorId) {
    console.log('🏢 Changing floor to:', floorId);
    state.currentFloor = floorId;
    
    // Handle "Tüm Katlar" (null)
    if (floorId === null || floorId === undefined) {
        console.log('✅ Showing all floors');
        
        // Update display to show "Tüm Katlar"
        if (elements.currentFloorName) {
            elements.currentFloorName.textContent = 'Tüm Katlar';
        }
        
        // Update map floor display
        if (elements.mapCurrentFloorName) {
            elements.mapCurrentFloorName.textContent = 'Tüm Katlar';
        }
        
        // Update dropdown active state
        document.querySelectorAll('.floor-dropdown-item').forEach(item => {
            item.classList.toggle('active', item.dataset.floor === 'all');
        });
        
        // Update map dropdown active state
        document.querySelectorAll('.map-floor-dropdown-item').forEach(item => {
            item.classList.toggle('active', item.dataset.floor === 'all');
        });
        
        // Update map SVG to first floor
        if (floors.length > 0) {
            const firstFloorId = floors[0].id;
            const mapSvg = document.getElementById('floorMapSvg');
            if (mapSvg) {
                mapSvg.src = `floors/${firstFloorId}.svg`;
                console.log('🗺️ Map updated to first floor:', mapSvg.src);
            }
            
            // Update store map SVG in detail view
            const storeMapSvg = document.getElementById('storeFloorMap');
            if (storeMapSvg) {
                storeMapSvg.src = `floors/${firstFloorId}.svg`;
            }
        }
        
        // Reload locations if search tab is open (show all floors)
        if (elements.searchTab && elements.searchTab.classList.contains('open')) {
            if (state.searchQuery && state.searchQuery.trim() !== '') {
                searchLocations(state.searchQuery);
            } else {
                loadAllLocations();
            }
        }
        
        return;
    }
    
    const floor = floors.find(f => f.id === floorId);
    
    if (floor) {
        console.log('✅ Floor found:', floor);
        
        // Update display
        if (elements.currentFloorName) {
            elements.currentFloorName.textContent = floor.name;
        }
        
        // Update map floor display
        if (elements.mapCurrentFloorName) {
            elements.mapCurrentFloorName.textContent = floor.name;
        }
        
        // Update dropdown active state
        document.querySelectorAll('.floor-dropdown-item').forEach(item => {
            item.classList.toggle('active', parseInt(item.dataset.floor) === floorId);
        });
        
        // Update map dropdown active state
        document.querySelectorAll('.map-floor-dropdown-item').forEach(item => {
            item.classList.toggle('active', parseInt(item.dataset.floor) === floorId);
        });
        
        // Update map SVG
        const mapSvg = document.getElementById('floorMapSvg');
        if (mapSvg) {
            mapSvg.src = `floors/${floorId}.svg`;
            console.log('🗺️ Map updated to:', mapSvg.src);
        }
        
        // Update store map SVG in detail view
        const storeMapSvg = document.getElementById('storeFloorMap');
        if (storeMapSvg) {
            storeMapSvg.src = `floors/${floorId}.svg`;
        }
        
        // Reload locations if search tab is open (filter by new floor)
        if (elements.searchTab && elements.searchTab.classList.contains('open')) {
            if (state.searchQuery && state.searchQuery.trim() !== '') {
                searchLocations(state.searchQuery);
            } else {
                loadAllLocations();
            }
        }
        
    } else {
        console.error('❌ Floor not found:', floorId);
    }
}

function goToNextFloor() {
    console.log('⬆️ Go to next floor');
    
    // If showing all floors, go to first floor
    if (state.currentFloor === null || state.currentFloor === undefined) {
        if (floors.length > 0) {
            changeFloor(floors[0].id);
        }
        return;
    }
    
    const currentIndex = floors.findIndex(f => f.id === state.currentFloor);
    console.log('Current index:', currentIndex);
    if (currentIndex > 0) {
        changeFloor(floors[currentIndex - 1].id);
    } else {
        // At top floor, go to "Tüm Katlar"
        changeFloor(null);
    }
}

function goToPreviousFloor() {
    console.log('⬇️ Go to previous floor');
    
    // If showing all floors, go to first floor
    if (state.currentFloor === null || state.currentFloor === undefined) {
        if (floors.length > 0) {
            changeFloor(floors[0].id);
        }
        return;
    }
    
    const currentIndex = floors.findIndex(f => f.id === state.currentFloor);
    console.log('Current index:', currentIndex);
    if (currentIndex < floors.length - 1) {
        changeFloor(floors[currentIndex + 1].id);
    } else {
        // At bottom floor, go to "Tüm Katlar"
        changeFloor(null);
    }
}

function toggleFloorDropdown() {
    elements.floorSelectorCompact.classList.toggle('open');
}

function closeFloorDropdown() {
    elements.floorSelectorCompact.classList.remove('open');
}

function toggleMapFloorDropdown() {
    if (elements.mapFloorSelectorCompact) {
        elements.mapFloorSelectorCompact.classList.toggle('open');
    }
}

function closeMapFloorDropdown() {
    if (elements.mapFloorSelectorCompact) {
        elements.mapFloorSelectorCompact.classList.remove('open');
    }
}

// ==================== CATEGORY FILTERING ====================
function selectCategory(category) {
    state.selectedCategory = category;
    
    // Update active state
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
    });
    
    // Clear search query when category is selected
    state.searchQuery = '';
    if (elements.tabSearchInput) elements.tabSearchInput.value = '';
    if (elements.keyboardDisplay) elements.keyboardDisplay.value = '';
    if (elements.tabClearBtn) elements.tabClearBtn.classList.remove('visible');
    
    // If "Tümü" is selected, reset category tabs
    if (category === 'all') {
        const allCategories = getUniqueCategories();
        updateCategoryTabs(allCategories);
    }
    
    // Apply filter without search query
    searchLocations('');
}

function selectSideListCategory(category) {
    state.sideListCategory = category;
    
    // Update active state
    document.querySelectorAll('.side-list-category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
    });
    
    // Clear search query when category is selected
    state.sideListSearchQuery = '';
    if (elements.sideListSearchInput) elements.sideListSearchInput.value = '';
    
    // If "Tümü" is selected, reset category tabs
    if (category === 'all') {
        const allCategories = getUniqueCategories();
        updateSidePanelCategoryTabs(allCategories);
    }
    
    // Reload without search query
    loadSideListLocations();
}

function updateSideListResults(locationsList) {
    const sideListResults = document.getElementById('sideListResults');
    if (!sideListResults) return;
    
    if (locationsList.length === 0) {
        sideListResults.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                <p style="font-size: 16px;">Sonuç bulunamadı</p>
            </div>
        `;
        return;
    }
    
    sideListResults.innerHTML = locationsList.map(loc => `
        <div class="side-list-result-item" data-id="${loc.id}">
            <div class="side-list-result-icon">
                ${loc.logo ? `<img src="${loc.logo}" alt="${loc.name}">` : loc.icon}
            </div>
            <div class="side-list-result-info">
                <div class="side-list-result-name">${loc.name}</div>
                <div class="side-list-result-details">${loc.category} • ${loc.floor}</div>
            </div>
        </div>
    `).join('');
    
    // Add click listeners
    sideListResults.querySelectorAll('.side-list-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const locationId = item.dataset.id;
            const location = locations.find(loc => String(loc.id) === String(locationId));
            if (location) {
                showStorePreviewInSidePanel(location);
            }
        });
    });
}

function selectEditingPoint(point) {
    state.editingPoint = point;
    
    // Update UI
    if (point === 'start') {
        if (elements.startPointSelector) elements.startPointSelector.classList.add('active');
        if (elements.endPointSelector) elements.endPointSelector.classList.remove('active');
    } else {
        if (elements.endPointSelector) elements.endPointSelector.classList.add('active');
        if (elements.startPointSelector) elements.startPointSelector.classList.remove('active');
    }
}

// ==================== KEYBOARD ====================
function showKeyboard() {
    if (elements.keyboard) {
        elements.keyboard.classList.remove('hidden');
    }
    if (elements.keyboardDisplay) {
        elements.keyboardDisplay.value = state.searchQuery;
    }
}

function hideKeyboard() {
    if (elements.keyboard) {
        elements.keyboard.classList.add('hidden');
    }
}

function handleKeyPress(key) {
    if (key === 'Backspace') {
        state.searchQuery = state.searchQuery.slice(0, -1);
    } else {
        state.searchQuery += key;
    }
    
    if (elements.tabSearchInput) elements.tabSearchInput.value = state.searchQuery;
    if (elements.keyboardDisplay) elements.keyboardDisplay.value = state.searchQuery;
    
    // Show/hide clear button
    if (elements.tabClearBtn) {
        elements.tabClearBtn.classList.toggle('visible', state.searchQuery.length > 0);
    }
    
    // Auto search
    searchLocations(state.searchQuery);
}

function clearSearch() {
    state.searchQuery = '';
    if (elements.tabSearchInput) elements.tabSearchInput.value = '';
    if (elements.keyboardDisplay) elements.keyboardDisplay.value = '';
    if (elements.tabClearBtn) elements.tabClearBtn.classList.remove('visible');
    
    // Reset category tabs to show all categories
    const allCategories = getUniqueCategories();
    updateCategoryTabs(allCategories);
    
    // Apply current category filter (if any)
    searchLocations('');
}

function handleInlineKeyPress(key) {
    if (key === 'Backspace') {
        state.searchQuery = state.searchQuery.slice(0, -1);
    } else if (key.startsWith('LANG_')) {
        const lang = key.replace('LANG_', '');
        changeKeyboardLanguage(lang);
        return;
    } else if (key === 'Space') {
        state.searchQuery += ' ';
    } else {
        // For Arabic and Chinese, don't convert to lowercase
        // For numbers, keep as is
        if (state.keyboardLanguage === 'ar' || state.keyboardLanguage === 'zh' || /\d/.test(key)) {
            state.searchQuery += key;
        } else {
            state.searchQuery += key.toLowerCase();
        }
    }
    
        // Update search placeholder
    if (elements.searchPlaceholder) {
        // Always apply RTL/LTR based on language
        const isRTL = state.keyboardLanguage === 'ar';
        elements.searchPlaceholder.style.direction = isRTL ? 'rtl' : 'ltr';
        elements.searchPlaceholder.style.textAlign = isRTL ? 'right' : 'left';
        elements.searchPlaceholder.style.unicodeBidi = 'embed';
        
        if (state.searchQuery) {
            elements.searchPlaceholder.textContent = state.searchQuery;
            elements.searchPlaceholder.style.color = 'white';
            console.log('🖊️ Updated text:', state.searchQuery, 'RTL:', isRTL);
        } else {
            elements.searchPlaceholder.textContent = getPlaceholderText();
            elements.searchPlaceholder.style.color = 'rgba(255, 255, 255, 0.85)';
        }
    }
    
    // Auto search
    searchLocations(state.searchQuery);
}

function getPlaceholderText() {
    const placeholders = {
        tr: 'Nereye gitmek istersiniz?',
        en: 'Where would you like to go?',
        zh: '您想去哪里？',
        ar: 'أين تريد أن تذهب؟'
    };
    return placeholders[state.keyboardLanguage] || placeholders.tr;
}

function changeKeyboardLanguage(lang) {
    console.log('🌍 Changing keyboard language to:', lang);
    state.keyboardLanguage = lang;
    state.keyboardMode = 'letters'; // Reset to letters when changing language
    
    // Update placeholder and direction immediately
    if (elements.searchPlaceholder) {
        const isRTL = lang === 'ar';
        elements.searchPlaceholder.style.direction = isRTL ? 'rtl' : 'ltr';
        elements.searchPlaceholder.style.textAlign = isRTL ? 'right' : 'left';
        elements.searchPlaceholder.style.unicodeBidi = 'embed';
        
        if (!state.searchQuery) {
            elements.searchPlaceholder.textContent = getPlaceholderText();
        }
    }
    
    renderInlineKeyboard();
    console.log('✅ Language changed successfully to:', lang);
}

function toggleKeyboardMode() {
    state.keyboardMode = state.keyboardMode === 'letters' ? 'numbers' : 'letters';
    renderInlineKeyboard();
}

function renderInlineKeyboard() {
    const keyboardContainer = document.querySelector('.inline-keyboard');
    if (!keyboardContainer) {
        console.error('❌ Keyboard container not found!');
        return;
    }
    
    console.log('🎹 Rendering keyboard - Language:', state.keyboardLanguage);
    
    let html = '';
    
    const layout = keyboardLayouts[state.keyboardLanguage];
    const isRTL = layout.rtl || false;
    const hasDualKeys = layout.hasDualKeys || false;
    
    // Numbers row (always visible at top)
    html += '<div class="keyboard-row numbers-row">';
    // Special characters at the start
    ['&', '.'].forEach(char => {
        html += `<button class="inline-key special-char-key" data-key="${char}">${char}</button>`;
    });
    // Numbers
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].forEach(num => {
        html += `<button class="inline-key number-key" data-key="${num}">${num}</button>`;
    });
    // Special characters at the end
    ['-', '/'].forEach(char => {
        html += `<button class="inline-key special-char-key" data-key="${char}">${char}</button>`;
    });
    html += '</div>';
    
    // First letter row
    html += `<div class="keyboard-row ${isRTL ? 'rtl' : ''}">`;
    layout.letters[0].forEach(key => {
        if (hasDualKeys && key.main) {
            // Chinese dual key
            html += `<button class="inline-key chinese-key" data-key="${key.main}">
                <span class="key-main">${key.main}</span>
                <span class="key-sub">${key.sub}</span>
            </button>`;
        } else {
            // Normal key
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        }
    });
    html += '</div>';
    
    // Second letter row
    html += `<div class="keyboard-row ${isRTL ? 'rtl' : ''}">`;
    layout.letters[1].forEach(key => {
        if (hasDualKeys && key.main) {
            html += `<button class="inline-key chinese-key" data-key="${key.main}">
                <span class="key-main">${key.main}</span>
                <span class="key-sub">${key.sub}</span>
            </button>`;
        } else {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        }
    });
    html += '</div>';
    
    // Third letter row with backspace
    html += `<div class="keyboard-row ${isRTL ? 'rtl' : ''}">`;
    layout.letters[2].forEach(key => {
        if (hasDualKeys && key.main) {
            html += `<button class="inline-key chinese-key" data-key="${key.main}">
                <span class="key-main">${key.main}</span>
                <span class="key-sub">${key.sub}</span>
            </button>`;
        } else {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        }
    });
    html += `
        <button class="inline-key special" data-key="Backspace">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 4H9L3 12L9 20H21C21.5523 20 22 19.5523 22 19V5C22 4.44772 21.5523 4 21 4Z" stroke="currentColor" stroke-width="2"/>
                <path d="M17 9L11 15M11 9L17 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </button>
    `;
    html += '</div>';
    
    // Space bar row
    html += '<div class="keyboard-row">';
    html += '<button class="inline-key space-key" data-key="Space">Space</button>';
    html += '</div>';
    
        keyboardContainer.innerHTML = html;
    
    console.log('✅ Keyboard rendered successfully');
    
    // Re-attach event listeners
    setTimeout(() => {
        attachInlineKeyboardListeners();
    }, 0);
}

function attachInlineKeyboardListeners() {
    // Attach listeners to all keys (including language buttons)
    const allKeys = document.querySelectorAll('.inline-key, .keyboard-lang-btn');
    allKeys.forEach(key => {
        key.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const keyValue = key.dataset.key;
            console.log('Key pressed:', keyValue);
            handleInlineKeyPress(keyValue);
        });
    });
}

// ==================== QR CODE ====================
function showQRCode() {
    if (!state.endPoint) return;
    
    const routeUrl = `https://zorlu.center/route?from=${state.startPoint.id}&to=${state.endPoint.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(routeUrl)}`;
    
    if (elements.qrCodeImage) {
        elements.qrCodeImage.src = qrUrl;
    }
    if (elements.qrModal) {
        elements.qrModal.classList.add('active');
    }
}

function hideQRCode() {
    if (elements.qrModal) {
        elements.qrModal.classList.remove('active');
    }
}

// ==================== CLOCK ====================
function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const timeElement = document.getElementById('currentTime');
    const dateElement = document.getElementById('currentDate');
    const dayElement = document.getElementById('currentDay');
    
    if (timeElement) {
        timeElement.textContent = `${hours}:${minutes}`;
    }
    
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const monthsShort = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    
    const dayName = days[now.getDay()];
    const monthName = monthsShort[now.getMonth()];
    const date = now.getDate();
    
    if (dateElement) {
        dateElement.innerHTML = `<span class="month-day">${date} ${monthName}</span><span class="day">${dayName}</span>`;
    }
    
    if (dayElement) {
        dayElement.textContent = dayName;
    }
}

// ==================== EVENT LISTENERS ====================
function initEventListeners() {
    // Home search trigger
    elements.homeSearchTrigger.addEventListener('click', () => {
        // Hide store detail if it's showing
        hideStoreDetailInSearchTab();
        showSearchTab();
    });
    
    // Category cards on home screen
    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', () => {
            const category = card.dataset.category;
            selectCategory(category);
            // Hide store detail if it's showing
            hideStoreDetailInSearchTab();
            showSearchTab();
        });
    });
    
        // Route point selectors
    // Start point is always kiosk location, so we disable its click
    // Only end point can be selected
    
    if (elements.endPointSelector) {
        elements.endPointSelector.addEventListener('click', () => {
            selectEditingPoint('end');
            // Hide store detail if it's showing
            hideStoreDetailInSearchTab();
            showSearchTab();
        });
    }
    
            // Explore map button
    if (elements.exploreMapBtn) {
        elements.exploreMapBtn.addEventListener('click', () => {
            // Hide initial home to show map
            elements.initialHome.style.opacity = '0';
            elements.initialHome.style.visibility = 'hidden';
            elements.initialHome.style.pointerEvents = 'none';
            state.currentView = 'map';
            
            // Hide mini slideshow
            hideMiniSlideshow();
            
            // Ensure side panel is hidden and map is centered
            if (elements.mapSidePanel) {
                elements.mapSidePanel.classList.add('hidden');
            }
            if (elements.mapContainer) {
                elements.mapContainer.classList.remove('panel-visible-left', 'panel-visible-right');
            }
            
            // Show floor selector on map view
            if (elements.mapFloorSelectorCompact) {
                elements.mapFloorSelectorCompact.style.display = 'flex';
            }
        });
    }
    
    // Map back button
    if (elements.mapBackBtn) {
        elements.mapBackBtn.addEventListener('click', () => {
            // Close store detail if open
            hideStoreDetailInSearchTab();
            showInitialHome();
        });
    }
    
    // Store detail back button
    const storeMapBackBtn = document.getElementById('storeMapBackBtn');
    if (storeMapBackBtn) {
        storeMapBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('⬅️ Store Map Back clicked!');
            hideStoreDetailInSearchTab();
        });
    }
    
    // Start Heading Forward button
    const startHeadingBtn = document.getElementById('startHeadingBtn');
    if (startHeadingBtn) {
        startHeadingBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🧭 Start Heading Forward clicked!');
            transitionToMapView();
        });
    }
    
    // Store detail route switch buttons
    const storeRouteSwitch = document.getElementById('storeRouteSwitch');
    const storeRouteSwitchBtns = document.querySelectorAll('.route-switch-btn');
    
    storeRouteSwitchBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const routeType = btn.dataset.type;
            console.log('🔄 Route type switched to:', routeType);
            
            // Update switch state
            if (routeType === 'accessible') {
                storeRouteSwitch.classList.add('accessible');
            } else {
                storeRouteSwitch.classList.remove('accessible');
            }
            
            // Update state
            state.routeType = routeType;
        });
    });
    
        // Tab back button
    if (elements.tabBackBtn) {
        elements.tabBackBtn.addEventListener('click', () => {
            hideSearchTab();
        });
    }
    
    // Search input
    if (elements.tabSearchInput) {
        elements.tabSearchInput.addEventListener('click', () => {
            showKeyboard();
        });
        
        elements.tabSearchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            searchLocations(state.searchQuery);
            if (elements.tabClearBtn) {
                elements.tabClearBtn.classList.toggle('visible', state.searchQuery.length > 0);
            }
        });
    }
    
    // Clear button
    if (elements.tabClearBtn) {
        elements.tabClearBtn.addEventListener('click', () => {
            clearSearch();
        });
    }
    
    // Category tabs - Now handled dynamically in updateCategoryTabs()
    // Static tabs removed, dynamic tabs added when API data is loaded
    
            // Keyboard keys (full keyboard)
    const fullKeys = document.querySelectorAll('.key');
    if (fullKeys.length > 0) {
        console.log('✅ Full keyboard keys found:', fullKeys.length);
        fullKeys.forEach(key => {
            key.addEventListener('click', () => {
                handleKeyPress(key.dataset.key);
            });
        });
    }
    
        // Inline keyboard keys
    attachInlineKeyboardListeners();
    console.log('✅ Inline keyboard initialized');
    
    // Side panel search bar - opens location list view
    if (elements.sidePanelSearchBar) {
        elements.sidePanelSearchBar.addEventListener('click', () => {
            console.log('🔍 Side panel search bar clicked - opening location list...');
            showSideLocationList();
        });
    }
    
    // Search bar placeholder click - show list when clicked while showing location name
    if (elements.sidePanelSearchPlaceholder) {
        elements.sidePanelSearchPlaceholder.addEventListener('click', () => {
            showSideLocationList();
        });
    }
    
    // Search input for filtering
    if (elements.sidePanelSearchInput) {
        elements.sidePanelSearchInput.addEventListener('input', (e) => {
            state.sideListSearchQuery = e.target.value;
            loadSideListLocations();
        });
    }
    
    // Side list category tabs - Now handled dynamically in updateSidePanelCategoryTabs()
    // Static tabs removed, dynamic tabs added when API data is loaded
    
    // Draw Route button
    if (elements.sideDrawRouteBtn) {
        elements.sideDrawRouteBtn.addEventListener('click', () => {
            console.log('🗺️ Draw Route button clicked');
            showSideRouteInfoMode();
        });
    }
    
    // Edit Mode Event Listeners
    if (elements.sidePanelEditBtn) {
        elements.sidePanelEditBtn.addEventListener('click', () => {
            toggleEditMode();
        });
    }
    
    
    if (elements.sideSubmitEditBtn) {
        elements.sideSubmitEditBtn.addEventListener('click', () => {
            submitEditChanges();
        });
    }
    
    // Custom Dropdown Event Listeners
    // Floor Dropdown
    if (elements.sidePanelFloorDropdownBtn) {
        elements.sidePanelFloorDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCustomDropdown(elements.sidePanelFloorDropdown);
        });
    }
    
    if (elements.sidePanelFloorDropdownMenu) {
        elements.sidePanelFloorDropdownMenu.querySelectorAll('.side-custom-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const value = item.dataset.value;
                const floor = floors.find(f => f.id === parseInt(value));
                if (floor && elements.sidePanelFloorDropdownText) {
                    elements.sidePanelFloorDropdownText.textContent = floor.name;
                    // Update active state
                    elements.sidePanelFloorDropdownMenu.querySelectorAll('.side-custom-dropdown-item').forEach(i => {
                        i.classList.toggle('active', i === item);
                    });
                }
                closeAllCustomDropdowns();
            });
        });
    }
    
    // Days Dropdown
    if (elements.sideHoursDaysDropdownBtn) {
        elements.sideHoursDaysDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCustomDropdown(elements.sideHoursDaysDropdown);
        });
    }
    
    if (elements.sideHoursDaysDropdownMenu) {
        elements.sideHoursDaysDropdownMenu.querySelectorAll('.side-custom-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const value = item.dataset.value;
                const text = item.textContent;
                if (elements.sideHoursDaysDropdownText) {
                    elements.sideHoursDaysDropdownText.textContent = text;
                    // Update active state
                    elements.sideHoursDaysDropdownMenu.querySelectorAll('.side-custom-dropdown-item').forEach(i => {
                        i.classList.toggle('active', i === item);
                    });
                }
                closeAllCustomDropdowns();
            });
        });
    }
    
    // Time Dropdown
    if (elements.sideHoursTimeDropdownBtn) {
        elements.sideHoursTimeDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCustomDropdown(elements.sideHoursTimeDropdown);
        });
    }
    
    if (elements.sideHoursTimeDropdownMenu) {
        elements.sideHoursTimeDropdownMenu.querySelectorAll('.side-custom-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const value = item.dataset.value;
                const text = item.textContent;
                if (elements.sideHoursTimeDropdownText) {
                    elements.sideHoursTimeDropdownText.textContent = text;
                    // Update active state
                    elements.sideHoursTimeDropdownMenu.querySelectorAll('.side-custom-dropdown-item').forEach(i => {
                        i.classList.toggle('active', i === item);
                    });
                }
                closeAllCustomDropdowns();
            });
        });
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.side-custom-dropdown')) {
            closeAllCustomDropdowns();
        }
    });
    
    // Side panel end point - clicking opens search for new destination
    if (elements.sidePanelEndPoint) {
        elements.sidePanelEndPoint.addEventListener('click', () => {
            console.log('📍 End point clicked - opening search for new destination...');
            
            // Show initial home with search tab
            elements.initialHome.style.transition = 'opacity 0.3s ease';
            elements.initialHome.style.opacity = '1';
            elements.initialHome.style.visibility = 'visible';
            elements.initialHome.style.pointerEvents = 'auto';
            
            // Hide side panel
            if (elements.mapSidePanel) {
                elements.mapSidePanel.classList.add('hidden');
            }
            
            // Remove panel-visible classes from map-container
            if (elements.mapContainer) {
                elements.mapContainer.classList.remove('panel-visible-left', 'panel-visible-right');
            }
            
            // Open search tab after a short delay
            setTimeout(() => {
                showSearchTab();
            }, 100);
        });
    }
    
    // Route type buttons
    if (elements.routeTypeNormal) {
        elements.routeTypeNormal.addEventListener('click', () => {
            changeRouteType('shortest');
        });
    }
    
    if (elements.routeTypeAccessible) {
        elements.routeTypeAccessible.addEventListener('click', () => {
            changeRouteType('accessible');
        });
    }
    
    // Panel toggle button (top bar)
    if (elements.panelToggleBtnTop) {
        elements.panelToggleBtnTop.addEventListener('click', () => {
            togglePanelSide();
        });
    }
    
        // QR close
    if (elements.qrCloseBtn) {
        elements.qrCloseBtn.addEventListener('click', () => {
            hideQRCode();
        });
    }
    
    if (elements.qrModal) {
        elements.qrModal.addEventListener('click', (e) => {
            if (e.target === elements.qrModal) {
                hideQRCode();
            }
        });
    }
    
        // Floor selector - main map
    document.querySelectorAll('.floor-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const floorId = parseInt(btn.dataset.floor);
            changeFloor(floorId);
        });
    });
    
    // Search tab floor selector (compact)
    if (elements.floorUpBtn) {
        elements.floorUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            goToNextFloor();
        });
    }
    
    if (elements.floorDownBtn) {
        elements.floorDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            goToPreviousFloor();
        });
    }
    
    if (elements.floorDisplayBtn) {
        elements.floorDisplayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFloorDropdown();
        });
    }
    
    // Note: Floor dropdown items are dynamically created by updateFloorDropdown()
    // and event listeners are attached there
    
    // Map floor selector (bottom right)
    if (elements.mapFloorUpBtn) {
        elements.mapFloorUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            goToNextFloor();
        });
    }
    
    if (elements.mapFloorDownBtn) {
        elements.mapFloorDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            goToPreviousFloor();
        });
    }
    
    if (elements.mapFloorDisplayBtn) {
        elements.mapFloorDisplayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMapFloorDropdown();
        });
    }
    
    // Note: Map floor dropdown items are dynamically created by updateFloorDropdown()
    // and event listeners are attached there
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (elements.floorSelectorCompact && !elements.floorSelectorCompact.contains(e.target)) {
            closeFloorDropdown();
        }
        if (elements.mapFloorSelectorCompact && !elements.mapFloorSelectorCompact.contains(e.target)) {
            closeMapFloorDropdown();
        }
    });
    
    console.log('🏫 Floor selector initialized with', floors.length, 'floors');
    
    // Language switcher - changes keyboard language
    document.querySelectorAll('.lang-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const lang = btn.dataset.lang;
            console.log('🌍 Switching language to:', lang);
            
            // Update active state
            document.querySelectorAll('.lang-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Change keyboard language
            changeKeyboardLanguage(lang);
        });
    });
    
    // Side keyboard handle - close on click/swipe down
    const keyboardHandle = document.querySelector('.side-keyboard-handle');
    if (keyboardHandle) {
        keyboardHandle.addEventListener('click', () => {
            hideSideKeyboard();
        });
    }
}

// ==================== IDLE TIMEOUT ====================
let idleTimer;
const IDLE_TIMEOUT = 90000; // 90 seconds

function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        // Reset to initial state
        state.searchQuery = '';
        state.selectedLocation = null;
        state.startPoint = state.kioskLocation; // Set to kiosk location
        state.endPoint = null;
        state.editingPoint = 'end'; // Always editing end point (destination)
        state.currentFloor = 0;
        state.panelSide = 'right';
        state.routeType = 'shortest'; // Reset to shortest route
        state.sidePanelMode = 'preview'; // Reset side panel mode
        state.sideListSearchQuery = ''; // Reset side list search
        state.sideListCategory = 'all'; // Reset side list category
        state.isEditMode = false; // Reset edit mode
        state.hasPendingEditChanges = false; // Reset pending changes
        
        // Reset displays
        if (elements.startPointDisplay) elements.startPointDisplay.textContent = state.kioskLocation.name;
        if (elements.endPointDisplay) elements.endPointDisplay.textContent = 'Seçiniz';
        if (elements.sidePanelStartName) elements.sidePanelStartName.textContent = state.kioskLocation.name;
        if (elements.sidePanelEndName) elements.sidePanelEndName.textContent = 'Seçiniz';
        
        // Update alert visibility
        updateEditAlertVisibility();
        
        // Reset side panel search placeholder
        if (elements.sidePanelSearchPlaceholder) {
            elements.sidePanelSearchPlaceholder.textContent = 'Nereye gitmek istersiniz?';
        }
        
        // Reset active state - end point should be active
        if (elements.startPointSelector) elements.startPointSelector.classList.remove('active');
        if (elements.endPointSelector) elements.endPointSelector.classList.add('active');
        
        hideKeyboard();
        hideQRCode();
        closeFloorDropdown();
        closeMapFloorDropdown();
        hideSideLocationList();
        
        // Reset side panel modes
        if (elements.sideStorePreviewMode) {
            elements.sideStorePreviewMode.classList.remove('hidden');
        }
        if (elements.sideStoreDetailView) {
            elements.sideStoreDetailView.classList.remove('hidden');
        }
        if (elements.sideLocationListView) {
            elements.sideLocationListView.classList.add('hidden');
        }
        if (elements.sideRouteInfoMode) {
            elements.sideRouteInfoMode.classList.add('hidden');
        }
        
        // Hide side panel
        if (elements.mapSidePanel) {
            elements.mapSidePanel.classList.add('hidden');
            elements.mapSidePanel.classList.add('panel-right'); // Reset to default right position
        }
        if (elements.mapContainer) {
            elements.mapContainer.classList.add('panel-right'); // Reset to default right position
            elements.mapContainer.classList.remove('panel-visible-left', 'panel-visible-right'); // Remove panel-visible classes
        }
        if (elements.panelToggleBtnTop) {
            elements.panelToggleBtnTop.classList.add('panel-right'); // Reset to default right position
        }
        
        // Reset route switch to shortest
        const storeRouteSwitch = document.getElementById('storeRouteSwitch');
        if (storeRouteSwitch) {
            storeRouteSwitch.classList.remove('accessible');
        }
        
        showInitialHome();
        changeFloor(0); // Reset to ground floor
    }, IDLE_TIMEOUT);
}

function initIdleDetection() {
    ['click', 'touchstart', 'mousemove'].forEach(event => {
        document.addEventListener(event, resetIdleTimer);
    });
    resetIdleTimer();
}

// ==================== INITIALIZATION ====================
async function init() {
    console.log('🚀 Zorlu Center Kiosk V2 Initialized');
    
    // Load category mapping first
    await loadCategoryMapping();
    
    // Load locations from API
    await loadLocations();
    
    // Set initial start point to kiosk location
    state.startPoint = state.kioskLocation;
    state.editingPoint = 'end'; // Always editing end point (destination)
    
    // Update displays
    if (elements.startPointDisplay) elements.startPointDisplay.textContent = state.kioskLocation.name;
    if (elements.sidePanelStartName) elements.sidePanelStartName.textContent = state.kioskLocation.name;
    
    // Set active state - end point should be active
    if (elements.startPointSelector) elements.startPointSelector.classList.remove('active');
    if (elements.endPointSelector) elements.endPointSelector.classList.add('active');
    
    updateClock();
    setInterval(updateClock, 1000);
    
    initEventListeners();
    initIdleDetection();
    showInitialHome();
    initMiniSlideshow();
    
    // Initialize floor selector (will be hidden by showInitialHome)
    changeFloor(0);
    
    // Ensure floor selector is hidden on init
    if (elements.mapFloorSelectorCompact) {
        elements.mapFloorSelectorCompact.style.display = 'none';
    }
    
    // Load locations from API
    console.log('📥 Loading locations from API...');
    await loadLocations();
    
    // Note: Panel is set to right by default in HTML (panel-right class)
    // Keyboard will be rendered when search tab opens
    console.log('✅ Initialization complete. Kiosk location set as start point. Panel position: right (default)');
    
    // Notify parent that route frame is ready (if in iframe)
    if (window.parent && window.parent !== window) {
        sendToParent('ROUTE_READY', {});
    }
}

// ==================== PARENT COMMUNICATION ====================

// Parent frame'e navigation hazır mesajı gönder
function notifyParentReady() {
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'NAVIGATION_READY' }, '*');
        console.log('📤 Parent\'a NAVIGATION_READY mesajı gönderildi');
    }
}

// Ana sayfa/back butonuna parent mesajı ekle
function setupParentCommunication() {
    const mapBackBtn = document.getElementById('mapBackBtn');
    
    if (mapBackBtn) {
        // Orijinal click listener'ı koruyarak yeni bir ekle
        mapBackBtn.addEventListener('click', () => {
            console.log('🏠 Ana Sayfa butonuna tıklandı');
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'BACK_TO_HOME' }, '*');
                console.log('📤 Parent\'a BACK_TO_HOME mesajı gönderildi');
            }
        });
    }
}

// Parent'dan gelen mesajları dinle
window.addEventListener('message', (event) => {
    const { type, data } = event.data || {};
    
    switch (type) {
        case 'ACTIVATE':
            // Navigation aktif olduğunda
            console.log('✅ Navigation aktif edildi');
            // Burada gerekirse state reset veya refresh yapılabilir
            break;
            
        case 'INIT':
            console.log('✅ Parent\'dan INIT mesajı alındı', data);
            break;
            
        default:
            break;
    }
});

// ==================== STORE DETAIL IN SEARCH TAB ====================
function showStoreDetailInSearchTab(location) {
    console.log('🏪 Showing store detail in search tab for:', location.name);
    
    const searchContent = document.getElementById('searchContent');
    const storeDetailContent = document.getElementById('storeDetailContent');
    
    if (!searchContent || !storeDetailContent) return;
    
    // Hide search content, show store detail
    searchContent.classList.add('hidden');
    storeDetailContent.classList.remove('hidden');
    storeDetailContent.classList.add('active');
    
    // Populate store detail content
    const storeFloorMap = document.getElementById('storeFloorMap');
    const storeLogoIcon = document.getElementById('storeLogoIcon');
    const storeName = document.getElementById('storeName');
    const storeFloor = document.getElementById('storeFloor');
    const storeHoursChip = document.getElementById('storeHoursChip');
    const storeTags = document.getElementById('storeTags');
    const storeDescription = document.getElementById('storeDescription');
    const storeQRCode = document.getElementById('storeQRCode');
    const storePhoneNumber = document.getElementById('storePhoneNumber');
    const storePhoneBtn = document.getElementById('storePhoneBtn');
    
    // Set floor map
    if (storeFloorMap) {
        storeFloorMap.src = `floors/${state.currentFloor}.svg`;
    }
    
    // Set logo icon
    if (storeLogoIcon) {
        if (location.logo) {
            storeLogoIcon.innerHTML = `<img src="${location.logo}" alt="${location.name}">`;
        } else {
            storeLogoIcon.textContent = location.icon || '🏪';
        }
    }
    
    // Set store name
    if (storeName) storeName.textContent = location.name;
    
    // Set floor info with Zorlu Center
    if (storeFloor) storeFloor.textContent = `${location.floor} • Zorlu Center`;
    
    // Set opening hours
    if (storeHoursChip) {
        const hours = location.hours || 'Mon-Sun • 10:00-22:00';
        const hoursSpan = storeHoursChip.querySelector('span');
        if (hoursSpan) {
            hoursSpan.textContent = hours;
        }
    }
    
    // Set tags (from location's actual categories with display names)
    if (storeTags) {
        // Get display names for categories
        const displayNames = getCategoryDisplayNames(location.apiCategories);
        
        storeTags.innerHTML = displayNames.map(tag => 
            `<span class="store-tag">${tag}</span>`
        ).join('');
    }
    
    // Set description
    if (storeDescription) {
        storeDescription.textContent = location.description || 
            'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
    }
    
    // Generate QR code
    if (storeQRCode) {
        storeQRCode.src = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + 
            encodeURIComponent(`Store: ${location.name}\nFloor: ${location.floor}\nCategory: ${location.category}`);
    }
    
    // Set phone number
    if (storePhoneNumber && storePhoneBtn) {
        const phone = location.telephone || '+90 (555) 000-0000';
        storePhoneNumber.textContent = formatPhoneNumber(phone);
        storePhoneBtn.href = `tel:${phone.replace(/\D/g, '')}`;
        // Hide phone button if no phone number
        if (!location.telephone) {
            storePhoneBtn.style.display = 'none';
        } else {
            storePhoneBtn.style.display = 'flex';
        }
    }
    
    // Populate similar stores (same category)
    populateSimilarStores(location);
    
    // Setup event listeners
    setupStoreDetailEvents();
}

function populateSimilarStores(currentLocation) {
    const similarStoresContainer = document.getElementById('similarStores');
    if (!similarStoresContainer) return;
    
    // Find stores in the same category, excluding current location
    const similarStores = locations
        .filter(loc => 
            loc.id !== currentLocation.id && 
            loc.type === currentLocation.type
        )
        .slice(0, 3); // Get max 3 similar stores
    
    // Clear existing content
    similarStoresContainer.innerHTML = '';
    
    // If we have similar stores, populate them
    if (similarStores.length > 0) {
        // Add similar stores
        similarStores.forEach(store => {
            const storeItem = document.createElement('div');
            storeItem.className = 'similar-store-item';
            storeItem.dataset.storeId = store.id;
            
            // Show logo if available, otherwise show name only
            if (store.logo) {
                storeItem.innerHTML = `
                    <img src="${store.logo}" alt="${store.name}" class="similar-logo-img">
                `;
            } else {
                storeItem.innerHTML = `
                    <div class="similar-name-only">
                        <span class="similar-store-name">${store.name}</span>
                    </div>
                `;
            }
            
            // Add click event to show this store's detail
            storeItem.onclick = () => {
                console.log('🖱️ Similar store clicked (main detail), ID:', store.id, 'Name:', store.name);
                state.selectedLocation = store;
                state.endPoint = store;
                showStoreDetailInSearchTab(store);
            };
            
            similarStoresContainer.appendChild(storeItem);
        });
        
        // Add "More" button
        const moreItem = document.createElement('div');
        moreItem.className = 'similar-store-item similar-store-more';
        moreItem.innerHTML = `
            <span class="similar-icon-only">➕</span>
        `;
        
        // Click on "More" closes detail and shows category filtered list
        moreItem.onclick = () => {
            hideStoreDetailInSearchTab();
            selectCategory(currentLocation.type);
        };
        
        similarStoresContainer.appendChild(moreItem);
    } else {
        // If no similar stores found, show a message
        similarStoresContainer.innerHTML = `
            <div style="text-align: center; padding: 20px; color: rgba(255, 255, 255, 0.7);">
                <p style="margin: 0; font-size: clamp(10px, 0.85vw, 13px);">Benzer mağaza bulunamadı</p>
            </div>
        `;
    }
}

function hideStoreDetailInSearchTab() {
    const searchContent = document.getElementById('searchContent');
    const storeDetailContent = document.getElementById('storeDetailContent');
    
    if (!searchContent || !storeDetailContent) return;
    
    // Show search content, hide store detail
    storeDetailContent.classList.remove('active');
    storeDetailContent.classList.add('hidden');
    searchContent.classList.remove('hidden');
}

function setupStoreDetailEvents() {
    // Event listeners are now set up in initEventListeners()
    // This function is kept for future use if needed
    console.log('✅ Store detail events already set up in initEventListeners');
}

// ==================== MINI SLIDESHOW ====================
let miniSlideshowState = {
    currentIndex: 0,
    totalSlides: 3,
    autoPlayInterval: null
};

function initMiniSlideshow() {
    const miniFilmStrip = document.getElementById('miniFilmStrip');
    const miniIndicators = document.querySelectorAll('.mini-indicator');
    
    if (!miniFilmStrip || miniIndicators.length === 0) return;
    
    // Set up indicator click events
    miniIndicators.forEach((indicator, index) => {
        indicator.addEventListener('click', () => {
            goToMiniSlide(index);
            // Reset auto-play timer when user manually changes slide
            if (miniSlideshowState.autoPlayInterval) {
                clearInterval(miniSlideshowState.autoPlayInterval);
                startMiniAutoPlay();
            }
        });
    });
    
    // Start auto-play
    startMiniAutoPlay();
}

function showMiniSlideshow() {
    const miniSlideshow = document.getElementById('homeMiniSlideshow');
    if (miniSlideshow) {
        miniSlideshow.classList.remove('hidden');
        startMiniAutoPlay();
    }
}

function hideMiniSlideshow() {
    const miniSlideshow = document.getElementById('homeMiniSlideshow');
    if (miniSlideshow) {
        miniSlideshow.classList.add('hidden');
        stopMiniAutoPlay();
    }
}

function goToMiniSlide(index) {
    const miniFilmStrip = document.getElementById('miniFilmStrip');
    const miniIndicators = document.querySelectorAll('.mini-indicator');
    
    if (!miniFilmStrip) return;
    
    miniSlideshowState.currentIndex = index;
    
    // Move the film strip
    const offset = -index * 100;
    miniFilmStrip.style.transform = `translateX(${offset}%)`;
    
    // Update indicators
    miniIndicators.forEach((indicator, i) => {
        if (i === index) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    });
}

function nextMiniSlide() {
    const nextIndex = (miniSlideshowState.currentIndex + 1) % miniSlideshowState.totalSlides;
    goToMiniSlide(nextIndex);
}

function startMiniAutoPlay() {
    // Clear existing interval if any
    if (miniSlideshowState.autoPlayInterval) {
        clearInterval(miniSlideshowState.autoPlayInterval);
    }
    
    // Auto-advance every 4 seconds
    miniSlideshowState.autoPlayInterval = setInterval(() => {
        nextMiniSlide();
    }, 4000);
}

// Stop auto-play when search mode is active
function stopMiniAutoPlay() {
    if (miniSlideshowState.autoPlayInterval) {
        clearInterval(miniSlideshowState.autoPlayInterval);
        miniSlideshowState.autoPlayInterval = null;
    }
}

// ==================== START APPLICATION ====================
// Start application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        setupParentCommunication();
        
        // Sayfa tamamen yüklendiğinde parent'a bildir
        window.addEventListener('load', () => {
            notifyParentReady();
        });
    });
} else {
    init();
    setupParentCommunication();
    
    // Sayfa zaten yüklü, hemen bildir
    if (document.readyState === 'complete') {
        notifyParentReady();
    } else {
        window.addEventListener('load', () => {
            notifyParentReady();
        });
    }
}
