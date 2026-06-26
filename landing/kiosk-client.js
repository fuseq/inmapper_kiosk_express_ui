/**
 * Inmapper Kiosk Client
 * 
 * Bu dosyayı kiosk projenizdeki landing.html dosyasına dahil edin.
 * FingerprintJS ile cihaz kimliği oluşturur ve backend'den yapılandırma çeker.
 * 
 * Kullanım:
 * <script src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js"></script>
 * <script src="kiosk-client.js"></script>
 */

(function(window) {
  'use strict';

  const STORAGE_KEY = 'inmapper_kiosk_device';
  const CONFIG_CACHE_KEY = 'inmapper_kiosk_config';

  const KioskClient = {
    config: {
      apiUrl: 'https://inmapper-kiosk-backend.isohtel.com.tr',
      pollInterval: 15000, // 15 saniyede bir config kontrolü
      onConfigLoaded: null,
      onError: null
    },

    deviceId: null,
    fingerprint: null,
    displayId: null, // 6 haneli görüntüleme ID'si
    pollTimer: null,

    /**
     * Client'ı başlat
     * @param {Object} options - Yapılandırma seçenekleri
     */
    async init(options = {}) {
      this.config = { ...this.config, ...options };

      console.log('🔧 Inmapper Kiosk Client başlatılıyor...');
      console.log('📡 API URL:', this.config.apiUrl);

      try {
        // Önce localStorage'dan kayıtlı cihaz bilgisini kontrol et
        const savedDevice = this.loadFromStorage();
        
        if (savedDevice && savedDevice.deviceId && savedDevice.fingerprint) {
          console.log('💾 Kayıtlı cihaz bulundu:', savedDevice.deviceId, '(displayId:', savedDevice.displayId, ')');
          this.deviceId = savedDevice.deviceId;
          this.fingerprint = savedDevice.fingerprint;
          this.displayId = savedDevice.displayId;
          
          // Cihazı backend'e bildir (lastSeen güncelleme)
          await this.updateDevice();
        } else {
          // Yeni cihaz kaydı
          await this.initFingerprint();
          await this.registerDevice();
        }
        
        // Yapılandırmayı çek
        await this.loadConfig();
        
        // Periyodik kontrol başlat
        this.startPolling();

        console.log('✅ Kiosk Client başarıyla başlatıldı');
        console.log('📱 Device ID:', this.deviceId);
        console.log('🔑 Fingerprint:', this.fingerprint);
      } catch (error) {
        console.error('❌ Kiosk Client başlatılamadı:', error);
        if (this.config.onError) {
          this.config.onError(error);
        }
      }
    },

    /**
     * localStorage'dan cihaz bilgisini yükle
     */
    loadFromStorage() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : null;
      } catch (e) {
        console.warn('⚠️ localStorage okunamadı:', e);
        return null;
      }
    },

    /**
     * localStorage'a cihaz bilgisini kaydet
     */
    saveToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          deviceId: this.deviceId,
          fingerprint: this.fingerprint,
          displayId: this.displayId,
          savedAt: new Date().toISOString()
        }));
        console.log('💾 Cihaz bilgisi kaydedildi (displayId:', this.displayId, ')');
      } catch (e) {
        console.warn('⚠️ localStorage yazılamadı:', e);
      }
    },

    /**
     * FingerprintJS ile cihaz parmak izini oluştur
     */
    async initFingerprint() {
      console.log('🔍 Cihaz parmak izi oluşturuluyor...');

      if (typeof FingerprintJS === 'undefined') {
        throw new Error('FingerprintJS yüklenmemiş! CDN\'den yüklendiğinden emin olun.');
      }

      const fp = await FingerprintJS.load();
      const result = await fp.get();
      
      this.fingerprint = result.visitorId;
      console.log('✅ Fingerprint:', this.fingerprint);

      return this.fingerprint;
    },

    /**
     * Mevcut cihazı güncelle (lastSeen)
     */
    async updateDevice() {
      console.log('🔄 Cihaz güncelleniyor...');

      const deviceInfo = {
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        language: navigator.language,
        platform: navigator.platform,
        timestamp: new Date().toISOString()
      };

      try {
        const response = await fetch(`${this.config.apiUrl}/api/devices/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fingerprint: this.fingerprint,
            deviceInfo
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // deviceId veya displayId değişmiş olabilir
        let needsSave = false;
        if (data.device.id !== this.deviceId) {
          console.log('⚠️ Device ID değişti:', this.deviceId, '->', data.device.id);
          this.deviceId = data.device.id;
          needsSave = true;
        }
        if (data.device.displayId && data.device.displayId !== this.displayId) {
          console.log('📛 Display ID güncellendi:', this.displayId, '->', data.device.displayId);
          this.displayId = data.device.displayId;
          needsSave = true;
        }
        if (needsSave) {
          this.saveToStorage();
        }

        console.log('✅ Cihaz güncellendi:', this.deviceId, '(displayId:', this.displayId, ')');
        return data.device;
      } catch (error) {
        console.error('❌ Cihaz güncellenemedi:', error);
        // localStorage'ı temizle ve yeniden kayıt yap
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch(e) {}
        await this.initFingerprint();
        await this.registerDevice();
      }
    },

    /**
     * Cihazı backend'e kaydet
     */
    async registerDevice() {
      console.log('📝 Yeni cihaz kaydediliyor...');

      const deviceInfo = {
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        language: navigator.language,
        platform: navigator.platform,
        timestamp: new Date().toISOString()
      };

      try {
        const response = await fetch(`${this.config.apiUrl}/api/devices/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fingerprint: this.fingerprint,
            deviceInfo
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        this.deviceId = data.device.id;
        this.displayId = data.device.displayId;

        // localStorage'a kaydet
        this.saveToStorage();

        console.log('✅ Yeni cihaz kaydedildi:', this.deviceId, '(displayId:', this.displayId, ')');
        return data.device;
      } catch (error) {
        console.error('❌ Cihaz kaydedilemedi:', error);
        throw error;
      }
    },

    /**
     * Cihazın yapılandırmasını backend'den çek
     */
    async loadConfig() {
      if (!this.deviceId) {
        console.error('❌ Device ID yok, önce cihazı kaydedin!');
        return null;
      }

      console.log('📥 Yapılandırma yükleniyor...');

      try {
        const response = await fetch(`${this.config.apiUrl}/api/devices/${this.deviceId}/config`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('✅ Yapılandırma yüklendi:', data);

        // Başarılı config'i cache'le (offline çalışma + süre tabanlı self-expire için)
        this.saveConfigToCache(data);

        // Her zaman callback'i çağır (landingPage null olsa bile)
        // Bu sayede atama kaldırıldığında clearSlider() çalışabilir
        if (this.config.onConfigLoaded) {
          this.config.onConfigLoaded(data);
        }

        return data;
      } catch (error) {
        console.error('❌ Yapılandırma yüklenemedi:', error);

        // Offline / sunucuya ulaşılamıyor: cache'teki son config'i kullan.
        // landing.js, slide'ları yerel saate göre filtreleyip süresi dolanları
        // kaldıracağı için offline'da bile zamanlama doğru çalışır.
        const cached = this.loadConfigFromCache();
        if (cached) {
          console.warn('📦 Sunucuya ulaşılamadı, cache\'teki config kullanılıyor');
          if (this.config.onConfigLoaded) {
            this.config.onConfigLoaded(cached);
          }
          return cached;
        }

        if (this.config.onError) {
          this.config.onError(error);
        }
        throw error;
      }
    },

    /**
     * Config'i localStorage'a cache'le
     */
    saveConfigToCache(data) {
      try {
        localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({
          data,
          deviceId: this.deviceId,
          savedAt: new Date().toISOString()
        }));
      } catch (e) {
        console.warn('⚠️ Config cache yazılamadı:', e);
      }
    },

    /**
     * Cache'teki config'i yükle (sadece bu cihaza aitse)
     */
    loadConfigFromCache() {
      try {
        const raw = localStorage.getItem(CONFIG_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed.deviceId && parsed.deviceId !== this.deviceId) return null;
        return parsed.data || null;
      } catch (e) {
        console.warn('⚠️ Config cache okunamadı:', e);
        return null;
      }
    },

    /**
     * Periyodik yapılandırma kontrolü başlat
     */
    startPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }

      console.log(`🔄 Periyodik kontrol başlatıldı (${this.config.pollInterval}ms)`);

      this.pollTimer = setInterval(() => {
        this.loadConfig();
      }, this.config.pollInterval);
    },

    /**
     * Periyodik kontrolü durdur
     */
    stopPolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
        console.log('⏸️ Periyodik kontrol durduruldu');
      }
    },

    /**
     * Yapılandırmayı manuel olarak yeniden yükle
     */
    async refresh() {
      console.log('🔄 Manuel yenileme...');
      return await this.loadConfig();
    },

    /**
     * Client bilgilerini al
     */
    getInfo() {
      return {
        deviceId: this.deviceId,
        fingerprint: this.fingerprint,
        displayId: this.displayId,
        apiUrl: this.config.apiUrl
      };
    }
  };

  // Global scope'a ekle
  window.KioskClient = KioskClient;

  // Sayfa yüklendiğinde otomatik başlat (opsiyonel)
  // Eğer manuel kontrol isterseniz bu satırı kaldırın
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      console.log('📌 Kiosk Client otomatik başlatma hazır. KioskClient.init() çağrısı yapın.');
    });
  }

})(window);

