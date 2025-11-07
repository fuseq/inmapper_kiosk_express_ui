// ==================== STATE MANAGEMENT ====================
const state = {
    currentView: 'initial', // 'initial', 'search', 'route'
    searchQuery: '',
    sidePanelSearchQuery: '', // Search query for side panel
    selectedCategory: 'all',
    selectedLocation: null,
    startPoint: null,
    endPoint: null,
    editingPoint: 'start', // 'start' or 'end' - which point is being edited
    currentFloor: 0, // Current selected floor
    keyboardLanguage: 'tr', // 'tr', 'en', 'zh', 'ar'
    keyboardMode: 'letters', // 'letters' or 'numbers'
    routeType: 'normal', // 'normal' or 'accessible'
    panelSide: 'right', // 'left' or 'right' - which side the panel is on (default: right)
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
const floors = [
    { id: 2, name: '2. Kat', number: '2' },
    { id: 1, name: '1. Kat', number: '1' },
    { id: 0, name: 'Zemin Kat', number: '0' },
    { id: -1, name: 'Bodrum 1', number: '-1' },
    { id: -2, name: 'Bodrum 2', number: '-2' },
];

// ==================== MOCK DATA ====================
const locations = [
    { id: 1, name: 'Zara', category: 'Alışveriş', floor: 'Zemin Kat', type: 'shopping', icon: '🛍️' },
    { id: 2, name: 'H&M', category: 'Alışveriş', floor: 'Zemin Kat', type: 'shopping', icon: '👕' },
    { id: 3, name: 'Starbucks', category: 'Kafe', floor: '1. Kat', type: 'coffee', icon: '☕' },
    { id: 4, name: 'Mado', category: 'Kafe', floor: '1. Kat', type: 'coffee', icon: '🍰' },
    { id: 5, name: 'Cinemaximum', category: 'Eğlence', floor: 'Sinema Katı', type: 'entertainment', icon: '🎬' },
    { id: 6, name: 'Nike', category: 'Alışveriş', floor: '1. Kat', type: 'shopping', icon: '👟' },
    { id: 7, name: 'Apple Store', category: 'Alışveriş', floor: 'Zemin Kat', type: 'shopping', icon: '📱' },
    { id: 8, name: 'Burger King', category: 'Yemek', floor: '2. Kat', type: 'food', icon: '🍔' },
    { id: 9, name: 'KFC', category: 'Yemek', floor: '2. Kat', type: 'food', icon: '🍗' },
    { id: 10, name: 'Tuvalet (Zemin)', category: 'Tuvalet', floor: 'Zemin Kat', type: 'wc', icon: '🚻' },
    { id: 11, name: 'ATM', category: 'ATM', floor: 'Zemin Kat', type: 'atm', icon: '💰' },
    { id: 12, name: 'Otopark', category: 'Otopark', floor: '-2. Kat', type: 'parking', icon: '🅿️' },
];

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
    sidePanelStartPoint: document.getElementById('sidePanelStartPoint'),
    sidePanelEndPoint: document.getElementById('sidePanelEndPoint'),
    sidePanelStartName: document.getElementById('sidePanelStartName'),
    sidePanelEndName: document.getElementById('sidePanelEndName'),
    sidePanelQRCode: document.getElementById('sidePanelQRCode'),
    sidePanelSearch: document.getElementById('sidePanelSearch'),
    sidePanelSearchClose: document.getElementById('sidePanelSearchClose'),
    sidePanelSearchInput: document.getElementById('sidePanelSearchInput'),
    sidePanelSearchClear: document.getElementById('sidePanelSearchClear'),
    sidePanelResults: document.getElementById('sidePanelResults'),
    mapContainer: document.getElementById('mapContainer'),
    sidePanelStartFloor: document.getElementById('sidePanelStartFloor'),
    sidePanelEndFloor: document.getElementById('sidePanelEndFloor'),
    routeSwapBtn: document.getElementById('routeSwapBtn'),
    routeTypeNormal: document.getElementById('routeTypeNormal'),
    routeTypeAccessible: document.getElementById('routeTypeAccessible'),
    
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
};

// ==================== VIEW MANAGEMENT ====================
function showInitialHome() {
    state.currentView = 'initial';
    elements.initialHome.style.opacity = '1';
    elements.initialHome.style.visibility = 'visible';
    elements.initialHome.style.pointerEvents = 'auto';
    elements.initialHome.classList.remove('search-mode');
    elements.searchTab.classList.remove('open');
    elements.routeInfoOverlay.classList.remove('visible');
    
    // Hide floor selector on home screen
    if (elements.mapFloorSelectorCompact) {
        elements.mapFloorSelectorCompact.style.display = 'none';
    }
}

