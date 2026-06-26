// Main application file
import { 
    getAllItems, 
    filterItems, 
    getItemById, 
    getRelatedItems,
    getCategoryColor,
    categoryColors,
    loadDataFromSVG,
    loadDataFromGoogleSheets
} from './data.js';

import { SVGMapManager } from './svg-map.js';

// Application state
const state = {
    items: [],
    filteredItems: [],
    selectedItem: null,
    filters: {
        searchQuery: '',
        categories: [],
        selectedCategory: 'all'
    },
    ui: {
        sidebarOpen: true,
        detailsPanelOpen: false,
        editMode: false,
        successAlertTimeout: null,
        menus: {
            apps: false,
            user: false
        }
    },
    pendingRequests: new Set()
};

const userProfile = {
    email: 'furkansenoglu98@gmail.com',
    name: 'Furkan Şenoğlu',
    avatar: './public/placeholder-user.jpg'
};

// SVG Map instance
let svgMap = null;

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Floor Plan Viewer...');
    
    // Initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
    
    // Initialize Leaflet map first (it will load the SVG)
    await initializeMap();
    
    // Load data from SVG
    await loadData();
    
    // Setup event listeners
    setupEventListeners();
    
    console.log('Application initialized successfully!');
});

// Load data from SVG
async function loadData() {
    console.log('Loading data...');
    
    // STEP 1: Load Google Sheets data first
    const googleSheetsUrl = 'https://docs.google.com/spreadsheets/d/1yamc9GBq_27Lm69gaWuqDr2TLAQbW0TvHgKWNPkuw8w/edit?usp=sharing';
    
    console.log('📊 Loading Google Sheets data...');
    await loadDataFromGoogleSheets(googleSheetsUrl);
    
    // STEP 2: Load SVG and merge with Google Sheets data
    console.log('🗺️ Loading SVG and merging with Google Sheets data...');
    await loadDataFromSVG();
    
    // Get the loaded items
    state.items = getAllItems();
    state.filteredItems = [...state.items];
    
    console.log(`✅ Total loaded: ${state.items.length} items`);
    
    updateItemsList();
    updateItemCount();
    
    // Reload map with real data
    if (svgMap) {
        svgMap.loadItems(state.items);
    }
}

function setupHeaderMenus() {
    const appsBtn = document.getElementById('appsMenuBtn');
    const userBtn = document.getElementById('userMenuBtn');
    const appsMenu = document.getElementById('appsMenu');
    const userMenu = document.getElementById('userMenu');
    const closeUserMenuBtn = document.getElementById('closeUserMenuBtn');
    const userEmail = document.getElementById('userEmail');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');

    if (userEmail) userEmail.textContent = userProfile.email;
    if (userName) userName.textContent = userProfile.name;
    if (userAvatar) userAvatar.src = userProfile.avatar;
    if (userBtn) {
        const img = userBtn.querySelector('img');
        if (img) img.src = userProfile.avatar;
    }

    const toggleMenu = (type) => {
        const menu = type === 'apps' ? appsMenu : userMenu;
        const otherMenu = type === 'apps' ? userMenu : appsMenu;
        if (!menu) return;
        state.ui.menus[type] = !state.ui.menus[type];
        menu.style.display = state.ui.menus[type] ? 'block' : 'none';
        if (state.ui.menus[type] && otherMenu) {
            otherMenu.style.display = 'none';
            state.ui.menus[type === 'apps' ? 'user' : 'apps'] = false;
        }
    };

    appsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu('apps');
    });

    userBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu('user');
    });

    closeUserMenuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        state.ui.menus.user = false;
        if (userMenu) userMenu.style.display = 'none';
    });

    document.addEventListener('click', (e) => {
        if (appsMenu && !appsMenu.contains(e.target) && !appsBtn?.contains(e.target)) {
            state.ui.menus.apps = false;
            appsMenu.style.display = 'none';
        }
        if (userMenu && !userMenu.contains(e.target) && !userBtn?.contains(e.target)) {
            state.ui.menus.user = false;
            userMenu.style.display = 'none';
        }
    });

    const appItems = document.querySelectorAll('.apps-grid-item');
    appItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.dataset.target;
            console.log(`Navigating to ${target}`);
            state.ui.menus.apps = false;
            if (appsMenu) appsMenu.style.display = 'none';
        });
    });

    document.getElementById('manageAccountBtn')?.addEventListener('click', () => {
        alert('Hesap yönetimi yakında eklenecek.');
    });

    document.getElementById('signOutBtn')?.addEventListener('click', () => {
        alert('Oturum kapatma akışı yakında eklenecek.');
    });
}

