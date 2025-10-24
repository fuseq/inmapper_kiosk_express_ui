// ==================== STATE MANAGEMENT ====================
const state = {
    currentView: 'initial', // 'initial', 'search', 'route'
    searchQuery: '',
    selectedCategory: 'all',
    selectedLocation: null,
    startPoint: null,
    endPoint: null,
    editingPoint: 'start', // 'start' or 'end' - which point is being edited
    currentFloor: 0, // Current selected floor
    keyboardMode: 'letters', // 'letters' or 'numbers'
    routeType: 'normal', // 'normal' or 'accessible'
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
    sidePanelStartPoint: document.getElementById('sidePanelStartPoint'),
    sidePanelEndPoint: document.getElementById('sidePanelEndPoint'),
    sidePanelStartName: document.getElementById('sidePanelStartName'),
    sidePanelEndName: document.getElementById('sidePanelEndName'),
    sidePanelQRCode: document.getElementById('sidePanelQRCode'),
    sidePanelSearch: document.getElementById('sidePanelSearch'),
    sidePanelSearchClose: document.getElementById('sidePanelSearchClose'),
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
}

function showSearchTab() {
    state.currentView = 'search';
    
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
    // Reverse animation sequence
    elements.searchTab.classList.remove('open');
    
    setTimeout(() => {
        elements.initialHome.classList.remove('search-mode');
        elements.initialHome.classList.remove('animating');
        
        if (!state.selectedLocation) {
            state.currentView = 'initial';
        }
    }, 300);
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
        
        // Hide search tab
        hideSearchTab();
        
        // Show map with route if both points selected
        if (state.endPoint && state.startPoint) {
            showMapWithRoute();
        }
    }
}

function showMapWithRoute() {
    // Hide initial home
    elements.initialHome.style.opacity = '0';
    elements.initialHome.style.visibility = 'hidden';
    elements.initialHome.style.pointerEvents = 'none';
    
    // Show side panel
    if (elements.mapSidePanel) {
        elements.mapSidePanel.classList.remove('hidden');
    }
    
    // Update side panel
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
    
    state.currentView = 'map';
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

function generateQRCode() {
    if (!state.endPoint || !state.startPoint) return;
    
    const routeUrl = `https://zorlu.center/route?from=${state.startPoint.id}&to=${state.endPoint.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(routeUrl)}`;
    
    if (elements.sidePanelQRCode) {
        elements.sidePanelQRCode.src = qrUrl;
    }
}

function toggleSidePanel() {
    if (elements.mapSidePanel) {
        elements.mapSidePanel.classList.toggle('expanded');
    }
    if (elements.mapContainer) {
        elements.mapContainer.classList.toggle('panel-expanded');
    }
}

function closeSidePanel() {
    if (elements.mapSidePanel) {
        elements.mapSidePanel.classList.remove('expanded');
    }
    if (elements.mapContainer) {
        elements.mapContainer.classList.remove('panel-expanded');
    }
}

function loadSidePanelLocations() {
    const filteredLocations = state.selectedCategory === 'all' 
        ? locations 
        : locations.filter(loc => loc.type === state.selectedCategory);
    
    displaySidePanelLocations(filteredLocations);
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
        
        // Update dropdown active state
        document.querySelectorAll('.floor-dropdown-item').forEach(item => {
            item.classList.toggle('active', parseInt(item.dataset.floor) === floorId);
        });
        
        // Update map SVG
        const mapSvg = document.getElementById('floorMapSvg');
        if (mapSvg) {
            mapSvg.src = `floors/${floorId}.svg`;
            console.log('🗺️ Map updated to:', mapSvg.src);
        }
        
        // Update main floor selector buttons
        document.querySelectorAll('.floor-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.floor) === floorId);
        });
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
    } else {
        state.searchQuery += key.toLowerCase();
    }
    
    // Update search placeholder
    if (elements.searchPlaceholder) {
        if (state.searchQuery) {
            elements.searchPlaceholder.textContent = state.searchQuery;
            elements.searchPlaceholder.style.color = 'var(--text-primary)';
        } else {
            elements.searchPlaceholder.textContent = 'Nereye gitmek istersiniz?';
            elements.searchPlaceholder.style.color = 'var(--text-light)';
        }
    }
    
    // Auto search
    searchLocations(state.searchQuery);
}

function toggleKeyboardMode() {
    state.keyboardMode = state.keyboardMode === 'letters' ? 'numbers' : 'letters';
    renderInlineKeyboard();
}

