// ==================== STATE MANAGEMENT ====================
const state = {
    currentView: 'initial', // 'initial', 'search', 'route'
    searchQuery: '',
    selectedCategory: 'all',
    selectedLocation: null,
    startPoint: { id: 0, name: 'Giriş', floor: 'Zemin Kat' },
    endPoint: null,
};

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
    
    searchTab: document.getElementById('searchTab'),
    tabBackBtn: document.getElementById('tabBackBtn'),
    tabSearchInput: document.getElementById('tabSearchInput'),
    tabClearBtn: document.getElementById('tabClearBtn'),
    tabResults: document.getElementById('tabResults'),
    
    mapPanel: document.getElementById('mapPanel'),
    routeInfoOverlay: document.getElementById('routeInfoOverlay'),
    startNavigationBtn: document.getElementById('startNavigationBtn'),
    startPointText: document.getElementById('startPointText'),
    endPointText: document.getElementById('endPointText'),
    
    qrModal: document.getElementById('qrModal'),
    qrCloseBtn: document.getElementById('qrCloseBtn'),
    qrCodeImage: document.getElementById('qrCodeImage'),
    
    keyboard: document.getElementById('keyboard'),
    keyboardDisplay: document.getElementById('keyboardDisplay'),
};

// ==================== VIEW MANAGEMENT ====================
function showInitialHome() {
    state.currentView = 'initial';
    elements.initialHome.classList.remove('search-mode');
    elements.searchTab.classList.remove('open');
    elements.routeInfoOverlay.classList.remove('visible');
}

function showSearchTab() {
    state.currentView = 'search';
    elements.initialHome.classList.add('search-mode');
    elements.searchTab.classList.add('open');
    loadAllLocations();
    
    // Focus on search after animation
    setTimeout(() => {
        elements.tabSearchInput.focus();
    }, 400);
}

function hideSearchTab() {
    elements.searchTab.classList.remove('open');
    elements.initialHome.classList.remove('search-mode');
    
    if (!state.selectedLocation) {
        state.currentView = 'initial';
    }
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
            <div class="location-icon-wrapper">${loc.icon}</div>
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
    state.endPoint = location;
    
    // Hide search tab
    hideSearchTab();
    
    // Show route info
    elements.endPointText.textContent = location.name;
    elements.startNavigationBtn.disabled = false;
    elements.routeInfoOverlay.classList.add('visible');
}

// ==================== CATEGORY FILTERING ====================
function selectCategory(category) {
    state.selectedCategory = category;
    
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
    });
    
    loadAllLocations();
}

// ==================== KEYBOARD ====================
function showKeyboard() {
    elements.keyboard.classList.remove('hidden');
    elements.keyboardDisplay.value = state.searchQuery;
}

function hideKeyboard() {
    elements.keyboard.classList.add('hidden');
}

function handleKeyPress(key) {
    if (key === 'Backspace') {
        state.searchQuery = state.searchQuery.slice(0, -1);
    } else {
        state.searchQuery += key;
    }
    
    elements.tabSearchInput.value = state.searchQuery;
    elements.keyboardDisplay.value = state.searchQuery;
    
    // Show/hide clear button
    elements.tabClearBtn.classList.toggle('visible', state.searchQuery.length > 0);
    
    // Auto search
    searchLocations(state.searchQuery);
}

function clearSearch() {
    state.searchQuery = '';
    elements.tabSearchInput.value = '';
    elements.keyboardDisplay.value = '';
    elements.tabClearBtn.classList.remove('visible');
    loadAllLocations();
}

// ==================== QR CODE ====================
function showQRCode() {
    if (!state.endPoint) return;
    
    const routeUrl = `https://zorlu.center/route?from=${state.startPoint.id}&to=${state.endPoint.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(routeUrl)}`;
    
    elements.qrCodeImage.src = qrUrl;
    elements.qrModal.classList.add('active');
}

function hideQRCode() {
    elements.qrModal.classList.remove('active');
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
    
    // Explore map button
    elements.exploreMapBtn.addEventListener('click', () => {
        elements.initialHome.classList.remove('active');
    });
    
    // Tab back button
    elements.tabBackBtn.addEventListener('click', () => {
        hideSearchTab();
    });
    
    // Search input
    elements.tabSearchInput.addEventListener('click', () => {
        showKeyboard();
    });
    
    elements.tabSearchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        searchLocations(state.searchQuery);
        elements.tabClearBtn.classList.toggle('visible', state.searchQuery.length > 0);
    });
    
    // Clear button
    elements.tabClearBtn.addEventListener('click', () => {
        clearSearch();
    });
    
    // Category tabs
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            selectCategory(tab.dataset.category);
        });
    });
    
    // Keyboard keys
    document.querySelectorAll('.key').forEach(key => {
        key.addEventListener('click', () => {
            handleKeyPress(key.dataset.key);
        });
    });
    
    // Navigation button
    elements.startNavigationBtn.addEventListener('click', () => {
        showQRCode();
    });
    
    // QR close
    elements.qrCloseBtn.addEventListener('click', () => {
        hideQRCode();
    });
    
    elements.qrModal.addEventListener('click', (e) => {
        if (e.target === elements.qrModal) {
            hideQRCode();
        }
    });
    
    // Floor selector
    document.querySelectorAll('.floor-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.floor-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
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
        state.endPoint = null;
        hideKeyboard();
        hideQRCode();
        showInitialHome();
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
}

// Start application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