// Initialize SVG map
async function initializeMap() {
    try {
        svgMap = new SVGMapManager('leafletMap');
        await svgMap.initialize();
        
        // Set item click callback
        svgMap.setItemClickCallback((item) => {
            showItemDetails(item.id);
        });
        
        // Load initial items after SVG is loaded
        svgMap.loadItems(state.items);
        
        console.log('SVG map initialized successfully');
    } catch (error) {
        console.error('Failed to initialize map:', error);
    }
}

// Setup all event listeners
function setupEventListeners() {
    // Sidebar toggle
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', toggleSidebar);
    }
    
    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }
    
    // Close details panel
    document.getElementById('closeDetailsBtn')?.addEventListener('click', closeDetailsPanel);
    
    // Category chips
    setupCategoryChips();

    // Suggest edit workflow
    setupSuggestEditUI();

    // Header menus
    setupHeaderMenus();
}

// Toggle sidebar
function toggleSidebar() {
    state.ui.sidebarOpen = !state.ui.sidebarOpen;
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}

// Handle search
function handleSearch(e) {
    state.filters.searchQuery = e.target.value;
    applyFilters();
}

// Setup category dropdown (Google Maps style)
function setupCategoryChips() {
    const dropdownBtn = document.getElementById('categoryDropdownBtn');
    const dropdownMenu = document.getElementById('categoryDropdownMenu');
    const dropdownGrid = document.getElementById('categoryDropdownGrid');
    const selectedText = document.getElementById('selectedCategoryText');
    
    // Populate categories dynamically
    populateCategoryDropdown();
    
    // Toggle dropdown
    dropdownBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dropdownMenu.style.display === 'block';
        dropdownMenu.style.display = isVisible ? 'none' : 'block';
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.category-dropdown-container')) {
            dropdownMenu.style.display = 'none';
        }
    });
    
    // Delegate event for category selection (since items are dynamic)
    dropdownGrid?.addEventListener('click', (e) => {
        const item = e.target.closest('.category-dropdown-item');
        if (!item) return;
        
        const category = item.dataset.category;
        const dropdownItems = document.querySelectorAll('.category-dropdown-item');
        
        // Remove active class from all items
        dropdownItems.forEach(i => i.classList.remove('active'));
        
        // Add active class to clicked item
        item.classList.add('active');
        
        // Update button text
        const itemText = item.textContent.trim();
        selectedText.textContent = itemText;
        
        // Update filter state
        state.filters.selectedCategory = category;
        
        if (category === 'all') {
            state.filters.categories = [];
            selectedText.textContent = 'Categories';
        } else {
            state.filters.categories = [category];
        }
        
        // Apply filters
        applyFilters();
        
        // Close dropdown
        dropdownMenu.style.display = 'none';
    });
}

// Populate category dropdown with dynamic colors from SVG
function populateCategoryDropdown() {
    const dropdownGrid = document.getElementById('categoryDropdownGrid');
    if (!dropdownGrid) return;
    
    // Category names mapping
    const categoryNames = {
        shop: 'Shops',
        bank: 'Banks',
        food: 'Food & Drink',
        building: 'Buildings',
        other: 'Other'
    };
    
    // Get available categories from loaded items
    const availableCategories = [...new Set(state.items.map(item => item.category))];
    
    // Create "All" button
    const allButton = document.createElement('button');
    allButton.className = 'category-dropdown-item active';
    allButton.dataset.category = 'all';
    allButton.innerHTML = '<span>All</span>';
    dropdownGrid.appendChild(allButton);
    
    // Create category buttons with colors from SVG
    availableCategories.forEach(category => {
        const color = getCategoryColor(category);
        const name = categoryNames[category] || category;
        
        const button = document.createElement('button');
        button.className = 'category-dropdown-item';
        button.dataset.category = category;
        button.innerHTML = `
            <span class="chip-dot" style="background-color: ${color};"></span>
            <span>${name}</span>
        `;
        
        dropdownGrid.appendChild(button);
    });
    
    console.log('📋 Category dropdown populated with colors:', categoryColors);
    
    // Also populate legend
    populateLegend(availableCategories, categoryNames);
}