function renderInlineKeyboard() {
    const keyboardContainer = document.querySelector('.inline-keyboard');
    if (!keyboardContainer) return;
    
    if (state.keyboardMode === 'letters') {
        keyboardContainer.innerHTML = `
            <div class="keyboard-row">
                <button class="inline-key" data-key="Q">Q</button>
                <button class="inline-key" data-key="W">W</button>
                <button class="inline-key" data-key="E">E</button>
                <button class="inline-key" data-key="R">R</button>
                <button class="inline-key" data-key="T">T</button>
                <button class="inline-key" data-key="Y">Y</button>
                <button class="inline-key" data-key="U">U</button>
                <button class="inline-key" data-key="I">I</button>
                <button class="inline-key" data-key="O">O</button>
                <button class="inline-key" data-key="P">P</button>
            </div>
            <div class="keyboard-row">
                <button class="inline-key" data-key="A">A</button>
                <button class="inline-key" data-key="S">S</button>
                <button class="inline-key" data-key="D">D</button>
                <button class="inline-key" data-key="F">F</button>
                <button class="inline-key" data-key="G">G</button>
                <button class="inline-key" data-key="H">H</button>
                <button class="inline-key" data-key="J">J</button>
                <button class="inline-key" data-key="K">K</button>
                <button class="inline-key" data-key="L">L</button>
            </div>
            <div class="keyboard-row">
                <button class="inline-key special" data-key="123">123</button>
                <button class="inline-key" data-key="Z">Z</button>
                <button class="inline-key" data-key="X">X</button>
                <button class="inline-key" data-key="C">C</button>
                <button class="inline-key" data-key="V">V</button>
                <button class="inline-key" data-key="B">B</button>
                <button class="inline-key" data-key="N">N</button>
                <button class="inline-key" data-key="M">M</button>
                <button class="inline-key special" data-key="Backspace">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M21 4H9L3 12L9 20H21C21.5523 20 22 19.5523 22 19V5C22 4.44772 21.5523 4 21 4Z" stroke="currentColor" stroke-width="2"/>
                        <path d="M17 9L11 15M11 9L17 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `;
    } else {
        keyboardContainer.innerHTML = `
            <div class="keyboard-row">
                <button class="inline-key" data-key="1">1</button>
                <button class="inline-key" data-key="2">2</button>
                <button class="inline-key" data-key="3">3</button>
                <button class="inline-key" data-key="4">4</button>
                <button class="inline-key" data-key="5">5</button>
                <button class="inline-key" data-key="6">6</button>
                <button class="inline-key" data-key="7">7</button>
                <button class="inline-key" data-key="8">8</button>
                <button class="inline-key" data-key="9">9</button>
                <button class="inline-key" data-key="0">0</button>
            </div>
            <div class="keyboard-row">
                <button class="inline-key" data-key="-">-</button>
                <button class="inline-key" data-key="/">/</button>
                <button class="inline-key" data-key=":">:</button>
                <button class="inline-key" data-key=";">;</button>
                <button class="inline-key" data-key="(">(</button>
                <button class="inline-key" data-key=")">)</button>
                <button class="inline-key" data-key="₺">₺</button>
                <button class="inline-key" data-key="&">&</button>
                <button class="inline-key" data-key="@">@</button>
            </div>
            <div class="keyboard-row">
                <button class="inline-key special" data-key="ABC">ABC</button>
                <button class="inline-key" data-key=".">.</button>
                <button class="inline-key" data-key=",">,</button>
                <button class="inline-key" data-key="?">?</button>
                <button class="inline-key" data-key="!">!</button>
                <button class="inline-key" data-key="'">'</button>
                <button class="inline-key" data-key='"'>"</button>
                <button class="inline-key" data-key=" ">Space</button>
                <button class="inline-key special" data-key="Backspace">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M21 4H9L3 12L9 20H21C21.5523 20 22 19.5523 22 19V5C22 4.44772 21.5523 4 21 4Z" stroke="currentColor" stroke-width="2"/>
                        <path d="M17 9L11 15M11 9L17 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        `;
    }
    
    // Re-attach event listeners
    attachInlineKeyboardListeners();
}

function attachInlineKeyboardListeners() {
    const inlineKeys = document.querySelectorAll('.inline-key');
    inlineKeys.forEach(key => {
        key.addEventListener('click', () => {
            const keyValue = key.dataset.key;
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
    
        // Floor selector compact - arrows
    if (elements.floorUpBtn) {
        console.log('✅ Floor Up button found');
        elements.floorUpBtn.addEventListener('click', (e) => {
            console.log('👆 Floor Up clicked');
            e.stopPropagation();
            goToNextFloor();
        });
    } else {
        console.error('❌ Floor Up button not found');
    }
    
    if (elements.floorDownBtn) {
        console.log('✅ Floor Down button found');
        elements.floorDownBtn.addEventListener('click', (e) => {
            console.log('👇 Floor Down clicked');
            e.stopPropagation();
            goToPreviousFloor();
        });
    } else {
        console.error('❌ Floor Down button not found');
    }
    
    // Floor selector compact - display button (toggle dropdown)
    if (elements.floorDisplayBtn) {
        console.log('✅ Floor Display button found');
        elements.floorDisplayBtn.addEventListener('click', (e) => {
            console.log('👆 Floor Display clicked');
            e.stopPropagation();
            toggleFloorDropdown();
        });
    } else {
        console.error('❌ Floor Display button not found');
    }
    
    // Floor dropdown items
    document.querySelectorAll('.floor-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const floorId = parseInt(item.dataset.floor);
            console.log('🎯 Dropdown item clicked:', floorId);
            changeFloor(floorId);
            closeFloorDropdown();
        });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (elements.floorSelectorCompact && !elements.floorSelectorCompact.contains(e.target)) {
            closeFloorDropdown();
        }
    });
    
    console.log('🏫 Floor selector initialized with', floors.length, 'floors');
    
    // Language switcher
    document.querySelectorAll('.lang-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.lang-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
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
        closeSidePanel();
        
        // Hide side panel
        if (elements.mapSidePanel) {
            elements.mapSidePanel.classList.add('hidden');
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
    
        // Initialize floor selector
    changeFloor(0);
    
    // Initialize keyboard
    renderInlineKeyboard();
}

// Start application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
