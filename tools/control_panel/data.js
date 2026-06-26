// Data management module

// Real data will be loaded from SVG
let realMapData = [];

// Google Sheets data
let googleSheetsData = new Map(); // Map of ID to item data

// Mock data - represents items from Excel file (fallback)
const mockMapData = [
    {
        id: 'ID0001',
        title: 'Yargıcı',
        subtitle: '',
        location: '',
        floor: 0,
        phone: '0',
        description: '',
        category: 'shop'
    },
    {
        id: 'ID0002',
        title: 'Mudo Store',
        subtitle: '',
        location: '',
        floor: 0,
        phone: '0',
        description: '',
        category: 'shop'
    },
    {
        id: 'ID0003',
        title: 'Akbank',
        subtitle: '',
        location: '',
        floor: 0,
        phone: '0',
        description: '',
        category: 'bank'
    },
    {
        id: 'ID0004',
        title: 'Garanti BBVA',
        subtitle: '',
        location: '',
        floor: 0,
        phone: '0',
        description: '',
        category: 'bank'
    },
    {
        id: 'ID0005',
        title: 'Piano',
        subtitle: '',
        location: '',
        floor: 0,
        phone: '0',
        description: '',
        category: 'shop'
    },
    {
        id: 'ID0006',
        title: 'Oysho',
        subtitle: '',
        location: '',
        floor: 0,
        phone: '0',
        description: '',
        category: 'shop'
    },
    {
        id: 'ID0007',
        title: 'Galata Muhallebicisi',
        subtitle: '',
        location: '',
        floor: 0,
        phone: '0',
        description: '',
        category: 'food'
    },
    {
        id: 'ID0008',
        title: 'Apartman',
        subtitle: '',
        location: '',
        floor: 0,
        phone: '0',
        description: '',
        category: 'building'
    },
    {
        id: 'ID0009',
        title: 'Starbucks',
        subtitle: '',
        location: 'Near entrance',
        floor: 1,
        phone: '0',
        description: 'Coffee shop',
        category: 'food'
    },
    {
        id: 'ID0010',
        title: 'LC Waikiki',
        subtitle: '',
        location: '',
        floor: 1,
        phone: '0',
        description: '',
        category: 'shop'
    },
    {
        id: 'ID0011',
        title: 'İş Bankası ATM',
        subtitle: '',
        location: '',
        floor: 0,
        phone: '0',
        description: '',
        category: 'bank'
    },
    {
        id: 'ID0012',
        title: 'Burger King',
        subtitle: '',
        location: 'Food court',
        floor: 2,
        phone: '0',
        description: 'Fast food restaurant',
        category: 'food'
    },
    {
        id: 'ID0013',
        title: 'Zara',
        subtitle: '',
        location: '',
        floor: 1,
        phone: '0',
        description: '',
        category: 'shop'
    },
    {
        id: 'ID0014',
        title: 'H&M',
        subtitle: '',
        location: '',
        floor: 1,
        phone: '0',
        description: '',
        category: 'shop'
    },
    {
        id: 'ID0015',
        title: 'Mango',
        subtitle: '',
        location: '',
        floor: 1,
        phone: '0',
        description: '',
        category: 'shop'
    }
];

// Category colors (will be populated from SVG)
export let categoryColors = {
    shop: '#e74c3c',
    bank: '#3498db',
    food: '#2ecc71',
    building: '#9b59b6',
    other: '#95a5a6',
    walking: '#dda0dd'
};

// Update category colors
export function updateCategoryColors(colors) {
    categoryColors = { ...categoryColors, ...colors };
}

// Get all items (filtered: only items starting with "ID")
export function getAllItems() {
    const data = realMapData.length > 0 ? [...realMapData] : [...mockMapData];
    return data.filter(item => item.id.startsWith('ID'));
}

// Get item by ID
export function getItemById(id) {
    const data = realMapData.length > 0 ? realMapData : mockMapData;
    return data.find(item => item.id === id);
}

// Get items by category
export function getItemsByCategory(category) {
    const data = realMapData.length > 0 ? realMapData : mockMapData;
    return data.filter(item => item.category === category);
}

