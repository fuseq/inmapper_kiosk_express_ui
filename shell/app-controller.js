/**
 * Zorlu Center Kiosk - Ana Uygulama Kontrolcüsü
 * Landing ve Navigasyon katmanlarını yönetir
 */

class KioskController {
    constructor() {
        this.config = {
            currentVersion: '1.0.0',
            navigationRefreshInterval: 10000, // 10 saniye (test için)
            idleTimeout: 120000, // 2 dakika boşta kalma süresi
            enableDebug: true, // Debug modunu açık tut
            enableNavigationRefresh: true // Navigasyon otomatik refresh
        };

        this.state = {
            landingReady: false,
            navigationReady: false,
            currentView: 'landing', // 'landing' veya 'navigation'
            lastActivity: Date.now(),
            navigationRefreshCount: 0,
            lastRefreshTime: null,
            currentSliderConfig: null // Slider config'ini sakla
        };

        this.elements = {
            landingLayer: document.getElementById('landingLayer'),
            landingFrame: document.getElementById('landingFrame'),
            navigationFrame: document.getElementById('navigationFrame'),
            updateOverlay: document.getElementById('updateOverlay'),
            debugInfo: document.getElementById('debugInfo')
        };

        this.timers = {
            navigationRefresh: null,
            idleCheck: null,
            activityUpdate: null
        };

        this.init();
    }

    init() {
        console.log('🚀 Kiosk Controller başlatılıyor...');
        
        // Message listener'ları kur
        this.setupMessageListeners();
        
        // Aktivite tracker'ı kur
        this.setupActivityTracker();
        
        // Navigasyon refresh mekanizmasını başlat
        this.setupNavigationRefresh();
        
        // Idle timeout kontrolünü başlat
        this.setupIdleTimeout();
        
        // Debug göstergesini aç
        if (this.config.enableDebug) {
            this.elements.debugInfo.classList.add('visible');
            this.startDebugUpdates();
        }
        
        // Klavye kısayollarını ayarla
        this.setupKeyboardShortcuts();

        console.log('✅ Kiosk Controller hazır');
    }

    // ==================== MESSAGE HANDLING ====================
    
    setupMessageListeners() {
        window.addEventListener('message', (event) => {
            const { type, data } = event.data || {};

            switch (type) {
                // Landing frame'den gelen mesajlar
                case 'LANDING_READY':
                    this.handleLandingReady();
                    break;

                case 'CREATE_ROUTE':
                case 'SHOW_NAVIGATION':
                    this.showNavigation();
                    break;

                // Slider config landing'den geldiğinde
                case 'SLIDER_CONFIG_UPDATED':
                    this.handleSliderConfigUpdate(data);
                    break;

                // Navigation frame'den gelen mesajlar
                case 'NAVIGATION_READY':
                    this.handleNavigationReady();
                    break;

                case 'BACK_TO_HOME':
                case 'SHOW_LANDING':
                    this.showLanding();
                    break;

                default:
                    break;
            }

            // Her mesajda aktiviteyi güncelle
            this.updateActivity();
        });
    }

    handleLandingReady() {
        console.log('✅ Landing hazır');
        this.state.landingReady = true;
        this.updateDebugStatus();
    }

    handleNavigationReady() {
        console.log('✅ Navigation hazır');
        this.state.navigationReady = true;
        this.updateDebugStatus();
        
        // Navigation hazır olduğunda mevcut slider config'i gönder
        if (this.state.currentSliderConfig) {
            this.sendSliderConfigToNavigation();
        }
    }

    handleSliderConfigUpdate(data) {
        console.log('🖼️ Slider config güncellendi:', data);
        this.state.currentSliderConfig = data;
        
        // Navigation hazırsa hemen gönder
        if (this.state.navigationReady) {
            this.sendSliderConfigToNavigation();
        }
    }

    sendSliderConfigToNavigation() {
        console.log('📤 Slider config navigation\'a gönderiliyor...');
        this.sendToNavigation('UPDATE_MINI_SLIDER', this.state.currentSliderConfig);
    }

