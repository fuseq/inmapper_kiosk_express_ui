// Leaflet map management with optimized Canvas markers

// Extend L.Canvas to include custom 6-point star marker
L.Canvas.include({
    _updateMarker6Point: function (layer) {
        if (!this._drawing || layer._empty()) { return; }

        var p = layer._point,
            ctx = this._ctx,
            r = Math.max(Math.round(layer._radius), 1);

        this._drawnLayers[layer._leaflet_id] = layer;

        ctx.beginPath();
        ctx.moveTo(p.x + r, p.y);
        ctx.lineTo(p.x + 0.43 * r, p.y + 0.25 * r);
        ctx.lineTo(p.x + 0.50 * r, p.y + 0.87 * r);
        ctx.lineTo(p.x, p.y + 0.50 * r);
        ctx.lineTo(p.x - 0.50 * r, p.y + 0.87 * r);
        ctx.lineTo(p.x - 0.43 * r, p.y + 0.25 * r);
        ctx.lineTo(p.x - r, p.y);
        ctx.lineTo(p.x - 0.43 * r, p.y - 0.25 * r);
        ctx.lineTo(p.x - 0.50 * r, p.y - 0.87 * r);
        ctx.lineTo(p.x, p.y - 0.50 * r);
        ctx.lineTo(p.x + 0.50 * r, p.y - 0.87 * r);
        ctx.lineTo(p.x + 0.43 * r, p.y - 0.25 * r);
        ctx.closePath();
        this._fillStroke(ctx, layer);
    },

    _updateMarkerCircle: function (layer) {
        if (!this._drawing || layer._empty()) { return; }

        var p = layer._point,
            ctx = this._ctx,
            r = Math.max(Math.round(layer._radius), 1);

        this._drawnLayers[layer._leaflet_id] = layer;

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2, false);
        this._fillStroke(ctx, layer);
    }
});

// Custom 6-point marker class
var Marker6Point = L.CircleMarker.extend({
    _updatePath: function () {
        this._renderer._updateMarker6Point(this);
    }
});

// Custom circle marker class
var MarkerCircle = L.CircleMarker.extend({
    _updatePath: function () {
        this._renderer._updateMarkerCircle(this);
    }
});