function showSearchTab() {
    state.currentView = 'search';
    
    // Hide floor selector during search
    if (elements.mapFloorSelectorCompact) {
        elements.mapFloorSelectorCompact.style.display = 'none';
    }
    
    // Step 1: Add animating class to keep logo/button visible during animation
    elements.initialHome.classList.add('animating');
    
    // Step 2: Start logo and button fade out (0.4s)
    setTimeout(() => {
        elements.initialHome.classList.add('search-mode');
    }, 50);
    
    // Step 3: After logo/button fade, expand search bar (0.7s)
    // Logo/button fade: 0.4s, then search bar expands
    
    // Step 4: After search bar expansion, show panel (0.6s)
    // Total: 0.4s (fade) + 0.7s (expand) = 1.1s, panel starts at 0.5s into expansion
    setTimeout(() => {
        elements.searchTab.classList.add('open');
        loadAllLocations();
        
        // Render keyboard after panel is visible
        setTimeout(() => {
            console.log('🎹 Rendering keyboard after panel opened');
            renderInlineKeyboard();
        }, 100);
        
        // Remove animating class after all animations
        setTimeout(() => {
            elements.initialHome.classList.remove('animating');
        }, 700);
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
    
    // Reverse animation sequence (opposite of showSearchTab)
    
    // Step 1: Close search panel (scale down) - 600ms
    console.log('📉 Closing panel...');
    elements.searchTab.classList.remove('open');
    
    // Step 2: After panel closes, shrink search bar - 700ms
    setTimeout(() => {
        console.log('🔽 Shrinking search bar...');
        elements.initialHome.classList.remove('search-mode');
        
        // Step 3: After search bar shrinks, fade in logo and explore button - 400ms
        setTimeout(() => {
            console.log('✨ Fading in home elements...');
            elements.initialHome.classList.remove('animating');
            
            if (!state.selectedLocation) {
                state.currentView = 'initial';
            }
            console.log('✅ Search tab fully hidden');
        }, 700); // search bar shrink animation time
        
    }, 600); // panel close animation time
}

// ==================== SEARCH FUNCTIONALITY ====================
function loadAllLocations() {
    const filteredLocations = state.selectedCategory === 'all' 
        ? locations 
        : locations.filter(loc => loc.type === state.selectedCategory);
    
    displayLocations(filteredLocations);
}

function searchLocations(query) {
    let results = locations;
    
    if (query && query.trim() !== '') {
        results = locations.filter(loc => 
            loc.name.toLowerCase().includes(query.toLowerCase()) ||
            loc.category.toLowerCase().includes(query.toLowerCase())
        );
    }
    
    if (state.selectedCategory !== 'all') {
        results = results.filter(loc => loc.type === state.selectedCategory);
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
            <div class="location-icon-wrapper">Z</div>
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
            const locationId = parseInt(item.dataset.id);
            selectLocation(locationId);
        });
    });
}

function selectLocation(locationId) {
    const location = locations.find(loc => loc.id === locationId);
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
        
        // Show map with route if both points selected
        if (state.endPoint && state.startPoint) {
            // Smooth transition sequence
            transitionToMapView();
        }
    }
}

