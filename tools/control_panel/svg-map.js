// SVG-based map management (inspired by inmapper approach)
// This provides accurate zoom and pan functionality

export class SVGMapManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = null;
        this.svgElement = null;
        this.svgDoc = null;
        
        // Zoom and pan state
        this.currentZoom = 1;
        this.currentTranslate = { x: 0, y: 0 };
        this.isPanning = false;
        this.startPoint = { x: 0, y: 0 };
        
        // SVG dimensions
        this.svgWidth = 0;
        this.svgHeight = 0;
        
        // Item data
        this.items = [];
        this.itemElements = new Map(); // Map of item ID to SVG element
        this.selectedElement = null;
        
        // Callbacks
        this.onItemClick = null;
    }

    async initialize() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            throw new Error(`Container ${this.containerId} not found`);
        }

        // Create SVG container with proper structure
        this.container.innerHTML = `
            <div id="svgMapContainer" style="width: 100%; height: 100%; position: relative; overflow: hidden; background: #f5f5f5;">
                <div id="svgInnerContainer" style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; cursor: grab;">
                    <!-- SVG will be loaded here -->
                </div>
                
                <!-- Zoom controls -->
                <div style="position: absolute; bottom: 20px; right: 20px; display: flex; flex-direction: column; gap: 10px; z-index: 50;">
                    <button id="zoomInBtn" style="width: 40px; height: 40px; background: white; border: none; border-radius: 5px; cursor: pointer; font-size: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">+</button>
                    <button id="zoomOutBtn" style="width: 40px; height: 40px; background: white; border: none; border-radius: 5px; cursor: pointer; font-size: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">−</button>
                    <button id="resetZoomBtn" style="width: 40px; height: 40px; background: white; border: none; border-radius: 5px; cursor: pointer; font-size: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">⟲</button>
                </div>
            </div>
        `;

        // Load SVG
        await this.loadSVG('./public/assets/0.svg');
        
        // Setup controls
        this.setupPanZoom();
        this.setupControls();

        console.log('SVG Map initialized successfully');
    }

    async loadSVG(svgPath) {
        try {
            // Try primary path
            let response = await fetch(svgPath);
            
            // If not found, try alternative path
            if (!response.ok) {
                response = await fetch('./assets/0.svg');
            }
            
            if (!response.ok) {
                throw new Error('SVG file not found');
            }

            const svgText = await response.text();
            const innerContainer = document.getElementById('svgInnerContainer');
            innerContainer.innerHTML = svgText;
            
            this.svgElement = innerContainer.querySelector('svg');
            if (!this.svgElement) {
                throw new Error('Invalid SVG file');
            }

            // Set SVG properties for proper rendering
            this.svgElement.id = 'mainSvgMap';
            this.svgElement.style.width = '100%';
            this.svgElement.style.height = '100%';
            this.svgElement.style.transition = 'transform 0.3s ease';
            
            // Get SVG dimensions
            const viewBox = this.svgElement.getAttribute('viewBox');
            if (viewBox) {
                const parts = viewBox.split(/\s+|,/);
                this.svgWidth = parseFloat(parts[2]);
                this.svgHeight = parseFloat(parts[3]);
            } else {
                this.svgWidth = parseFloat(this.svgElement.getAttribute('width')) || 1000;
                this.svgHeight = parseFloat(this.svgElement.getAttribute('height')) || 1000;
            }

            console.log(`SVG loaded: ${this.svgWidth}x${this.svgHeight}`);
            
            // Parse SVG document for later use
            const parser = new DOMParser();
            this.svgDoc = parser.parseFromString(svgText, 'image/svg+xml');

        } catch (error) {
            console.error('Error loading SVG:', error);
            throw error;
        }
    }

    setupPanZoom() {
        const innerContainer = document.getElementById('svgInnerContainer');
        
        innerContainer.addEventListener('mousedown', (e) => {
            // Don't pan if clicking on a clickable element
            if (e.target.closest('[data-item-id]')) return;
            
            this.isPanning = true;
            this.startPoint = { 
                x: e.clientX - this.currentTranslate.x, 
                y: e.clientY - this.currentTranslate.y 
            };
            innerContainer.style.cursor = 'grabbing';
        });

        innerContainer.addEventListener('mousemove', (e) => {
            if (!this.isPanning) return;
            this.currentTranslate.x = e.clientX - this.startPoint.x;
            this.currentTranslate.y = e.clientY - this.startPoint.y;
            this.updateTransform();
        });

        innerContainer.addEventListener('mouseup', () => {
            this.isPanning = false;
            innerContainer.style.cursor = 'grab';
        });

        innerContainer.addEventListener('mouseleave', () => {
            this.isPanning = false;
            innerContainer.style.cursor = 'grab';
        });

        // Zoom with mouse wheel
        innerContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom(delta, e.clientX, e.clientY);
        });
    }

    setupControls() {
        document.getElementById('zoomInBtn')?.addEventListener('click', () => this.zoom(1.2));
        document.getElementById('zoomOutBtn')?.addEventListener('click', () => this.zoom(0.8));
        document.getElementById('resetZoomBtn')?.addEventListener('click', () => this.resetZoom());
    }

    zoom(factor, mouseX, mouseY) {
        const newZoom = this.currentZoom * factor;
        if (newZoom < 0.3 || newZoom > 10) return;

        if (mouseX !== undefined && mouseY !== undefined) {
            const container = document.getElementById('svgInnerContainer');
            const rect = container.getBoundingClientRect();
            const offsetX = mouseX - rect.left;
            const offsetY = mouseY - rect.top;

            this.currentTranslate.x = offsetX - (offsetX - this.currentTranslate.x) * factor;
            this.currentTranslate.y = offsetY - (offsetY - this.currentTranslate.y) * factor;
        }

        this.currentZoom = newZoom;
        this.updateTransform();
    }

    resetZoom() {
        this.currentZoom = 1;
        this.currentTranslate = { x: 0, y: 0 };
        this.updateTransform();
        
        if (this.selectedElement) {
            const textEl = this.selectedElement.text;
            const shapeEl = this.selectedElement.shape;
            
            if (textEl) {
                textEl.classList.remove('highlighted');
                textEl.style.filter = '';
            }
            if (shapeEl) {
                shapeEl.classList.remove('highlighted');
                // Restore original values
                shapeEl.style.stroke = shapeEl.dataset.originalStroke || '';
                shapeEl.style.fill = shapeEl.dataset.originalFill || '';
                shapeEl.style.fillOpacity = shapeEl.dataset.originalFillOpacity || '';
            }
            
            this.selectedElement = null;
        }
    }

    updateTransform() {
        if (!this.svgElement) return;
        this.svgElement.style.transform = `translate(${this.currentTranslate.x}px, ${this.currentTranslate.y}px) scale(${this.currentZoom})`;
    }

    loadItems(items) {
        this.items = items;
        this.itemElements.clear();

        if (!this.svgElement) {
            console.warn('SVG not loaded yet');
            return;
        }

        const ensureOriginalStyles = (element) => {
            if (!element) return;
            const computed = window.getComputedStyle(element);
            if (!element.dataset.originalStroke) {
                element.dataset.originalStroke = element.getAttribute('stroke') || computed.stroke || 'none';
            }
            if (!element.dataset.originalFill) {
                element.dataset.originalFill = element.getAttribute('fill') || computed.fill || 'none';
            }
            if (!element.dataset.originalFillOpacity) {
                element.dataset.originalFillOpacity = element.getAttribute('fill-opacity') || computed.fillOpacity || '1';
            }
        };

        items.forEach(item => {
            // Find shape element directly by ID attribute (path, polygon, rect, circle)
            let shapeElement = this.svgElement.querySelector(`[id="${item.id}"]`);
            
            // If shape has different tag, try common shape types
            if (!shapeElement) {
                shapeElement = this.svgElement.querySelector(`path[id="${item.id}"], polygon[id="${item.id}"], rect[id="${item.id}"], circle[id="${item.id}"]`);
            }
            
            // Find text element that contains this item's ID in its tspans
            let textElement = null;
            const textElements = this.svgElement.querySelectorAll('text');
            
            for (const textEl of textElements) {
                const tspans = textEl.querySelectorAll('tspan');
                for (const tspan of tspans) {
                    const content = tspan.textContent.trim();
                    // Check if this tspan contains the item ID (with or without suffixes like _1_, _2_)
                    if (content.startsWith(item.id) || content.replace(/_\d+_$/, '') === item.id) {
                        textElement = textEl;
                        break;
                    }
                }
                if (textElement) break;
            }
            
            // Only proceed if we found the shape element (text is optional)
            if (shapeElement) {
                // Update text content to show title instead of ID (keep original positioning)
                if (textElement) {
                    // Find all tspans in the text element
                    const tspans = textElement.querySelectorAll('tspan');
                    
                    if (tspans.length > 0) {
                        // Smart text wrapping: split title into lines
                        const maxCharsPerLine = 15;
                        const words = item.title.split(' ');
                        const lines = [];
                        let currentLine = '';
                        
                        // Group words into lines
                        words.forEach(word => {
                            const testLine = currentLine ? `${currentLine} ${word}` : word;
                            if (testLine.length <= maxCharsPerLine) {
                                currentLine = testLine;
                            } else {
                                if (currentLine) lines.push(currentLine);
                                currentLine = word;
                            }
                        });
                        if (currentLine) lines.push(currentLine);
                        
                        // Shift text down by adding offset to all tspans
                        // This makes it look like text starts from second line
                        const lineOffset = 6; // Adjust this value to shift more/less
                        
                        // Update tspans - ONLY change text content, preserve all attributes
                        tspans.forEach((tspan, index) => {
                            if (index < lines.length) {
                                // Update text content only
                                tspan.textContent = lines[index];
                                // Remove display none if it was hidden
                                if (tspan.style.display === 'none') {
                                    tspan.style.display = '';
                                }
                                
                                // Add vertical offset to ALL lines (not just first)
                                if (tspan.hasAttribute('y')) {
                                    const currentY = parseFloat(tspan.getAttribute('y'));
                                    if (!isNaN(currentY)) {
                                        tspan.setAttribute('y', currentY + lineOffset);
                                    }
                                } else if (index === 0) {
                                    // If first tspan doesn't have y, set it on text element
                                    const textY = parseFloat(textElement.getAttribute('y')) || 0;
                                    tspan.setAttribute('y', textY + lineOffset);
                                }
                            } else {
                                // Clear extra tspans
                                tspan.textContent = '';
                            }
                        });
                        
                        console.log(`📝 Updated text for ${item.id}: "${item.title}" (${lines.length} lines)`);
                    } else {
                        // If no tspans, update the text element directly
                        textElement.textContent = item.title;
                    }
                }
                
                // Store both text and shape elements
                this.itemElements.set(item.id, {
                    text: textElement,
                    shape: shapeElement
                });
                
                // Make both elements clickable
                const clickHandler = (e) => {
                    e.stopPropagation();
                    this.zoomToItem(item.id);
                    if (this.onItemClick) {
                        this.onItemClick(item);
                    }
                };
                
                // Shape element is the primary interactive element
                shapeElement.style.cursor = 'pointer';
                shapeElement.setAttribute('data-item-id', item.id);
                shapeElement.addEventListener('click', clickHandler);
                
                // Text element is also clickable if it exists
                if (textElement) {
                    textElement.style.cursor = 'pointer';
                    textElement.setAttribute('data-item-id', item.id);
                    textElement.addEventListener('click', clickHandler);
                }
                
                // Add hover effect (stroke color + fill overlay, no width change)
                const hoverIn = () => {
                    ensureOriginalStyles(shapeElement);
                    // Highlight with stroke color and fill overlay (no width change)
                    shapeElement.style.stroke = '#3498db';
                    shapeElement.style.fill = '#3498db';
                    shapeElement.style.fillOpacity = '0.2';
                    
                    if (textElement) {
                        textElement.style.filter = 'drop-shadow(0 0 5px #3498db)';
                    }
                };
                
                const hoverOut = () => {
                    const elements = this.itemElements.get(item.id);
                    if (this.selectedElement !== elements) {
                        // Restore original values
                        shapeElement.style.stroke = shapeElement.dataset.originalStroke || '';
                        shapeElement.style.fill = shapeElement.dataset.originalFill || '';
                        shapeElement.style.fillOpacity = shapeElement.dataset.originalFillOpacity || '';
                        
                        if (textElement) {
                            textElement.style.filter = '';
                        }
                    }
                };
                
                shapeElement.addEventListener('mouseenter', hoverIn);
                shapeElement.addEventListener('mouseleave', hoverOut);
                
                if (textElement) {
                    textElement.addEventListener('mouseenter', hoverIn);
                    textElement.addEventListener('mouseleave', hoverOut);
                }
                
                console.log(`✓ Loaded ${item.id}: shape=${shapeElement.tagName}, text=${textElement ? 'found' : 'not found'}`);
            } else {
                console.warn(`✗ Shape element not found for ${item.id}`);
            }
        });

        console.log(`Loaded ${this.itemElements.size} item elements from ${items.length} items`);
    }

    zoomToItem(itemId) {
        const elements = this.itemElements.get(itemId);
        if (!elements) {
            console.warn(`Element not found for item: ${itemId}`);
            return;
        }

        // Remove previous highlight
        if (this.selectedElement) {
            const prevText = this.selectedElement.text;
            const prevShape = this.selectedElement.shape;
            if (prevText) {
                prevText.style.filter = '';
                prevText.classList.remove('highlighted');
            }
            if (prevShape) {
                // Restore original values
                prevShape.style.stroke = prevShape.dataset.originalStroke || '';
                prevShape.style.fill = prevShape.dataset.originalFill || '';
                prevShape.style.fillOpacity = prevShape.dataset.originalFillOpacity || '';
                prevShape.classList.remove('highlighted');
            }
        }

        const textElement = elements.text;
        const shapeElement = elements.shape;

        // Get target element to zoom to
        const targetElement = shapeElement || textElement;
        
        // Enable smooth transition for zoom animation
        this.svgElement.style.transition = 'transform 0.5s ease';
        
        // Get container and element positions
        const container = document.getElementById('svgInnerContainer');
        const containerRect = container.getBoundingClientRect();
        const elementRect = targetElement.getBoundingClientRect();
        
        // Element center in screen coordinates (with current transform applied)
        const elementCenterX_Screen = elementRect.left + elementRect.width / 2;
        const elementCenterY_Screen = elementRect.top + elementRect.height / 2;
        
        // Container center in screen coordinates
        const containerCenterX_Screen = containerRect.left + containerRect.width / 2;
        const containerCenterY_Screen = containerRect.top + containerRect.height / 2;
        
        // Calculate offset between element center and container center in screen space
        const offsetX_Screen = elementCenterX_Screen - containerCenterX_Screen;
        const offsetY_Screen = elementCenterY_Screen - containerCenterY_Screen;
        
        // Target zoom level
        const targetZoom = 3;
        
        // Convert screen offset to SVG coordinate space by removing current zoom effect
        const offsetX_SVG = offsetX_Screen / this.currentZoom;
        const offsetY_SVG = offsetY_Screen / this.currentZoom;
        
        // Calculate new translation to center the element at target zoom
        // We need to compensate for the offset at the new zoom level
        this.currentTranslate.x = this.currentTranslate.x - (offsetX_SVG * targetZoom);
        this.currentTranslate.y = this.currentTranslate.y - (offsetY_SVG * targetZoom);
        this.currentZoom = targetZoom;
        
        // Update transform with smooth animation
        this.updateTransform();
        
        // Highlight both text and shape elements with prominent styling
        if (textElement) {
            textElement.style.filter = 'drop-shadow(0 0 8px #FF6B35)';
            textElement.style.fontWeight = 'bold';
            textElement.classList.add('highlighted');
        }
        
        if (shapeElement) {
            // Store original values to restore later
            if (!shapeElement.dataset.originalFill) {
                shapeElement.dataset.originalFill = shapeElement.getAttribute('fill') || shapeElement.style.fill || 'none';
            }
            if (!shapeElement.dataset.originalStroke) {
                shapeElement.dataset.originalStroke = shapeElement.getAttribute('stroke') || shapeElement.style.stroke || 'none';
            }
            if (!shapeElement.dataset.originalFillOpacity) {
                shapeElement.dataset.originalFillOpacity = shapeElement.getAttribute('fill-opacity') || shapeElement.style.fillOpacity || '1';
            }
            
            // Highlight with colored stroke (don't change width)
            shapeElement.style.stroke = '#FF6B35';  // Bright orange border
            
            // Add semi-transparent overlay to fill area
            shapeElement.style.fill = '#FF6B35';  // Orange fill overlay
            shapeElement.style.fillOpacity = '0.3';  // Semi-transparent
            
            // Add pulsing animation via CSS class
            shapeElement.classList.add('highlighted');
        }
        
        this.selectedElement = elements;
        
        console.log(`Zoomed to ${itemId} at center (${elementCenterX_Screen.toFixed(0)}, ${elementCenterY_Screen.toFixed(0)})`);
    }

    highlightItem(itemId) {
        // Alias for zoomToItem for compatibility
        this.zoomToItem(itemId);
    }

    setItemClickCallback(callback) {
        this.onItemClick = callback;
    }

    filterItems(filteredItems) {
        // Optional: could dim/hide non-filtered items
        // For now, just log
        console.log(`Filtering to ${filteredItems.length} items`);
    }

    getMap() {
        return {
            svgElement: this.svgElement,
            container: this.container
        };
    }

    invalidateSize() {
        // For compatibility with Leaflet API
        console.log('SVG map size invalidated (no action needed for SVG)');
    }
}

// Export for global access
window.SVGMapManager = SVGMapManager;