    // ==================== VIEW SWITCHING ====================

    showNavigation() {
        console.log('🗺️  Navigasyona geçiliyor...');
        
        this.state.currentView = 'navigation';
        this.elements.landingLayer.classList.add('hidden');
        
        // Navigation frame'e mesaj gönder
        this.sendToNavigation('ACTIVATE', {});
        
        this.updateActivity();
        this.updateDebugStatus();
    }

    showLanding() {
        console.log('🏠 Landing sayfasına dönülüyor...');
        
        this.state.currentView = 'landing';
        this.elements.landingLayer.classList.remove('hidden');
        
        // Landing frame'e mesaj gönder
        this.sendToLanding('ACTIVATE', {});
        
        this.updateActivity();
        this.updateDebugStatus();
    }

    sendToLanding(type, data = {}) {
        if (this.elements.landingFrame && this.elements.landingFrame.contentWindow) {
            this.elements.landingFrame.contentWindow.postMessage({ type, data }, '*');
        }
    }

    sendToNavigation(type, data = {}) {
        if (this.elements.navigationFrame && this.elements.navigationFrame.contentWindow) {
            this.elements.navigationFrame.contentWindow.postMessage({ type, data }, '*');
        }
    }

    // ==================== NAVIGATION REFRESH ====================

    setupNavigationRefresh() {
        if (!this.config.enableNavigationRefresh) {
            console.log('ℹ️  Navigation auto-refresh devre dışı');
            return;
        }

        console.log(`🔄 Navigation refresh aktif (${this.config.navigationRefreshInterval / 1000}s)`);
        
        this.timers.navigationRefresh = setInterval(() => {
            // Sadece landing görünürken refresh yap (navigation arka planda)
            if (this.state.currentView === 'landing') {
                this.refreshNavigation();
            }
        }, this.config.navigationRefreshInterval);
    }

    refreshNavigation() {
        console.log('🔄 Navigation refresh ediliyor...');
        
        const currentSrc = this.elements.navigationFrame.src;
        const timestamp = Date.now();
        const newSrc = currentSrc.split('?')[0] + '?t=' + timestamp;
        
        this.elements.navigationFrame.src = newSrc;
        
        this.state.navigationRefreshCount++;
        this.state.lastRefreshTime = new Date();
        this.state.navigationReady = false; // Yüklenene kadar bekle
        
        this.updateDebugStatus();
    }

    // ==================== ACTIVITY TRACKING ====================

    setupActivityTracker() {
        // Tüm kullanıcı etkileşimlerini takip et
        const activityEvents = ['click', 'touchstart', 'touchmove', 'mousemove', 'keydown'];
        
        activityEvents.forEach(eventType => {
            document.addEventListener(eventType, () => {
                this.updateActivity();
            }, { passive: true });
        });

        console.log('👆 Aktivite tracker aktif');
    }

    updateActivity() {
        this.state.lastActivity = Date.now();
    }

    // ==================== IDLE TIMEOUT ====================

    setupIdleTimeout() {
        this.timers.idleCheck = setInterval(() => {
            const idleTime = Date.now() - this.state.lastActivity;
            
            // Eğer navigasyon görünürse ve idle timeout aşıldıysa
            if (this.state.currentView === 'navigation' && idleTime > this.config.idleTimeout) {
                console.log('⏰ Idle timeout - Landing sayfasına dönülüyor');
                this.showLanding();
            }
        }, 5000); // Her 5 saniyede kontrol et

        console.log(`⏱️  Idle timeout aktif (${this.config.idleTimeout / 1000}s)`);
    }

    // ==================== DEBUG ====================