export class LeafletMapManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.markers = [];
        this.markerLayer = null;
        this.renderer = null;
        this.onMarkerClick = null;
        this.svgOverlay = null;
        this.svgBounds = null;
        this.svgWidth = 0;
        this.svgHeight = 0;
        this.svgViewBoxMinX = 0;
        this.svgViewBoxMinY = 0;
    }

    async initialize() {
        // Create canvas renderer for better performance
        this.renderer = L.canvas({ padding: 0.5 });

        // Initialize map with CRS.Simple for non-geographical images
        this.map = L.map(this.containerId, {
            crs: L.CRS.Simple,
            minZoom: -3,
            maxZoom: 3,
            zoomControl: true,
            attributionControl: false,
            preferCanvas: true,
            zoomSnap: 0.25,
            zoomDelta: 0.5,
            wheelPxPerZoomLevel: 120
        });

        // Load and add SVG overlay
        await this.loadSVGOverlay('./public/assets/0.svg');

        // Create feature group for markers
        this.markerLayer = L.featureGroup().addTo(this.map);

        console.log('Leaflet map with SVG overlay initialized successfully');
        return this.map;
    }

    async loadSVGOverlay(svgPath) {
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
            
            // Parse SVG to get dimensions
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgElement = svgDoc.querySelector('svg');
            
            if (!svgElement) {
                throw new Error('Invalid SVG file');
            }

            // Get SVG dimensions from viewBox or width/height
            let width, height, viewBoxMinX = 0, viewBoxMinY = 0;
            const viewBox = svgElement.getAttribute('viewBox');
            
            if (viewBox) {
                const parts = viewBox.split(/\s+|,/);
                viewBoxMinX = parseFloat(parts[0]) || 0;
                viewBoxMinY = parseFloat(parts[1]) || 0;
                width = parseFloat(parts[2]);
                height = parseFloat(parts[3]);
            } else {
                width = parseFloat(svgElement.getAttribute('width')) || 1000;
                height = parseFloat(svgElement.getAttribute('height')) || 1000;
            }

            console.log(`SVG viewBox: minX=${viewBoxMinX}, minY=${viewBoxMinY}, width=${width}, height=${height}`);

            // Convert SVG to data URL
            const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
            const svgUrl = URL.createObjectURL(svgBlob);

            // Store original SVG dimensions and viewBox offsets
            this.svgWidth = width;
            this.svgHeight = height;
            this.svgViewBoxMinX = viewBoxMinX;
            this.svgViewBoxMinY = viewBoxMinY;
            
            // Define bounds for the SVG overlay
            // Leaflet CRS.Simple uses [lat, lng] = [y, x] coordinates
            // SVG: top-left (0,0) to bottom-right (width, height)
            // Leaflet bounds: [[south, west], [north, east]] = [[top, left], [bottom, right]]
            // We map SVG viewBox to Leaflet [0, 0] to [height, width]
            this.svgBounds = [[0, 0], [height, width]];

            // Add SVG as image overlay
            this.svgOverlay = L.imageOverlay(svgUrl, this.svgBounds, {
                opacity: 1,
                interactive: false,
                className: 'svg-overlay'
            }).addTo(this.map);

            // Fit map to SVG bounds with padding
            this.map.fitBounds(this.svgBounds, {
                padding: [20, 20],
                animate: false
            });
            
            // Set max bounds with some padding to prevent scrolling too far
            const paddingPercent = 0.2;
            this.map.setMaxBounds([
                [0 - height * paddingPercent, 0 - width * paddingPercent],
                [height + height * paddingPercent, width + width * paddingPercent]
            ]);

            console.log('SVG overlay loaded successfully');
            
            // Store SVG element for later analysis
            this.svgElement = svgElement;
            this.svgDimensions = { width, height };

        } catch (error) {
            console.error('Error loading SVG:', error);
            
            // Create fallback
            this.createFallbackOverlay();
        }
    }

    createFallbackOverlay() {
        // Create a simple placeholder SVG
        const fallbackSvg = `
            <svg viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
                <rect width="1000" height="600" fill="#f8f9fa" stroke="#ddd" stroke-width="2"/>
                <text x="500" y="280" text-anchor="middle" fill="#666" font-size="24" font-family="Arial">
                    Floor Plan Not Found
                </text>
                <text x="500" y="320" text-anchor="middle" fill="#999" font-size="16" font-family="Arial">
                    Place your 0.svg file in /public/assets/ or /assets/
                </text>
            </svg>
        `;

        const svgBlob = new Blob([fallbackSvg], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);

        const width = 1000;
        const height = 600;
        this.svgWidth = width;
        this.svgHeight = height;
        this.svgViewBoxMinX = 0;
        this.svgViewBoxMinY = 0;
        this.svgBounds = [[0, 0], [height, width]];
        this.svgOverlay = L.imageOverlay(svgUrl, this.svgBounds, {
            opacity: 1,
            interactive: false
        }).addTo(this.map);

        this.map.fitBounds(this.svgBounds, {
            padding: [20, 20],
            animate: false
        });
        
        this.svgDimensions = { width, height };
    }

    addMarkers(items, categoryColors) {
        // Clear existing markers
        this.clearMarkers();

        if (!items || items.length === 0) {
            console.warn('No items to add to map');
            return;
        }

        if (!this.svgDimensions) {
            console.warn('SVG not loaded yet');
            return;
        }

        const { width, height } = this.svgDimensions;

        // Add markers for each item
        items.forEach((item, index) => {
            const color = categoryColors[item.category] || '#95a5a6';
            
            // Use actual coordinates from SVG if available
            let leafletLat, leafletLng;
            if (item.coordinates) {
                // SVG coordinates to Leaflet CRS.Simple
                // SVG viewBox may have offset (minX, minY), we need to normalize
                // SVG: (x, y) in viewBox coordinate system
                // Leaflet: [lat, lng] starting from [0, 0]
                
                // Normalize coordinates by subtracting viewBox offset
                const normalizedX = item.coordinates.x - (this.svgViewBoxMinX || 0);
                const normalizedY = item.coordinates.y - (this.svgViewBoxMinY || 0);
                
                // Map to Leaflet: SVG x → lng, SVG y → lat
                leafletLat = normalizedY;
                leafletLng = normalizedX;
                
                console.log(`Marker for ${item.id}: SVG(${item.coordinates.x.toFixed(1)}, ${item.coordinates.y.toFixed(1)}) -> Normalized(${normalizedX.toFixed(1)}, ${normalizedY.toFixed(1)}) -> Leaflet[${leafletLat.toFixed(1)}, ${leafletLng.toFixed(1)}]`);
            } else {
                // Fallback to random positions
                leafletLat = Math.random() * height;
                leafletLng = Math.random() * width;
                console.warn(`No coordinates for ${item.id}, using random position`);
            }

            // Create marker using optimized Canvas rendering
            const marker = new MarkerCircle([leafletLat, leafletLng], {
                renderer: this.renderer,
                radius: 12,
                fillColor: color,
                fillOpacity: 0.9,
                color: '#ffffff',
                weight: 3,
                opacity: 1
            });

            // Add popup
            const popupContent = `
                <div class="marker-popup">
                    <div class="popup-category" style="background-color: ${color};">
                        ${item.category.toUpperCase()}
                    </div>
                    <h4>${item.title}</h4>
                    <p><strong>Floor:</strong> ${item.floor}</p>
                    ${item.location ? `<p><strong>Location:</strong> ${item.location}</p>` : ''}
                </div>
            `;

            marker.bindPopup(popupContent, {
                maxWidth: 250,
                className: 'custom-popup'
            });

            // Add click event
            marker.on('click', () => {
                if (this.onMarkerClick) {
                    this.onMarkerClick(item);
                }
            });

            // Add hover effect
            marker.on('mouseover', function() {
                this.setStyle({
                    radius: 18,
                    weight: 4,
                    fillOpacity: 1
                });
            });

            marker.on('mouseout', function() {
                this.setStyle({
                    radius: 12,
                    weight: 3,
                    fillOpacity: 0.9
                });
            });

            // Store coordinates with marker
            marker.itemCoordinates = item.coordinates;
            marker.itemBounds = item.bounds;

            // Add to layer
            marker.addTo(this.markerLayer);
            this.markers.push({ marker, item });
        });

        console.log(`Added ${items.length} markers to SVG floor plan`);
    }

    clearMarkers() {
        if (this.markerLayer) {
            this.markerLayer.clearLayers();
        }
        this.markers = [];
    }

    filterMarkers(filteredItems) {
        // Hide all markers first
        this.markers.forEach(({ marker }) => {
            marker.remove();
        });

        // Show only filtered markers
        this.markers.forEach(({ marker, item }) => {
            const isVisible = filteredItems.some(filteredItem => filteredItem.id === item.id);
            if (isVisible) {
                marker.addTo(this.markerLayer);
            }
        });

        // Adjust view to show visible markers if any
        const visibleLayers = this.markerLayer.getLayers();
        if (visibleLayers.length > 0 && visibleLayers.length < this.markers.length) {
            // Only some markers visible, zoom to them
            const bounds = this.markerLayer.getBounds();
            this.map.fitBounds(bounds, {
                padding: [80, 80],
                maxZoom: 0.5,
                animate: true
            });
        } else if (this.svgBounds) {
            // All markers visible or no filter, show full SVG
            this.map.fitBounds(this.svgBounds, {
                padding: [20, 20],
                animate: true
            });
        }
    }

    highlightMarker(itemId) {
        const markerData = this.markers.find(({ item }) => item.id === itemId);
        if (markerData) {
            const { marker, item } = markerData;
            
            // Get marker position
            const markerLatLng = marker.getLatLng();
            
            // Calculate appropriate zoom level based on item bounds
            let targetZoom = 1; // Default zoom
            
            if (item.bounds) {
                const bounds = item.bounds;
                const boundsWidth = bounds.maxX - bounds.minX;
                const boundsHeight = bounds.maxY - bounds.minY;
                const maxDimension = Math.max(boundsWidth, boundsHeight);
                
                // Calculate zoom based on size
                if (maxDimension < 50) {
                    targetZoom = 2;
                } else if (maxDimension < 100) {
                    targetZoom = 1.5;
                } else if (maxDimension < 200) {
                    targetZoom = 1;
                } else {
                    targetZoom = 0.5;
                }
            }
            
            console.log(`Highlighting marker ${itemId} at [${markerLatLng.lat}, ${markerLatLng.lng}] with zoom ${targetZoom}`);
            
            // Zoom to marker with smooth animation from current position
            this.map.setView(markerLatLng, targetZoom, {
                animate: true,
                duration: 0.8
            });

            // Open popup after a short delay
            setTimeout(() => {
                marker.openPopup();
            }, 400);

            // Highlight effect
            marker.setStyle({
                radius: 20,
                weight: 5,
                fillOpacity: 1
            });

            setTimeout(() => {
                marker.setStyle({
                    radius: 12,
                    weight: 3,
                    fillOpacity: 0.9
                });
            }, 2500);
        } else {
            console.warn(`Marker not found for item: ${itemId}`);
        }
    }

    setMarkerClickCallback(callback) {
        this.onMarkerClick = callback;
    }

    getMap() {
        return this.map;
    }

    invalidateSize() {
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        }
    }
}

// Export for global access
window.LeafletMapManager = LeafletMapManager;
window.Marker6Point = Marker6Point;
window.MarkerCircle = MarkerCircle;