// Filter items based on criteria
export function filterItems(filters = {}) {
    const data = realMapData.length > 0 ? realMapData : mockMapData;
    let items = [...data];
    
    // Always filter non-ID items only
    items = items.filter(item => item.id.startsWith('ID'));
    
    // Filter by categories/amenities
    if (filters.categories && filters.categories.length > 0) {
        items = items.filter(item => filters.categories.includes(item.category));
    }
    
    // Filter by search query
    if (filters.searchQuery && filters.searchQuery.trim()) {
        const query = filters.searchQuery.toLowerCase();
        items = items.filter(item => {
            const searchText = `${item.title} ${item.subtitle || ''} ${item.description || ''}`.toLowerCase();
            return searchText.includes(query);
        });
    }
    
    // Filter by property types (if applicable)
    if (filters.propertyTypes && filters.propertyTypes.length > 0) {
        // Could filter by additional properties if needed
    }
    
    // Filter by floor
    if (filters.floor !== undefined) {
        items = items.filter(item => item.floor === filters.floor);
    }
    
    return items;
}

// Get related items (same category)
export function getRelatedItems(itemId, limit = 3) {
    const item = getItemById(itemId);
    if (!item) return [];
    
    const data = realMapData.length > 0 ? realMapData : mockMapData;
    return data
        .filter(i => 
            i.id !== itemId && 
            i.category === item.category &&
            i.id.startsWith('ID')
        )
        .slice(0, limit);
}

// Get category color
export function getCategoryColor(category) {
    return categoryColors[category] || categoryColors.other;
}

// Parse CSV text to array of objects
function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    // Detect delimiter (comma or tab)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(',') ? ',' : '\t';
    
    console.log(`CSV delimiter detected: ${delimiter === ',' ? 'comma' : 'tab'}`);
    
    // Get headers from first line
    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
    
    console.log('CSV headers:', headers);
    
    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        data.push(obj);
    }
    
    return data;
}