    updateDebugStatus() {
        if (!this.config.enableDebug) return;

        const landingStatus = document.getElementById('landingStatus');
        const navStatus = document.getElementById('navStatus');
        const currentViewStatus = document.getElementById('currentViewStatus');
        const versionInfo = document.getElementById('versionInfo');
        const navRefreshStatus = document.getElementById('navRefreshStatus');

        if (landingStatus) {
            landingStatus.textContent = this.state.landingReady ? '✅ Hazır' : '⏳ Yükleniyor';
            landingStatus.style.color = this.state.landingReady ? '#10b981' : '#f59e0b';
        }

        if (navStatus) {
            navStatus.textContent = this.state.navigationReady ? '✅ Hazır' : '⏳ Yükleniyor';
            navStatus.style.color = this.state.navigationReady ? '#10b981' : '#f59e0b';
        }

        if (currentViewStatus) {
            currentViewStatus.textContent = this.state.currentView;
            currentViewStatus.style.color = this.state.currentView === 'landing' ? '#6366f1' : '#ec4899';
        }

        if (versionInfo) {
            versionInfo.textContent = this.config.currentVersion;
        }

        if (navRefreshStatus) {
            const refreshText = this.state.lastRefreshTime 
                ? `${this.state.navigationRefreshCount}x (Son: ${this.formatTime(this.state.lastRefreshTime)})`
                : 'Henüz yok';
            navRefreshStatus.textContent = refreshText;
        }
    }

    startDebugUpdates() {
        this.timers.activityUpdate = setInterval(() => {
            const lastActivityStatus = document.getElementById('lastActivityStatus');
            if (lastActivityStatus) {
                const idleTime = Date.now() - this.state.lastActivity;
                const idleSeconds = Math.floor(idleTime / 1000);
                lastActivityStatus.textContent = `${idleSeconds}s önce`;
                
                // Idle'a yaklaşıyorsa rengi değiştir
                if (idleSeconds > this.config.idleTimeout / 1000 - 10) {
                    lastActivityStatus.style.color = '#ef4444';
                } else if (idleSeconds > 30) {
                    lastActivityStatus.style.color = '#f59e0b';
                } else {
                    lastActivityStatus.style.color = '#10b981';
                }
            }
        }, 1000);
    }

    formatTime(date) {
        return date.toLocaleTimeString('tr-TR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    // ==================== KEYBOARD SHORTCUTS ====================

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Debug: D tuşu
            if (e.key === 'd' || e.key === 'D') {
                this.toggleDebug();
            }
            
            // Landing'e dön: H tuşu (Home)
            if (e.key === 'h' || e.key === 'H') {
                this.showLanding();
            }
            
            // Navigation'a geç: N tuşu
            if (e.key === 'n' || e.key === 'N') {
                this.showNavigation();
            }
            
            // Manual refresh: R tuşu
            if (e.key === 'r' || e.key === 'R') {
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.refreshNavigation();
                }
            }
        });

        console.log('⌨️  Klavye kısayolları aktif (D=Debug, H=Home, N=Nav, Ctrl+R=Refresh)');
    }

    toggleDebug() {
        this.config.enableDebug = !this.config.enableDebug;
        
        if (this.config.enableDebug) {
            this.elements.debugInfo.classList.add('visible');
            if (!this.timers.activityUpdate) {
                this.startDebugUpdates();
            }
            console.log('🔧 Debug modu AÇIK');
        } else {
            this.elements.debugInfo.classList.remove('visible');
            console.log('🔧 Debug modu KAPALI');
        }
    }

    // ==================== PUBLIC API ====================

    // Manuel kontrol için public metodlar
    forceRefreshNavigation() {
        this.refreshNavigation();
    }

    switchToLanding() {
        this.showLanding();
    }

    switchToNavigation() {
        this.showNavigation();
    }

    getState() {
        return { ...this.state };
    }

    // Cleanup
    destroy() {
        Object.values(this.timers).forEach(timer => {
            if (timer) clearInterval(timer);
        });
        console.log('🛑 Kiosk Controller kapatıldı');
    }
}

// ==================== INITIALIZE ====================

// Controller'ı başlat
const kioskController = new KioskController();

// Global erişim için window'a ekle (debugging için)
window.kioskController = kioskController;

// Sayfa kapatılırken temizlik
window.addEventListener('beforeunload', () => {
    kioskController.destroy();
});

console.log('💡 Global erişim: window.kioskController');
console.log('💡 Metodlar: forceRefreshNavigation(), switchToLanding(), switchToNavigation()');