// Populate map legend with dynamic colors
function populateLegend(categories, categoryNames) {
    const legendItems = document.getElementById('legendItems');
    if (!legendItems) return;
    
    legendItems.innerHTML = '';
    
    categories.forEach(category => {
        const color = getCategoryColor(category);
        const name = categoryNames[category] || category;
        
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <span class="legend-dot" style="background-color: ${color};"></span>
            <span>${name}</span>
        `;
        
        legendItems.appendChild(item);
    });
}

// Apply all filters
function applyFilters() {
    state.filteredItems = filterItems({
        categories: state.filters.categories.length > 0 ? state.filters.categories : undefined,
        searchQuery: state.filters.searchQuery
    });
    
    updateItemsList();
    updateItemCount();
    
    // Update map items
    if (svgMap) {
        svgMap.filterItems(state.filteredItems);
    }
}

// Update items list in sidebar
function updateItemsList() {
    const listContainer = document.getElementById('itemsList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    state.filteredItems.forEach(item => {
        const card = createItemCard(item);
        listContainer.appendChild(card);
    });
}

// Create item card element
function createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.style.cursor = 'pointer';
    card.onclick = () => showItemDetails(item.id);
    
    const color = getCategoryColor(item.category);
    
    // Get category name in English
    const categoryNames = {
        shop: 'Shop',
        bank: 'Bank',
        food: 'Food & Drink',
        building: 'Building',
        other: 'Other'
    };
    const categoryName = categoryNames[item.category] || item.category;
    
    card.innerHTML = `
        <div class="item-card-content">
            <div class="item-thumbnail" style="background-color: ${color};">
            </div>
            <div class="item-info">
                <h4 class="item-title">${item.title}</h4>
                <div class="item-meta">
                    Floor ${item.floor}
                </div>
                <div class="item-badges">
                    <span class="item-badge">${categoryName}</span>
                </div>
            </div>
        </div>
    `;
    
    return card;
}

// Update item count
function updateItemCount() {
    const countElement = document.getElementById('itemCount');
    if (countElement) {
        countElement.textContent = state.filteredItems.length;
    }
}

// Show item details
function showItemDetails(itemId) {
    const item = getItemById(itemId);
    if (!item) return;
    
    state.selectedItem = item;
    state.ui.detailsPanelOpen = true;
    
    const detailsPanel = document.getElementById('detailsPanel');
    if (detailsPanel) {
        detailsPanel.style.display = 'block';
        
        // Update details content
        updateDetailsPanel(item);
        
        // Zoom to item on map (this triggers immediately on first click)
        if (svgMap) {
            svgMap.highlightItem(itemId);
        }
        
        // Re-initialize icons
        if (window.lucide) {
            lucide.createIcons();
        }
    }
}

// Populate category select (for edit mode in details panel)
function populateCategorySelect() {
    const categorySelect = document.getElementById('detailsCategoryInput');
    if (!categorySelect) return;
    
    // Get unique categories from loaded items
    const categories = [...new Set(state.items.map(item => item.category))].filter(Boolean);
    
    // Category display names
    const categoryNames = {
        shop: 'Shop',
        bank: 'Bank',
        food: 'Food & Drink',
        building: 'Building',
        other: 'Other',
        pharmacy: 'Pharmacy'
    };
    
    // Clear existing options
    categorySelect.innerHTML = '';
    
    // Add options
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = categoryNames[category] || category.charAt(0).toUpperCase() + category.slice(1);
        categorySelect.appendChild(option);
    });
    
    console.log('Category select populated with:', categories);
}

// Update details panel content
function updateDetailsPanel(item) {
    const color = getCategoryColor(item.category);
    
    // Title
    const titleElement = document.getElementById('detailsTitle');
    if (titleElement) titleElement.textContent = item.title;
    const titleDisplay = document.getElementById('detailsTitleDisplay');
    if (titleDisplay) titleDisplay.textContent = item.title || '—';
    const titleInput = document.getElementById('detailsTitleInputField');
    if (titleInput) titleInput.value = item.title || '';
    
    // Category badge
    const categoryBadge = document.getElementById('detailsCategoryBadge');
    if (categoryBadge) {
        categoryBadge.textContent = item.category.toUpperCase();
        categoryBadge.style.backgroundColor = color;
    }
    
    // Meta info
    const metaElement = document.getElementById('detailsMeta');
    if (metaElement) {
        metaElement.textContent = `Floor ${item.floor}`;
    }

    // Field displays
    const categoryDisplay = document.getElementById('detailsCategoryDisplay');
    if (categoryDisplay) categoryDisplay.textContent = item.category || '—';
    const floorDisplay = document.getElementById('detailsFloorDisplay');
    if (floorDisplay) floorDisplay.textContent = (item.floor ?? '—');
    const phoneDisplay = document.getElementById('detailsPhoneDisplay');
    if (phoneDisplay) phoneDisplay.textContent = item.phone || 'N/A';
    const descriptionDisplay = document.getElementById('detailsDescriptionValue');
    if (descriptionDisplay) descriptionDisplay.textContent = item.description || 'N/A';

    // Populate category select dropdown
    populateCategorySelect();
    
    // Set category dropdown value
    const categoryInput = document.getElementById('detailsCategoryInput');
    if (categoryInput) categoryInput.value = item.category || '';
    
    const floorInput = document.getElementById('detailsFloorInput');
    if (floorInput) floorInput.value = item.floor ?? '';
    const phoneInput = document.getElementById('detailsPhoneInput');
    if (phoneInput) phoneInput.value = item.phone || '';
    const descriptionInput = document.getElementById('detailsDescriptionInput');
    if (descriptionInput) descriptionInput.value = item.description || '';

    resetEditUI();
}

// Update related items
function updateRelatedItems(itemId) {
    const relatedItems = getRelatedItems(itemId, 3);
    const container = document.getElementById('relatedItemsList');
    
    if (!container) return;
    
    container.innerHTML = '';
    
    relatedItems.forEach(item => {
        const color = getCategoryColor(item.category);
        
        const card = document.createElement('div');
        card.className = 'item-card';
        card.onclick = () => showItemDetails(item.id);
        
        card.innerHTML = `
            <div class="item-card-content">
                <div class="item-thumbnail" style="background-color: ${color}; width: 3rem; height: 2.25rem;">
                    ${item.category.charAt(0).toUpperCase()}
                </div>
                <div class="item-info">
                    <h5 class="item-title" style="font-size: 0.75rem;">${item.title}</h5>
                    <div class="item-meta">
                        Floor ${item.floor}
                    </div>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

// Close details panel
function closeDetailsPanel() {
    state.ui.detailsPanelOpen = false;
    state.selectedItem = null;
    
    const detailsPanel = document.getElementById('detailsPanel');
    if (detailsPanel) {
        detailsPanel.style.display = 'none';
    }
}

function setupSuggestEditUI() {
    const suggestBtn = document.getElementById('suggestEditBtn');
    const submitBtn = document.getElementById('submitEditBtn');
    const successAlert = document.getElementById('editSuccessAlert');

    suggestBtn?.addEventListener('click', () => {
        if (!state.selectedItem) return;
        if (state.pendingRequests.has(state.selectedItem.id)) return;
        if (successAlert) {
            successAlert.style.display = 'none';
        }
        state.ui.editMode = true;
        toggleEditUI();
    });

    submitBtn?.addEventListener('click', () => {
        if (!state.selectedItem) return;
        state.ui.editMode = false;
        toggleEditUI();
        showSuccessAlert();
    });
}

function toggleEditUI() {
    const suggestBtn = document.getElementById('suggestEditBtn');
    const actions = document.getElementById('titleEditActions');
    const fieldMappings = getEditableFields();

    if (!suggestBtn || !actions) return;

    if (state.ui.editMode) {
        fieldMappings.forEach(({ displayId, inputId, key }) => {
            const displayEl = document.getElementById(displayId);
            const inputEl = document.getElementById(inputId);
            if (displayEl) displayEl.style.display = 'none';
            if (inputEl) {
                inputEl.style.display = 'block';
                if (state.selectedItem) {
                    const value = key === 'floor'
                        ? (typeof state.selectedItem.floor !== 'undefined' ? state.selectedItem.floor : '')
                        : (state.selectedItem[key] || '');
                    inputEl.value = value;
                } else {
                    inputEl.value = '';
                }
            }
        });
        actions.style.display = 'flex';
        suggestBtn.style.display = 'none';
    } else {
        fieldMappings.forEach(({ displayId, inputId }) => {
            const displayEl = document.getElementById(displayId);
            const inputEl = document.getElementById(inputId);
            if (displayEl) displayEl.style.display = '';
            if (inputEl) inputEl.style.display = 'none';
        });
        actions.style.display = 'none';
        if (state.selectedItem && state.pendingRequests.has(state.selectedItem.id)) {
            suggestBtn.style.display = 'none';
        } else {
            suggestBtn.style.display = 'inline-flex';
        }
    }
}

function resetEditUI() {
    const suggestBtn = document.getElementById('suggestEditBtn');
    const actions = document.getElementById('titleEditActions');
    const successAlert = document.getElementById('editSuccessAlert');
    const fieldMappings = getEditableFields();

    state.ui.editMode = false;
    if (state.ui.successAlertTimeout) {
        clearTimeout(state.ui.successAlertTimeout);
        state.ui.successAlertTimeout = null;
    }

    fieldMappings.forEach(({ displayId, inputId }) => {
        const displayEl = document.getElementById(displayId);
        const inputEl = document.getElementById(inputId);
        if (displayEl) displayEl.style.display = '';
        if (inputEl) inputEl.style.display = 'none';
    });

    if (suggestBtn) {
        suggestBtn.style.display = 'inline-flex';
        suggestBtn.disabled = false;
        suggestBtn.textContent = 'Suggest an edit';
    }
    if (actions) actions.style.display = 'none';
    if (successAlert) successAlert.style.display = 'none';

    renderPendingAlert();
}

function getEditableFields() {
    return [
        { key: 'title', displayId: 'detailsTitleDisplay', inputId: 'detailsTitleInputField' },
        { key: 'category', displayId: 'detailsCategoryDisplay', inputId: 'detailsCategoryInput' },
        { key: 'floor', displayId: 'detailsFloorDisplay', inputId: 'detailsFloorInput' },
        { key: 'phone', displayId: 'detailsPhoneDisplay', inputId: 'detailsPhoneInput' },
        { key: 'description', displayId: 'detailsDescriptionValue', inputId: 'detailsDescriptionInput' }
    ];
}

function showSuccessAlert() {
    const successAlert = document.getElementById('editSuccessAlert');
    if (!successAlert || !state.selectedItem) return;

    successAlert.style.display = 'flex';
    if (state.ui.successAlertTimeout) {
        clearTimeout(state.ui.successAlertTimeout);
    }
    state.ui.successAlertTimeout = setTimeout(() => {
        successAlert.style.display = 'none';
        state.pendingRequests.add(state.selectedItem.id);
        renderPendingAlert();
    }, 2500);
}

function renderPendingAlert() {
    const alert = document.getElementById('editPendingAlert');
    const suggestBtn = document.getElementById('suggestEditBtn');
    if (!alert) return;

    if (state.selectedItem && state.pendingRequests.has(state.selectedItem.id)) {
        alert.style.display = 'flex';
        if (suggestBtn) {
            suggestBtn.disabled = true;
            suggestBtn.textContent = 'Awaiting approval';
        }
    } else {
        alert.style.display = 'none';
        if (suggestBtn) {
            suggestBtn.disabled = false;
            suggestBtn.textContent = 'Suggest an edit';
        }
    }
}

// Export for debugging
window.app = {
    state,
    svgMap: () => svgMap,
    showItemDetails,
    applyFilters,
    loadData
};

console.log('App module loaded. Access via window.app for debugging.');

