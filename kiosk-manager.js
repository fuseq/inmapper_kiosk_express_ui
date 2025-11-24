/**
 * Zorlu Center Kiosk - Main App Controller
 * Manages seamless transitions between landing page and navigation system
 * Handles version control and hot reloading
 */

class KioskApp {
    constructor() {
        this.config = {
            currentVersion: '1.0.0',
            checkInterval: 10000, // Check for updates every 10 seconds (for testing)
            updateDelay: 2000, // Delay before applying update
            enableDebug: true // Enable debug for web testing
        };

        this.state = {
            landingReady: false,
            navigationReady: false,
            currentView: 'landing', // 'landing' or 'navigation'
            isUpdating: false,
            lastActivity: Date.now()
        };

        this.frames = {
            landing: document.getElementById('landingFrame'),
            navigation: document.getElementById('navigationFrame')
        };

        this.elements = {
            updateOverlay: document.getElementById('updateOverlay'),
            debugInfo: document.getElementById('debugInfo'),
            landingStatus: document.getElementById('landingStatus'),
            navStatus: document.getElementById('navStatus'),
            versionInfo: document.getElementById('versionInfo')
        };

        this.init();
    }

    init() {
        if (this.config.enableDebug) console.log('🚀 Kiosk App Initializing...');
        
        // Setup message listeners
        this.setupMessageListeners();
        
        // Setup version checker
        this.setupVersionChecker();
        
        // Setup activity tracker
        this.setupActivityTracker();
        
        // Update debug info
        if (this.config.enableDebug) {
            this.elements.debugInfo.style.display = 'block';
            this.updateDebugInfo();
        }

        if (this.config.enableDebug) console.log('✅ Kiosk App Ready');
    }

    setupMessageListeners() {
        window.addEventListener('message', (event) => {
            const { type, data } = event.data || {};

            switch (type) {
                case 'LANDING_READY':
                    this.handleLandingReady();
                    break;

                case 'ROUTE_READY':
                    this.handleNavigationReady();
                    break;

                case 'ROUTE_ACTIVATED':
                    this.showNavigation();
                    break;

                case 'HIDE_ROUTE':
                    this.showLanding();
                    break;

                case 'CREATE_ROUTE':
                    this.showNavigation();
                    break;

                case 'VERSION_UPDATE':
                    this.handleVersionUpdate(data);
                    break;

                default:
                    break;
            }
        });
    }

    handleLandingReady() {
        if (this.config.enableDebug) console.log('✅ Landing page ready');
        this.state.landingReady = true;
        this.updateDebugInfo();
        
        // Send init message to landing
        this.sendToLanding('INIT', { version: this.config.currentVersion });
    }

    handleNavigationReady() {
        if (this.config.enableDebug) console.log('✅ Navigation ready');
        this.state.navigationReady = true;
        this.updateDebugInfo();
        
        // Send init message to navigation
        this.sendToNavigation('INIT', { version: this.config.currentVersion });
    }

    showNavigation() {
        if (this.config.enableDebug) console.log('🗺️ Switching to navigation view');
        this.state.currentView = 'navigation';
        this.frames.landing.classList.add('hidden');
        this.sendToNavigation('ROUTE_ACTIVATED', {});
        this.updateDebugInfo();
    }

    showLanding() {
        if (this.config.enableDebug) console.log('🏠 Switching to landing view');
        this.state.currentView = 'landing';
        this.frames.landing.classList.remove('hidden');
        this.updateDebugInfo();
    }

    sendToLanding(type, data = {}) {
        if (this.frames.landing && this.frames.landing.contentWindow) {
            this.frames.landing.contentWindow.postMessage({ type, data }, '*');
        }
    }

    sendToNavigation(type, data = {}) {
        if (this.frames.navigation && this.frames.navigation.contentWindow) {
            this.frames.navigation.contentWindow.postMessage({ type, data }, '*');
        }
    }

    setupVersionChecker() {
        // Check for updates periodically
        setInterval(() => {
            this.checkForUpdates();
        }, this.config.checkInterval);

        // Initial check after 5 seconds
        setTimeout(() => {
            this.checkForUpdates();
        }, 5000);
    }

    async checkForUpdates() {
        if (this.state.isUpdating) return;

        try {
            // Check version.json for updates
            const response = await fetch('version.json?' + Date.now());
            const versionData = await response.json();

            if (versionData.version !== this.config.currentVersion) {
                console.log(`📦 Update available: ${versionData.version}`);
                this.prepareUpdate(versionData);
            } else if (this.config.enableDebug) {
                console.log(`✓ Version up to date: ${this.config.currentVersion}`);
            }
        } catch (error) {
            // Silently fail - version.json might not exist or network error
            // Only log if debug is enabled
            if (this.config.enableDebug) {
                console.log('ℹ️ No version file found (this is okay)');
            }
        }
    }

    prepareUpdate(versionData) {
        // Only update when on landing page to avoid interruption
        if (this.state.currentView !== 'landing') {
            console.log('⏳ Update pending - waiting for landing view');
            return;
        }

        this.state.isUpdating = true;
        console.log(`🔄 Preparing update to ${versionData.version}`);

        // Show update overlay
        this.elements.updateOverlay.classList.add('active');

        // Wait a moment, then reload navigation frame
        setTimeout(() => {
            this.applyUpdate(versionData);
        }, this.config.updateDelay);
    }

    applyUpdate(versionData) {
        console.log(`✨ Applying update: ${versionData.version}`);
        
        // Reload navigation iframe with cache bust
        const navSrc = 'index.html?v=' + Date.now();
        this.frames.navigation.src = navSrc;

        // Update version
        this.config.currentVersion = versionData.version;

        // Wait for reload, then hide overlay
        setTimeout(() => {
            this.elements.updateOverlay.classList.remove('active');
            this.state.isUpdating = false;
            console.log('✅ Update completed');
            this.updateDebugInfo();
        }, 3000);
    }

    setupActivityTracker() {
        // Track user activity
        ['click', 'touchstart', 'mousemove'].forEach(event => {
            document.addEventListener(event, () => {
                this.state.lastActivity = Date.now();
            });
        });

        // Check for idle timeout (optional - for reset to landing)
        setInterval(() => {
            const idleTime = Date.now() - this.state.lastActivity;
            const idleTimeout = 120000; // 2 minutes

            if (idleTime > idleTimeout && this.state.currentView === 'navigation') {
                if (this.config.enableDebug) console.log('⏰ Idle timeout - returning to landing');
                this.showLanding();
            }
        }, 10000);
    }

    updateDebugInfo() {
        if (!this.config.enableDebug) return;

        this.elements.landingStatus.textContent = this.state.landingReady ? '✅ Ready' : '⏳ Loading';
        this.elements.navStatus.textContent = this.state.navigationReady ? '✅ Ready' : '⏳ Loading';
        this.elements.versionInfo.textContent = `${this.config.currentVersion} (${this.state.currentView})`;
    }

    // Public API for manual control
    forceUpdate() {
        console.log('🔄 Force update triggered');
        this.applyUpdate({ version: this.config.currentVersion + '-reload' });
    }

    switchView(view) {
        if (view === 'landing') {
            this.showLanding();
        } else if (view === 'navigation') {
            this.showNavigation();
        }
    }
}

// Initialize app
const app = new KioskApp();

// Expose to window for debugging
window.kioskApp = app;