function transitionToMapView() {
    console.log('🎬 Starting transition to map view...');
    
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
            
            // Update side panel data
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
            
            // Generate QR code
            generateQRCode();
            
            // Show side panel
            if (elements.mapSidePanel) {
                elements.mapSidePanel.classList.remove('hidden');
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
        elements.routeTypeNormal.classList.toggle('active', type === 'normal');
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
    } else if (key === '123' || key === 'ABC') {
        toggleKeyboardMode();
        renderSideKeyboard();
        return;
    } else if (key.startsWith('LANG_')) {
        const lang = key.replace('LANG_', '');
        changeKeyboardLanguage(lang);
        renderSideKeyboard();
        return;
    } else if (key === 'Space') {
        state.sidePanelSearchQuery += ' ';
    } else {
        // For Arabic and Chinese, don't convert to lowercase
        if (state.keyboardLanguage === 'ar' || state.keyboardLanguage === 'zh') {
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
    
    console.log('🎹 Rendering side keyboard - Language:', state.keyboardLanguage, 'Mode:', state.keyboardMode);
    
    let html = '';
    
    if (state.keyboardMode === 'letters') {
        const layout = keyboardLayouts[state.keyboardLanguage];
        const isRTL = layout.rtl || false;
        const hasDualKeys = layout.hasDualKeys || false;
        
        // First row
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
        
        // Second row
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
        
        // Third row
        html += `<div class="keyboard-row ${isRTL ? 'rtl' : ''}">`;
        html += '<button class="inline-key special" data-key="123">123</button>';
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
        
    } else {
        const numbers = keyboardLayouts.numbers;
        
        // First row - numbers
        html += '<div class="keyboard-row">';
        numbers[0].forEach(key => {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        });
        html += '</div>';
        
        // Second row - symbols
        html += '<div class="keyboard-row">';
        numbers[1].forEach(key => {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        });
        html += '</div>';
        
        // Third row
        html += '<div class="keyboard-row">';
        html += '<button class="inline-key special" data-key="ABC">ABC</button>';
        numbers[2].forEach(key => {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
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
    }
    
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
        
    } else {
        console.error('❌ Floor not found:', floorId);
    }
}

function goToNextFloor() {
    console.log('⬆️ Go to next floor');
    const currentIndex = floors.findIndex(f => f.id === state.currentFloor);
    console.log('Current index:', currentIndex);
    if (currentIndex > 0) {
        changeFloor(floors[currentIndex - 1].id);
    } else {
        console.log('Already at top floor');
    }
}

function goToPreviousFloor() {
    console.log('⬇️ Go to previous floor');
    const currentIndex = floors.findIndex(f => f.id === state.currentFloor);
    console.log('Current index:', currentIndex);
    if (currentIndex < floors.length - 1) {
        changeFloor(floors[currentIndex + 1].id);
    } else {
        console.log('Already at bottom floor');
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
    
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
    });
    
    // Clear search query when category changes
    state.searchQuery = '';
    elements.searchPlaceholder.textContent = 'Nereye gitmek istersiniz?';
    elements.searchPlaceholder.style.color = 'var(--text-light)';
    
    loadAllLocations();
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
    loadAllLocations();
}

function handleInlineKeyPress(key) {
    if (key === 'Backspace') {
        state.searchQuery = state.searchQuery.slice(0, -1);
    } else if (key === '123') {
        toggleKeyboardMode();
        return;
    } else if (key === 'ABC') {
        toggleKeyboardMode();
        return;
    } else if (key.startsWith('LANG_')) {
        const lang = key.replace('LANG_', '');
        changeKeyboardLanguage(lang);
        return;
    } else if (key === 'Space') {
        state.searchQuery += ' ';
    } else {
        // For Arabic and Chinese, don't convert to lowercase
        if (state.keyboardLanguage === 'ar' || state.keyboardLanguage === 'zh') {
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
            elements.searchPlaceholder.style.color = 'var(--text-primary)';
            console.log('🖊️ Updated text:', state.searchQuery, 'RTL:', isRTL);
        } else {
            elements.searchPlaceholder.textContent = getPlaceholderText();
            elements.searchPlaceholder.style.color = 'var(--text-light)';
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
    
    console.log('🎹 Rendering keyboard - Language:', state.keyboardLanguage, 'Mode:', state.keyboardMode);
    
    let html = '';
    
    // Language selector row removed - now using top bar TR/EN toggle
    
        if (state.keyboardMode === 'letters') {
        const layout = keyboardLayouts[state.keyboardLanguage];
        const isRTL = layout.rtl || false;
        const hasDualKeys = layout.hasDualKeys || false;
        
        // First row
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
        
        // Second row
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
        
        // Third row
        html += `<div class="keyboard-row ${isRTL ? 'rtl' : ''}">`;
        html += '<button class="inline-key special" data-key="123">123</button>';
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
        
    } else {
        const numbers = keyboardLayouts.numbers;
        
        // First row - numbers
        html += '<div class="keyboard-row">';
        numbers[0].forEach(key => {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        });
        html += '</div>';
        
        // Second row - symbols
        html += '<div class="keyboard-row">';
        numbers[1].forEach(key => {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
        });
        html += '</div>';
        
        // Third row
        html += '<div class="keyboard-row">';
        html += '<button class="inline-key special" data-key="ABC">ABC</button>';
        numbers[2].forEach(key => {
            html += `<button class="inline-key" data-key="${key}">${key}</button>`;
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
    }
    
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
    document.getElementById('currentTime').textContent = `${hours}:${minutes}`;
    
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    
    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const date = now.getDate();
    
    document.getElementById('currentDate').textContent = `${dayName}, ${monthName} ${date}`;
}

// ==================== EVENT LISTENERS ====================
function initEventListeners() {
    // Home search trigger
    elements.homeSearchTrigger.addEventListener('click', () => {
        showSearchTab();
    });
    
        // Route point selectors
    if (elements.startPointSelector) {
        elements.startPointSelector.addEventListener('click', () => {
            selectEditingPoint('start');
            showSearchTab();
        });
    }
    
    if (elements.endPointSelector) {
        elements.endPointSelector.addEventListener('click', () => {
            selectEditingPoint('end');
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
            
            // Show floor selector on map view
            if (elements.mapFloorSelectorCompact) {
                elements.mapFloorSelectorCompact.style.display = 'flex';
            }
        });
    }
    
    // Map back button
    if (elements.mapBackBtn) {
        elements.mapBackBtn.addEventListener('click', () => {
            showInitialHome();
        });
    }
    
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
    
    // Category tabs
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            selectCategory(tab.dataset.category);
        });
    });
    
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
    
            // Side panel point selectors
    if (elements.sidePanelStartPoint) {
        elements.sidePanelStartPoint.addEventListener('click', () => {
            state.editingPoint = 'start';
            toggleSidePanel();
            loadSidePanelLocations();
        });
    }
    
    if (elements.sidePanelEndPoint) {
        elements.sidePanelEndPoint.addEventListener('click', () => {
            state.editingPoint = 'end';
            toggleSidePanel();
            loadSidePanelLocations();
        });
    }
    
    // Side panel search close
    if (elements.sidePanelSearchClose) {
        elements.sidePanelSearchClose.addEventListener('click', () => {
            closeSidePanel();
        });
    }
    
    // Side panel search input
    if (elements.sidePanelSearchInput) {
        // Show keyboard on click/focus
        elements.sidePanelSearchInput.addEventListener('click', () => {
            showSideKeyboard();
        });
        
        elements.sidePanelSearchInput.addEventListener('focus', () => {
            showSideKeyboard();
        });
        
        elements.sidePanelSearchInput.addEventListener('input', (e) => {
            state.sidePanelSearchQuery = e.target.value;
            loadSidePanelLocations();
            
            // Show/hide clear button
            if (elements.sidePanelSearchClear) {
                elements.sidePanelSearchClear.classList.toggle('visible', state.sidePanelSearchQuery.length > 0);
            }
        });
    }
    
    // Side panel search clear
    if (elements.sidePanelSearchClear) {
        elements.sidePanelSearchClear.addEventListener('click', () => {
            clearSidePanelSearch();
        });
    }
    
    // Side panel category filters
    document.querySelectorAll('.side-category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.side-category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.selectedCategory = btn.dataset.category;
            loadSidePanelLocations();
        });
    });
    
    // Route swap button
    if (elements.routeSwapBtn) {
        elements.routeSwapBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            swapRoutePoints();
        });
    }
    
    // Route type buttons
    if (elements.routeTypeNormal) {
        elements.routeTypeNormal.addEventListener('click', () => {
            changeRouteType('normal');
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
    
    document.querySelectorAll('.floor-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const floorId = parseInt(item.dataset.floor);
            changeFloor(floorId);
            closeFloorDropdown();
        });
    });
    
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
    
    // Map floor dropdown items
    document.querySelectorAll('.map-floor-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const floorId = parseInt(item.dataset.floor);
            changeFloor(floorId);
            closeMapFloorDropdown();
        });
    });
    
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
        state.startPoint = null;
        state.endPoint = null;
        state.editingPoint = 'start';
        state.currentFloor = 0;
        state.panelSide = 'right';
        
        // Reset displays
        if (elements.startPointDisplay) elements.startPointDisplay.textContent = 'Seçiniz';
        if (elements.endPointDisplay) elements.endPointDisplay.textContent = 'Seçiniz';
        if (elements.sidePanelStartName) elements.sidePanelStartName.textContent = 'Seçiniz';
        if (elements.sidePanelEndName) elements.sidePanelEndName.textContent = 'Seçiniz';
        
        // Reset active state
        if (elements.startPointSelector) elements.startPointSelector.classList.add('active');
        if (elements.endPointSelector) elements.endPointSelector.classList.remove('active');
        
        hideKeyboard();
        hideQRCode();
        closeFloorDropdown();
        closeMapFloorDropdown();
        closeSidePanel();
        
        // Hide side panel and search
        if (elements.mapSidePanel) {
            elements.mapSidePanel.classList.add('hidden');
            elements.mapSidePanel.classList.remove('expanded');
            elements.mapSidePanel.classList.add('panel-right'); // Reset to default right position
        }
        if (elements.mapContainer) {
            elements.mapContainer.classList.add('panel-right'); // Reset to default right position
        }
        if (elements.panelToggleBtnTop) {
            elements.panelToggleBtnTop.classList.add('panel-right'); // Reset to default right position
        }
        if (elements.sidePanelSearch) {
            elements.sidePanelSearch.style.display = 'none';
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
function init() {
    console.log('🚀 Zorlu Center Kiosk V2 Initialized');
    
    updateClock();
    setInterval(updateClock, 1000);
    
    initEventListeners();
    initIdleDetection();
    showInitialHome();
    
    // Initialize floor selector (will be hidden by showInitialHome)
    changeFloor(0);
    
    // Ensure floor selector is hidden on init
    if (elements.mapFloorSelectorCompact) {
        elements.mapFloorSelectorCompact.style.display = 'none';
    }
    
    // Note: Panel is set to right by default in HTML (panel-right class)
    // Keyboard will be rendered when search tab opens
    console.log('✅ Initialization complete. Panel position: right (default)');
}

// Start application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