// Load data from Google Sheets
export async function loadDataFromGoogleSheets(sheetUrl) {
    try {
        console.log('Loading data from Google Sheets...');
        
        // If URL is a full Google Sheets URL, convert it to CSV export URL
        let csvUrl = sheetUrl;
        
        // Check if it's a Google Sheets URL
        if (sheetUrl.includes('docs.google.com/spreadsheets')) {
            // Extract sheet ID
            const sheetIdMatch = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (sheetIdMatch) {
                const sheetId = sheetIdMatch[1];
                // Convert to CSV export URL
                csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
                console.log('Converted to CSV URL:', csvUrl);
            }
        }
        
        const response = await fetch(csvUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch Google Sheets: ${response.status}`);
        }
        
        const csvText = await response.text();
        const rows = parseCSV(csvText);
        
        console.log(`Loaded ${rows.length} rows from Google Sheets`);
        
        // Convert to Map for fast lookup by ID
        googleSheetsData.clear();
        rows.forEach(row => {
            if (row.ID) {
                googleSheetsData.set(row.ID, {
                    id: row.ID,
                    title: row.Title || '',
                    subtitle: row.Subtitle || '',
                    location: row.Location || '',
                    floor: parseInt(row.Floor) || 0,
                    phone: row.Phone || '',
                    description: row.Description || '',
                    category: row.Category?.toLowerCase() || 'other'
                });
            }
        });
        
        console.log(`✅ Loaded ${googleSheetsData.size} items from Google Sheets`);
        console.log('Sample data:', Array.from(googleSheetsData.entries()).slice(0, 3));
        
        return Array.from(googleSheetsData.values());
        
    } catch (error) {
        console.error('Error loading Google Sheets:', error);
        return [];
    }
}

// Load data from Excel file (placeholder for future implementation)
export async function loadDataFromExcel(filePath) {
    // This would use a library like xlsx.js to read Excel files
    // For now, return mock data
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(mockMapData);
        }, 500);
    });
}

// Get cumulative transform of an element
function getCumulativeTransform(element) {
    let transform = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    let current = element;
    
    while (current && current.tagName) {
        const transformAttr = current.getAttribute('transform');
        if (transformAttr) {
            // Parse translate
            const translateMatch = transformAttr.match(/translate\(([^,]+),?\s*([^\)]*)\)/);
            if (translateMatch) {
                transform.x += parseFloat(translateMatch[1]) || 0;
                transform.y += parseFloat(translateMatch[2]) || 0;
            }
            
            // Parse scale
            const scaleMatch = transformAttr.match(/scale\(([^,]+),?\s*([^\)]*)\)/);
            if (scaleMatch) {
                transform.scaleX *= parseFloat(scaleMatch[1]) || 1;
                transform.scaleY *= parseFloat(scaleMatch[2] || scaleMatch[1]) || 1;
            }
        }
        current = current.parentElement;
    }
    
    return transform;
}

// Parse SVG path d attribute to get coordinates
function parsePathToCoordinates(dValue, element = null) {
    if (!dValue) return null;
    
    const commands = dValue.match(/[a-df-z][^a-df-z]*/ig);
    if (!commands) return null;

    let currentPoint = { x: 0, y: 0 };
    const points = [];

    function addPoint(x, y) {
        currentPoint = { x, y };
        points.push({ x, y });
    }

    commands.forEach(cmd => {
        const type = cmd[0];
        const args = cmd.slice(1).trim().split(/[\s,]+/).map(Number);
        let i = 0;

        switch (type) {
            case 'M': // MoveTo (absolute)
                while (i < args.length) {
                    addPoint(args[i], args[i + 1]);
                    i += 2;
                }
                break;
            case 'm': // MoveTo (relative)
                while (i < args.length) {
                    addPoint(currentPoint.x + args[i], currentPoint.y + args[i + 1]);
                    i += 2;
                }
                break;
            case 'L': // LineTo (absolute)
                while (i < args.length) {
                    addPoint(args[i], args[i + 1]);
                    i += 2;
                }
                break;
            case 'l': // LineTo (relative)
                while (i < args.length) {
                    addPoint(currentPoint.x + args[i], currentPoint.y + args[i + 1]);
                    i += 2;
                }
                break;
            case 'H': // Horizontal line (absolute)
                while (i < args.length) {
                    addPoint(args[i], currentPoint.y);
                    i++;
                }
                break;
            case 'h': // Horizontal line (relative)
                while (i < args.length) {
                    addPoint(currentPoint.x + args[i], currentPoint.y);
                    i++;
                }
                break;
            case 'V': // Vertical line (absolute)
                while (i < args.length) {
                    addPoint(currentPoint.x, args[i]);
                    i++;
                }
                break;
            case 'v': // Vertical line (relative)
                while (i < args.length) {
                    addPoint(currentPoint.x, currentPoint.y + args[i]);
                    i++;
                }
                break;
            case 'C': // Cubic bezier (absolute)
                while (i < args.length) {
                    addPoint(args[i + 4], args[i + 5]);
                    i += 6;
                }
                break;
            case 'c': // Cubic bezier (relative)
                while (i < args.length) {
                    addPoint(currentPoint.x + args[i + 4], currentPoint.y + args[i + 5]);
                    i += 6;
                }
                break;
            case 'Q': // Quadratic bezier (absolute)
                while (i < args.length) {
                    addPoint(args[i + 2], args[i + 3]);
                    i += 4;
                }
                break;
            case 'q': // Quadratic bezier (relative)
                while (i < args.length) {
                    addPoint(currentPoint.x + args[i + 2], currentPoint.y + args[i + 3]);
                    i += 4;
                }
                break;
        }
    });

    if (points.length === 0) return null;

    // Apply transform if element is provided
    let transform = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    if (element) {
        transform = getCumulativeTransform(element);
    }

    // Apply transform to all points
    const transformedPoints = points.map(p => ({
        x: p.x * transform.scaleX + transform.x,
        y: p.y * transform.scaleY + transform.y
    }));

    // Calculate center point (bounding box center)
    const minX = Math.min(...transformedPoints.map(p => p.x));
    const maxX = Math.max(...transformedPoints.map(p => p.x));
    const minY = Math.min(...transformedPoints.map(p => p.y));
    const maxY = Math.max(...transformedPoints.map(p => p.y));

    return {
        center: {
            x: (minX + maxX) / 2,
            y: (minY + maxY) / 2
        },
        bounds: { minX, maxX, minY, maxY },
        points: transformedPoints
    };
}

// Get element coordinates (path, rect, polygon, etc.)
function getElementCoordinates(element) {
    const transform = getCumulativeTransform(element);
    
    // Try to get path d attribute
    const d = element.getAttribute('d');
    if (d) {
        return parsePathToCoordinates(d, element);
    }
    
    // Try rect
    let x = parseFloat(element.getAttribute('x'));
    let y = parseFloat(element.getAttribute('y'));
    const width = parseFloat(element.getAttribute('width'));
    const height = parseFloat(element.getAttribute('height'));
    
    if (!isNaN(x) && !isNaN(y)) {
        const w = !isNaN(width) ? width : 0;
        const h = !isNaN(height) ? height : 0;
        
        // Apply transform
        x = x * transform.scaleX + transform.x;
        y = y * transform.scaleY + transform.y;
        const w2 = w * transform.scaleX;
        const h2 = h * transform.scaleY;
        
        return {
            center: { x: x + w2 / 2, y: y + h2 / 2 },
            bounds: { minX: x, maxX: x + w2, minY: y, maxY: y + h2 },
            points: [{ x, y }, { x: x + w2, y: y + h2 }]
        };
    }
    
    // Try circle
    let cx = parseFloat(element.getAttribute('cx'));
    let cy = parseFloat(element.getAttribute('cy'));
    const r = parseFloat(element.getAttribute('r'));
    
    if (!isNaN(cx) && !isNaN(cy)) {
        const radius = !isNaN(r) ? r : 0;
        
        // Apply transform
        cx = cx * transform.scaleX + transform.x;
        cy = cy * transform.scaleY + transform.y;
        const r2 = radius * Math.max(transform.scaleX, transform.scaleY);
        
        return {
            center: { x: cx, y: cy },
            bounds: { minX: cx - r2, maxX: cx + r2, minY: cy - r2, maxY: cy + r2 },
            points: [{ x: cx, y: cy }]
        };
    }
    
    return null;
}

// Load data from SVG file
export async function loadDataFromSVG(svgPath = './public/assets/0.svg') {
    try {
        // Try primary path
        let response = await fetch(svgPath);
        
        // If not found, try alternative path
        if (!response.ok) {
            response = await fetch('./assets/0.svg');
        }
        
        if (!response.ok) {
            console.warn('SVG file not found, using mock data');
            return mockMapData;
        }

        const svgText = await response.text();
        
        // Parse SVG
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
        
        console.log('=== Parsing SVG for data ===');
        
        // Find the Rooms group
        const roomsGroup = svgDoc.querySelector('g[id="Rooms"]');
        
        if (!roomsGroup) {
            console.warn('Rooms group not found in SVG, using mock data');
            return mockMapData;
        }
        
        const items = [];
        const extractedColors = {};
        
        // Category mapping from SVG group names to our categories
        const categoryMap = {
            'Shop': 'shop',
            'shop': 'shop',
            'Food': 'food',
            'food': 'food',
            'Other': 'other',
            'other': 'other',
            'Building': 'building',
            'building': 'building',
            'Bank': 'bank',
            'bank': 'bank'
        };
        
        // Get all direct children groups of Rooms (Shop, Food, Other, Building, etc.)
        const categoryGroups = roomsGroup.querySelectorAll(':scope > g');
        
        categoryGroups.forEach(categoryGroup => {
            const groupId = categoryGroup.getAttribute('id');
            if (!groupId) return;
            
            console.log(`Processing group: ${groupId}`);
            
            // Determine category
            let category = 'other';
            for (const [key, value] of Object.entries(categoryMap)) {
                if (groupId.toLowerCase().includes(key.toLowerCase())) {
                    category = value;
                    break;
                }
            }
            
            // Extract fill color from group or its children
            let fillColor = null;
            
            // Try to get fill from group itself
            fillColor = categoryGroup.getAttribute('fill');
            
            // If not found, try to find from first child with fill
            if (!fillColor || fillColor === 'none') {
                const childWithFill = categoryGroup.querySelector('[fill]:not([fill="none"])');
                if (childWithFill) {
                    fillColor = childWithFill.getAttribute('fill');
                }
            }
            
            // Store the color for this category (including "other")
            if (fillColor && fillColor !== 'none') {
                extractedColors[category] = fillColor;
                console.log(`📌 Category "${category}" color: ${fillColor}`);
            }
            
            // Get all child elements (groups or paths)
            const children = categoryGroup.querySelectorAll('g, path, rect, polygon, circle');
            
            children.forEach((element, index) => {
                const id = element.getAttribute('id');
                const title = element.querySelector('title')?.textContent || 
                             element.getAttribute('data-name') ||
                             element.getAttribute('name') ||
                             `${groupId}_${index + 1}`;
                
                // Try to get text content
                const textElement = element.querySelector('text');
                const text = textElement?.textContent?.trim() || '';
                
                // Get coordinates from path or other shape
                let coordinates = null;
                let targetElement = element;
                
                if (element.tagName.toLowerCase() === 'g') {
                    // If it's a group, try to find a path inside
                    const pathInside = element.querySelector('path, rect, circle, polygon');
                    if (pathInside) {
                        targetElement = pathInside;
                        coordinates = getElementCoordinates(pathInside);
                    }
                } else {
                    coordinates = getElementCoordinates(element);
                }
                
                // Skip if no valid coordinates found
                if (!coordinates) {
                    console.warn(`No coordinates found for ${id || `${groupId}_${index + 1}`}`);
                    return;
                }
                
                // Create item ID
                const itemId = id || `${groupId}_${String(index + 1).padStart(4, '0')}`;
                
                // Log coordinates for debugging
                console.log(`${itemId}: SVG center at (x:${coordinates.center.x.toFixed(1)}, y:${coordinates.center.y.toFixed(1)}) bounds: x[${coordinates.bounds.minX.toFixed(0)}-${coordinates.bounds.maxX.toFixed(0)}] y[${coordinates.bounds.minY.toFixed(0)}-${coordinates.bounds.maxY.toFixed(0)}]`);
                
                // Try to get data from Google Sheets first
                const sheetsData = googleSheetsData.get(itemId);
                
                // Create item with Google Sheets data if available, otherwise use SVG data
                const item = {
                    id: itemId,
                    title: sheetsData?.title || text || title || `Unit ${index + 1}`,
                    subtitle: sheetsData?.subtitle || '',
                    location: sheetsData?.location || groupId,
                    floor: sheetsData?.floor !== undefined ? sheetsData.floor : 0,
                    phone: sheetsData?.phone || '',
                    description: sheetsData?.description || `Located in ${groupId}`,
                    category: sheetsData?.category || category,
                    svgElement: element.tagName,
                    svgGroupId: groupId,
                    coordinates: coordinates.center,  // Center point
                    bounds: coordinates.bounds,        // Bounding box
                    pathPoints: coordinates.points     // All path points
                };
                
                // Log if Google Sheets data was used
                if (sheetsData) {
                    console.log(`✓ ${itemId}: Merged with Google Sheets data - "${item.title}"`);
                }
                
                items.push(item);
            });
        });
        
        console.log(`✅ Loaded ${items.length} items from SVG`);
        console.log('Categories found:', [...new Set(items.map(i => i.category))]);
        
        // Update category colors with extracted colors from SVG
        if (Object.keys(extractedColors).length > 0) {
            updateCategoryColors(extractedColors);
            console.log('📊 Updated category colors:', extractedColors);
        }
        
        // Store in realMapData
        realMapData = items;
        
        return items;
        
    } catch (error) {
        console.error('Error loading data from SVG:', error);
        return mockMapData;
    }
}

// Set data manually (for testing)
export function setMapData(data) {
    realMapData = data;
}

// Export data statistics
export function getDataStatistics() {
    const data = realMapData.length > 0 ? realMapData : mockMapData;
    const stats = {
        total: data.length,
        byCategory: {}
    };
    
    data.forEach(item => {
        if (!stats.byCategory[item.category]) {
            stats.byCategory[item.category] = 0;
        }
        stats.byCategory[item.category]++;
    });
    
    return stats;
}

