(function () {
  // ==================== KIOSK CLIENT ENTEGRASYONU ====================
  let kioskConfig = null;
  let lastConfigHash = null; // Önceki config'in hash'i
  let SLIDE_TRANSITION_DURATION = 8000; // Varsayılan geçiş süresi

  // Zamanlama tabanlı slide yönetimi
  let allSlides = [];              // Backend'den gelen tüm slide'lar (schedule dahil)
  let campaignSchedule = null;     // Kampanya seviyesi başlangıç/bitiş
  let activeSlidesSignature = null; // Aktif slide kümesinin imzası (değişim tespiti)
  let scheduleTicker = null;       // Periyodik yeniden değerlendirme zamanlayıcısı

  // Config değişiklik kontrolü için basit hash fonksiyonu (zamanlama dahil)
  function getConfigHash(config) {
    if (!config) return 'null';
    if (!config.landingPage) return 'no-landing-page';
    
    const lp = config.landingPage;
    const slidesHash = lp.slides
      ? lp.slides.map(s => `${s.imageUrl}#${s.description || ''}#${s.schedule?.startDate || ''}#${s.schedule?.endDate || ''}`).join('|')
      : '';
    const campSched = `${lp.schedule?.startDate || ''}~${lp.schedule?.endDate || ''}`;
    return `${lp.id || lp._id}-${lp.name}-${slidesHash}-${lp.transitionDuration}-${campSched}-${lp.displayMode || 'panel'}`;
  }

  // Bir zamanlama penceresi şu an aktif mi? (yerel saate göre)
  function isWithinSchedule(schedule) {
    if (!schedule) return true;
    const now = Date.now();
    if (schedule.startDate) {
      const s = new Date(schedule.startDate).getTime();
      if (!isNaN(s) && now < s) return false;
    }
    if (schedule.endDate) {
      const e = new Date(schedule.endDate).getTime();
      if (!isNaN(e) && now > e) return false;
    }
    return true;
  }

  // Şu an oynatılması gereken slide'lar (kampanya + slide zamanlamasına göre)
  function getActiveSlides() {
    if (!isWithinSchedule(campaignSchedule)) return [];
    return allSlides.filter(s => isWithinSchedule(s.schedule));
  }

  // Aktif slide kümesini uygula; değişmemişse dokunma (gereksiz yeniden kurmayı önler)
  function applyActiveSlides(force = false) {
    const active = getActiveSlides();
    const sig = active.map(s => `${s.imageUrl}@${s.description || ''}`).join('||');

    if (!force && sig === activeSlidesSignature) return;
    activeSlidesSignature = sig;

    if (active.length === 0) {
      // Süresi dolmuş / henüz başlamamış: offline olsa bile placeholder göster
      clearSlider();
      return;
    }

    isPlaceholderMode = false;
    updateSliderImages(active);
  }

  // Periyodik olarak zamanlamayı yeniden değerlendir (offline'da bile çalışır)
  function startScheduleTicker() {
    if (scheduleTicker) clearInterval(scheduleTicker);
    scheduleTicker = window.setInterval(() => applyActiveSlides(false), 30000);
  }

  function stopScheduleTicker() {
    if (scheduleTicker) {
      clearInterval(scheduleTicker);
      scheduleTicker = null;
    }
  }

  // Kiosk Client'ı başlat
  window.addEventListener('DOMContentLoaded', () => {
    if (typeof KioskClient !== 'undefined') {
      console.log('🚀 Kiosk Client başlatılıyor...');
      KioskClient.init({
        apiUrl: 'http://localhost:3000', // LOKAL TEST: production -> 'https://inmapper-kiosk-backend.isohtel.com.tr'
        pollInterval: 15000, // 15 saniyede bir kontrol (hızlı güncelleme için)
        onConfigLoaded: (config) => {
          // Config hash'ini hesapla
          const newHash = getConfigHash(config);
          
          // Değişiklik yoksa güncelleme yapma
          if (newHash === lastConfigHash) {
            console.log('📦 Config değişmedi, slider korunuyor');
            return;
          }
          
          console.log('📦 Config değişti:', lastConfigHash, '->', newHash);
          lastConfigHash = newHash;
          kioskConfig = config;
          
          if (config && config.landingPage && config.landingPage.slides && config.landingPage.slides.length > 0) {
            console.log('🎯 Landing page bulundu:', config.landingPage.name);
            console.log('📷 Slides:', config.landingPage.slides.length, 'adet (zamanlama uygulanacak)');
            console.log('🔗 isAssigned:', config.isAssigned);
            // Tüm slide'ları sakla; aktif olanları zamanlamaya göre uygula
            applyKioskConfiguration(config.landingPage);
          } else {
            // Landing page atanmamış veya hiç slide yok - slider'ı temizle
            console.log('⚠️ Bu cihaza uygun içerik yok, slider temizleniyor...');
            allSlides = [];
            campaignSchedule = null;
            activeSlidesSignature = null;
            stopScheduleTicker();
            applyDisplayMode('panel');
            clearSlider();
          }
        },
        onError: (error) => {
          console.error('❌ Kiosk Client hatası:', error);
          // Hata durumunda mevcut görüntüyü koru
        }
      });
    } else {
      console.error('❌ KioskClient tanımlı değil! kiosk-client.js yüklenmiş mi?');
    }
  });
  // ==================== KIOSK CLIENT ENTEGRASYONU SONU ====================

  const timeElement = document.getElementById('landingTime');
  const dateElement = document.getElementById('landingDate');
  const dayElement = document.getElementById('landingDay');
  const createRouteButton = document.getElementById('createRouteBtn');

  let originalSlides = Array.from(document.querySelectorAll('.slide'));
  let indicators = Array.from(document.querySelectorAll('.indicator'));
  const landingScreen = document.querySelector('.landing-screen');
  const glassPanel = document.querySelector('.glass-panel');
  const glassNavbar = document.querySelector('.glass-navbar');
  const fullscreenBg = document.getElementById('fullscreenBg');
  const filmStrip = document.getElementById('filmStrip');
  let currentIndex = 0;
  let slideTimer;
  let isTransitioning = false;
  let totalSlides = originalSlides.length;
  
  // Cache for precomputed colors for each slide
  let slideColorCache = {};
  
  // Canvas for brightness detection and color extraction
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  canvas.width = 100;
  canvas.height = 100;
  
  // Canvas for detailed color analysis
  const colorCanvas = document.createElement('canvas');
  const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });
  colorCanvas.width = 150;
  colorCanvas.height = 150;

  const timeFormatter = new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateFormatter = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'short',
  });

  const dayFormatter = new Intl.DateTimeFormat('en', { weekday: 'long' });

  function updateClock() {
    const now = new Date();
    if (timeElement) {
      timeElement.textContent = timeFormatter.format(now);
    }
    if (dateElement) {
      const formatted = dateFormatter.format(now).split(' ');
      const month = formatted[0];
      const day = formatted[1];
      dateElement.innerHTML = `<span class="month-day">${month} ${day}</span><span class="day">${dayFormatter.format(now)}</span>`;
    }
    if (dayElement) {
      dayElement.textContent = dayFormatter.format(now);
    }
  }


  function addPressFeedback(button) {
    if (!button) {
      return;
    }
    button.addEventListener('click', () => {
      button.classList.add('is-pressed');
      window.setTimeout(() => button.classList.remove('is-pressed'), 220);
    });
  }

  updateClock();
  window.setInterval(updateClock, 30 * 1000);

  addPressFeedback(createRouteButton);

  function extractDominantColors(imageUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        colorCtx.drawImage(img, 0, 0, colorCanvas.width, colorCanvas.height);
        const imageData = colorCtx.getImageData(0, 0, colorCanvas.width, colorCanvas.height);
        const data = imageData.data;
        
        // Collect color data with frequency
        const colorMap = {};
        let totalBrightness = 0;
        let pixelCount = 0;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          
          // Skip transparent pixels
          if (a < 128) continue;
          
          // Calculate brightness
          const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
          
          // Skip very dark colors (black and near-black colors)
          // Minimum brightness threshold: 50 (out of 255)
          if (brightness < 50) continue;
          
          totalBrightness += brightness;
          pixelCount++;
          
          // Quantize colors to reduce variety (group similar colors)
          const quantize = 32;
          const qR = Math.round(r / quantize) * quantize;
          const qG = Math.round(g / quantize) * quantize;
          const qB = Math.round(b / quantize) * quantize;
          
          const colorKey = `${qR},${qG},${qB}`;
          colorMap[colorKey] = (colorMap[colorKey] || 0) + 1;
        }
        
        const avgBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 128;
        
        // Sort colors by frequency and filter out very dark colors
        const sortedColors = Object.entries(colorMap)
          .map(entry => {
            const [r, g, b] = entry[0].split(',').map(Number);
            const colorBrightness = (0.299 * r + 0.587 * g + 0.114 * b);
            return { r, g, b, count: entry[1], brightness: colorBrightness };
          })
          .filter(color => color.brightness >= 50) // Filter out dark colors
          .sort((a, b) => b.count - a.count)
          .slice(0, 5); // Get top 5 colors
        
        // If no colors passed the filter, use medium gray
        const finalColors = sortedColors.length > 0 ? sortedColors : [
          { r: 120, g: 120, b: 120, count: 1, brightness: 120 }
        ];
        
        resolve({
          colors: finalColors,
          brightness: avgBrightness
        });
      };
      img.onerror = () => {
        resolve({
          colors: [{ r: 128, g: 128, b: 128, count: 1, brightness: 128 }],
          brightness: 128
        });
      };
      img.src = imageUrl;
    });
  }
  
  function createGradientForNavbar(colors, isDark) {
    if (!colors || colors.length === 0) {
      return 'linear-gradient(90deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.3))';
    }
    
    // Navbar: horizontal gradient from left to right, using first 3 colors
    const navColors = colors.slice(0, 3);
    const gradientStops = navColors.map((color, index) => {
      const { r, g, b } = color;
      const opacity = isDark ? 0.4 - (index * 0.06) : 0.35 - (index * 0.06);
      const position = (index / (navColors.length - 1)) * 100;
      return `rgba(${r}, ${g}, ${b}, ${opacity}) ${position}%`;
    });
    
    return `linear-gradient(90deg, ${gradientStops.join(', ')})`;
  }
  
  function createGradientForPanel(colors, isDark) {
    if (!colors || colors.length === 0) {
      return 'linear-gradient(180deg, rgba(100, 100, 100, 0.3), rgba(80, 80, 80, 0.3))';
    }
    
    // Panel: vertical gradient from top to bottom
    // Starts with navbar's end color (color[2]) to create seamless connection
    const panelColors = colors.length >= 5 ? colors.slice(2, 5) : colors.slice(Math.max(0, colors.length - 3));
    
    const gradientStops = panelColors.map((color, index) => {
      const { r, g, b } = color;
      const opacity = isDark ? 0.38 - (index * 0.06) : 0.33 - (index * 0.06);
      const position = (index / (panelColors.length - 1)) * 100;
      return `rgba(${r}, ${g}, ${b}, ${opacity}) ${position}%`;
    });
    
    return `linear-gradient(180deg, ${gradientStops.join(', ')})`;
  }
  
  function createFullGradientFromColors(colors, isDark) {
    if (!colors || colors.length === 0) {
      return 'linear-gradient(135deg, rgb(120, 120, 120), rgb(100, 100, 100))';
    }
    
    // Create a richer gradient for fullscreen background
    const numColors = Math.min(colors.length, 4);
    const gradientStops = colors.slice(0, numColors).map((color, index) => {
      let { r, g, b } = color;
      
      // Ensure minimum brightness - brighten if too dark
      const currentBrightness = (0.299 * r + 0.587 * g + 0.114 * b);
      if (currentBrightness < 60) {
        const brightenFactor = 60 / currentBrightness;
        r = Math.min(255, Math.round(r * brightenFactor));
        g = Math.min(255, Math.round(g * brightenFactor));
        b = Math.min(255, Math.round(b * brightenFactor));
      }
      
      // Adjust brightness for better visual
      const factor = isDark ? 1.3 : 0.95;
      const adjustedR = Math.min(255, Math.round(r * factor));
      const adjustedG = Math.min(255, Math.round(g * factor));
      const adjustedB = Math.min(255, Math.round(b * factor));
      
      const position = (index / (numColors - 1)) * 100;
      return `rgb(${adjustedR}, ${adjustedG}, ${adjustedB}) ${position}%`;
    });
    
    // Add lighter radial gradient overlay for depth (no dark overlay)
    return `radial-gradient(ellipse at top left, rgba(255, 255, 255, ${isDark ? 0.1 : 0.05}) 0%, transparent 100%), linear-gradient(135deg, ${gradientStops.join(', ')})`;
  }
  
  function updateContrastAndColors(brightness, colors, animated = false) {
    // Threshold: below 128 = dark background, above = light background
    const isDark = brightness < 128;
    
    // Enable smooth transitions during slide changes
    if (animated) {
      if (glassPanel) {
        glassPanel.classList.add('animating');
      }
      if (glassNavbar) {
        glassNavbar.classList.add('animating');
      }
      if (fullscreenBg) {
        fullscreenBg.classList.add('animating');
      }
    }
    
    if (glassPanel) {
      glassPanel.classList.remove('dark-bg', 'light-bg');
      glassPanel.classList.add(isDark ? 'dark-bg' : 'light-bg');
    }
    
    if (glassNavbar) {
      glassNavbar.classList.remove('dark-bg', 'light-bg');
      glassNavbar.classList.add(isDark ? 'dark-bg' : 'light-bg');
    }
    
    // Apply color gradients to panels
    // Create separate gradients for navbar (horizontal) and panel (vertical)
    const navbarGradient = createGradientForNavbar(colors, isDark);
    const panelGradient = createGradientForPanel(colors, isDark);
    
    if (glassPanel) {
      glassPanel.style.setProperty('--color-gradient', panelGradient);
    }
    
    if (glassNavbar) {
      glassNavbar.style.setProperty('--color-gradient', navbarGradient);
    }
    
    // Apply full gradient to fullscreen background
    const fullGradient = createFullGradientFromColors(colors, isDark);
    if (fullscreenBg) {
      fullscreenBg.style.background = fullGradient;
    }
    
    // Remove animating class after transition completes
    if (animated) {
      setTimeout(() => {
        if (glassPanel) {
          glassPanel.classList.remove('animating');
        }
        if (glassNavbar) {
          glassNavbar.classList.remove('animating');
        }
        if (fullscreenBg) {
          fullscreenBg.classList.remove('animating');
        }
      }, 800);
    }
  }
  
  function getSlideWidth() {
    const allSlides = filmStrip.querySelectorAll('.slide');
    return allSlides[0] ? allSlides[0].offsetWidth : 0;
  }
  
  function updateSlidePosition(transition = true) {
    if (!filmStrip) return;
    
    if (!transition) {
      filmStrip.style.transition = 'none';
    }
    
    const slideWidth = getSlideWidth();
    const offset = (currentIndex + 1) * slideWidth; // +1 for the prepended clone
    filmStrip.style.transform = `translateX(-${offset}px)`;
    
    if (!transition) {
      filmStrip.offsetHeight; // Force reflow
      filmStrip.style.transition = '';
    }
  }
  
  function updateIndicators() {
    indicators.forEach((indicator, index) => {
      indicator.classList.toggle('active', index === currentIndex);
    });
  }
  
  function analyzeColorsForIndex(index, animated = false) {
    const slideElement = originalSlides[index];
    if (slideElement) {
      const bgImage = slideElement.style.backgroundImage;
      const imageUrl = bgImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
      
      if (imageUrl) {
        // Check if colors are already cached
        if (slideColorCache[index]) {
          updateContrastAndColors(
            slideColorCache[index].brightness, 
            slideColorCache[index].colors,
            animated
          );
        } else {
          // Extract and cache colors
          extractDominantColors(imageUrl).then(result => {
            slideColorCache[index] = result;
            updateContrastAndColors(result.brightness, result.colors, animated);
          });
        }
      }
    }
  }
  
  function preloadNextSlideColors(index) {
    const nextIndex = (index + 1) % totalSlides;
    const slideElement = originalSlides[nextIndex];
    
    if (slideElement && !slideColorCache[nextIndex]) {
      const bgImage = slideElement.style.backgroundImage;
      const imageUrl = bgImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
      
      if (imageUrl) {
        extractDominantColors(imageUrl).then(result => {
          slideColorCache[nextIndex] = result;
        });
      }
    }
  }
  
  function goToSlide(index) {
    if (isTransitioning) return;
    
    isTransitioning = true;
    currentIndex = index;
    
    updateIndicators();
    updateSlidePosition(true);
    analyzeColorsForIndex(currentIndex, true); // Enable animation
    preloadNextSlideColors(currentIndex); // Preload next slide colors
    
    setTimeout(() => {
      isTransitioning = false;
    }, 100);
  }
  
  function nextSlide() {
    if (isTransitioning) return;
    
    isTransitioning = true;
    currentIndex++;
    
    updateIndicators();
    updateSlidePosition(true);
    
    // Check if we need to reset (reached the clone at the end)
    if (currentIndex >= totalSlides) {
      setTimeout(() => {
        currentIndex = 0;
        updateSlidePosition(false);
        analyzeColorsForIndex(currentIndex, false); // No animation on instant reset
        preloadNextSlideColors(currentIndex);
        isTransitioning = false;
      }, 800);
    } else {
      analyzeColorsForIndex(currentIndex, true); // Enable animation
      preloadNextSlideColors(currentIndex);
      setTimeout(() => {
        isTransitioning = false;
      }, 800);
    }
  }

  function startSlideShow() {
    if (slideTimer) {
      window.clearInterval(slideTimer);
    }
    // Dinamik geçiş süresi kullan
    slideTimer = window.setInterval(() => {
      nextSlide();
    }, SLIDE_TRANSITION_DURATION);
  }

  indicators.forEach((indicator, index) => {
    indicator.addEventListener('click', () => {
      goToSlide(index);
      startSlideShow();
    });
  });

  // Placeholder mode flag (global)
  let isPlaceholderMode = false;
  
  // Check if slides are placeholders
  const hasPlaceholderSlides = originalSlides.length > 0 && 
    originalSlides[0].classList.contains('placeholder-slide');
  
  if (originalSlides.length > 0 && filmStrip && !hasPlaceholderSlides) {
    // Clone first and last slides for infinite loop
    const firstClone = originalSlides[0].cloneNode(true);
    const lastClone = originalSlides[originalSlides.length - 1].cloneNode(true);
    
    firstClone.setAttribute('data-clone', 'true');
    lastClone.setAttribute('data-clone', 'true');
    
    // Prepend last slide, append first slide
    filmStrip.insertBefore(lastClone, filmStrip.firstChild);
    filmStrip.appendChild(firstClone);
    
    // Initialize
    currentIndex = 0;
    updateIndicators();
    updateSlidePosition(false);
    analyzeColorsForIndex(0, false); // No animation on initial load
    preloadNextSlideColors(0); // Preload next slide colors
    
    startSlideShow();
  } else if (hasPlaceholderSlides) {
    // Placeholder mode - hide indicators and don't start slideshow
    isPlaceholderMode = true;
    console.log('📋 Placeholder mode - waiting for content from backend');
    const slideIndicators = document.getElementById('slideIndicators');
    if (slideIndicators) {
      slideIndicators.style.display = 'none';
    }
    
    // Apply blue color palette to navbar and panel (matching routing screen)
    const placeholderColors = [
      { r: 30, g: 58, b: 138, count: 100, brightness: 60 },   // #1e3a8a - koyu mavi
      { r: 37, g: 99, b: 235, count: 80, brightness: 100 },   // #2563eb - ana mavi
      { r: 59, g: 130, b: 246, count: 60, brightness: 130 },  // #3b82f6 - açık mavi
      { r: 96, g: 165, b: 250, count: 40, brightness: 160 },  // #60a5fa - vurgu mavi
      { r: 147, g: 197, b: 253, count: 20, brightness: 190 }  // #93c5fd - parlak mavi
    ];
    const placeholderBrightness = 80; // Dark theme için düşük brightness
    
    updateContrastAndColors(placeholderBrightness, placeholderColors, false);
    console.log('🎨 Placeholder renk paleti uygulandı');
  }
  
  // Handle window resize to recalculate slide positions
  let resizeTimer;
  window.addEventListener('resize', () => {
    if (resizeTimer) {
      window.clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(() => {
      // Placeholder modunda transform'u sıfırda tut
      if (isPlaceholderMode) {
        const currentFilmStrip = document.getElementById('filmStrip');
        if (currentFilmStrip) {
          currentFilmStrip.style.transform = 'translateX(0)';
          currentFilmStrip.style.transition = 'none';
        }
        return;
      }
      updateSlidePosition(false);
    }, 150);
  });

  // ==================== KIOSK ENTEGRASYON FONKSİYONLARI ====================
  
  // Slider'ı temizle ve placeholder göster (landing page atanmamışsa)
  function clearSlider() {
    console.log('🧹 clearSlider çağrıldı');
    
    // Placeholder moduna geç
    isPlaceholderMode = true;
    
    // Slideshow'u durdur
    if (slideTimer) {
      window.clearInterval(slideTimer);
      slideTimer = null;
    }
    
    // Cihazın displayId'sini al
    let displayId = '';
    if (typeof KioskClient !== 'undefined' && KioskClient.displayId) {
      displayId = KioskClient.displayId;
    }
    
    // Placeholder mesajını oluştur
    const subtitleText = displayId 
      ? 'Yönetim panelinden aşağıda belirtilen cihaza görsel ekleyebilirsiniz'
      : 'Yönetim panelinden görsel ekleyebilirsiniz';
    
    // Placeholder HTML oluştur
    const placeholderHTML = `
      <div class="slide placeholder-slide">
        <div class="placeholder-content">
          <div class="placeholder-orbs">
            <div class="orb orb-1"></div>
            <div class="orb orb-2"></div>
            <div class="orb orb-3"></div>
          </div>
          <div class="placeholder-glass">
            <div class="placeholder-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
            <div class="placeholder-text">
              <span class="placeholder-title">İçerik Bekleniyor</span>
              <span class="placeholder-subtitle">${subtitleText}</span>
            </div>
            ${displayId ? `<div class="placeholder-device-id">${displayId}</div>` : ''}
            <div class="placeholder-loader">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>
    `;
    
    // filmStrip'i yeniden al (DOM değişmiş olabilir)
    const currentFilmStrip = document.getElementById('filmStrip');
    const slideshowContainer = document.querySelector('.slideshow-container');
    
    // Slider'ı placeholder ile değiştir
    if (currentFilmStrip) {
      console.log('✅ filmStrip bulundu, placeholder ekleniyor');
      currentFilmStrip.innerHTML = placeholderHTML;
      // Transform'u sıfırla - önemli!
      currentFilmStrip.style.transform = 'translateX(0)';
      currentFilmStrip.style.transition = 'none';
      
      // Slideshow container'ı görünür yap
      if (slideshowContainer) {
        slideshowContainer.style.opacity = '1';
        slideshowContainer.style.visibility = 'visible';
      }
      
      console.log('✅ Placeholder HTML eklendi ve transform sıfırlandı');
    } else {
      console.error('❌ filmStrip bulunamadı!');
    }
    
    // fullscreenBg'yi de mavi tonlarına ayarla
    const currentFullscreenBg = document.getElementById('fullscreenBg');
    if (currentFullscreenBg) {
      currentFullscreenBg.style.background = 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #3b82f6 100%)';
    }
    
    // Indicator'ları gizle
    const slideIndicators = document.getElementById('slideIndicators');
    if (slideIndicators) {
      slideIndicators.innerHTML = '';
      slideIndicators.style.display = 'none';
    }
    
    // Değişkenleri sıfırla
    originalSlides = [];
    indicators = [];
    totalSlides = 0;
    currentIndex = 0;
    slideColorCache = {};
    
    // Apply blue color palette to navbar and panel (matching routing screen)
    const placeholderColors = [
      { r: 30, g: 58, b: 138, count: 100, brightness: 60 },   // #1e3a8a - koyu mavi
      { r: 37, g: 99, b: 235, count: 80, brightness: 100 },   // #2563eb - ana mavi
      { r: 59, g: 130, b: 246, count: 60, brightness: 130 },  // #3b82f6 - açık mavi
      { r: 96, g: 165, b: 250, count: 40, brightness: 160 },  // #60a5fa - vurgu mavi
      { r: 147, g: 197, b: 253, count: 20, brightness: 190 }  // #93c5fd - parlak mavi
    ];
    const placeholderBrightness = 80; // Dark theme için düşük brightness
    
    updateContrastAndColors(placeholderBrightness, placeholderColors, true);
    
    // Parent frame'e (app-controller) placeholder durumunu gönder
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ 
        type: 'SLIDER_CONFIG_UPDATED', 
        data: { slides: [], isPlaceholder: true }
      }, '*');
      console.log('📤 Parent\'a placeholder SLIDER_CONFIG_UPDATED mesajı gönderildi');
    }
    
    console.log('✅ Placeholder gösteriliyor - navbar ve panel mavi tonlarında güncellendi');
  }
  
  // Yapılandırmayı uygula
  function applyKioskConfiguration(landingPage) {
    console.log('🔧 Yapılandırma uygulanıyor...', landingPage);

    // Tüm slide'ları ve kampanya zamanlamasını sakla
    allSlides = landingPage.slides || [];
    campaignSchedule = landingPage.schedule || null;
    activeSlidesSignature = null; // yeni config: imzayı sıfırla ki zorla uygulanabilsin

    // Geçiş süresini güncelle (slideshow, aktif slide'lar kurulurken başlar)
    if (landingPage.transitionDuration) {
      SLIDE_TRANSITION_DURATION = landingPage.transitionDuration;
    }

    // Görünüm modunu uygula (panel / fullscreen)
    applyDisplayMode(landingPage.displayMode || 'panel');

    // Zamanlama ticker'ını başlat ve aktif slide'ları hemen uygula
    startScheduleTicker();
    applyActiveSlides(true);
  }

  // Görünüm modunu uygula: 'panel' (varsayılan) veya 'fullscreen'
  // Tam ekran modunda navbar + yan panel gizlenir ve ekranın herhangi bir
  // yerine dokununca kiosk ana ekranına geçilir.
  let displayModeClickHandler = null;
  function applyDisplayMode(mode) {
    const fullscreen = mode === 'fullscreen';
    if (landingScreen) landingScreen.classList.toggle('fullscreen-mode', fullscreen);

    if (fullscreen) {
      if (!displayModeClickHandler && landingScreen) {
        displayModeClickHandler = () => goToKioskHome();
        landingScreen.addEventListener('click', displayModeClickHandler);
      }
    } else if (displayModeClickHandler && landingScreen) {
      landingScreen.removeEventListener('click', displayModeClickHandler);
      displayModeClickHandler = null;
    }
  }

  // Kiosk ana ekranına (rota oluşturma) geçiş bildirimi
  function goToKioskHome() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'CREATE_ROUTE' }, '*');
      console.log('📤 Parent\'a CREATE_ROUTE mesajı gönderildi (tam ekran dokunuş)');
    }
  }

  // Slider resimlerini güncelle
  function updateSliderImages(slides) {
    if (!filmStrip) return;
    
    console.log('🖼️ Slider resimleri güncelleniyor...', slides);
    
    // Parent frame'e (app-controller) slider config'ini gönder
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ 
        type: 'SLIDER_CONFIG_UPDATED', 
        data: { slides: slides }
      }, '*');
      console.log('📤 Parent\'a SLIDER_CONFIG_UPDATED mesajı gönderildi');
    }
    
    // Slideshow'u durdur
    if (slideTimer) {
      window.clearInterval(slideTimer);
    }
    
    // Mevcut slide'ları temizle
    filmStrip.innerHTML = '';
    
    // Yeni slide'ları ekle (açıklama varsa altta bant olarak gösterilir)
    slides.forEach(slide => {
      const slideDiv = document.createElement('div');
      slideDiv.className = 'slide';
      slideDiv.style.backgroundImage = `url('${slide.imageUrl}')`;
      if (slide.description) {
        const caption = document.createElement('div');
        caption.className = 'slide-caption';
        caption.textContent = slide.description;
        slideDiv.appendChild(caption);
      }
      filmStrip.appendChild(slideDiv);
    });
    
    // originalSlides ve totalSlides'ı güncelle
    originalSlides = Array.from(filmStrip.querySelectorAll('.slide'));
    totalSlides = originalSlides.length;
    
    // Indicator'ları güncelle
    updateIndicatorsForNewSlides(slides.length);
    
    // Slider'ı yeniden başlat
    reinitializeSlider();
    
    console.log('✅ Slider güncellendi:', slides.length, 'resim');
  }

  // Indicator'ları güncelle
  function updateIndicatorsForNewSlides(count) {
    const slideIndicators = document.getElementById('slideIndicators');
    if (!slideIndicators) return;
    
    slideIndicators.innerHTML = '';
    
    for (let i = 0; i < count; i++) {
      const indicator = document.createElement('button');
      indicator.className = 'indicator' + (i === 0 ? ' active' : '');
      indicator.setAttribute('data-index', i);
      indicator.innerHTML = '<span></span>';
      slideIndicators.appendChild(indicator);
    }
    
    // Indicator'ları güncelle ve event listener'ları ekle
    indicators = Array.from(slideIndicators.querySelectorAll('.indicator'));
    indicators.forEach((indicator, index) => {
      indicator.addEventListener('click', () => {
        goToSlide(index);
        startSlideShow();
      });
    });
  }

  // Geçiş süresini güncelle
  function updateTransitionDuration(duration) {
    console.log('⏱️ Geçiş süresi güncelleniyor:', duration, 'ms');
    
    SLIDE_TRANSITION_DURATION = duration;
    
    // Mevcut timer'ı durdur ve yeni süre ile başlat
    startSlideShow();
    
    console.log('✅ Geçiş süresi güncellendi');
  }

  // Slider'ı yeniden başlat
  function reinitializeSlider() {
    if (!filmStrip || !originalSlides || originalSlides.length === 0) return;
    
    console.log('🔄 Slider yeniden başlatılıyor...');
    
    // Color cache'i temizle
    slideColorCache = {};
    
    // Clone'ları oluştur
    const firstClone = originalSlides[0].cloneNode(true);
    const lastClone = originalSlides[originalSlides.length - 1].cloneNode(true);
    
    firstClone.setAttribute('data-clone', 'true');
    lastClone.setAttribute('data-clone', 'true');
    
    filmStrip.insertBefore(lastClone, filmStrip.firstChild);
    filmStrip.appendChild(firstClone);
    
    // Pozisyonu sıfırla
    currentIndex = 0;
    isTransitioning = false;
    
    updateIndicators();
    updateSlidePosition(false);
    analyzeColorsForIndex(0, false);
    preloadNextSlideColors(0);
    
    // Slideshow'u başlat
    startSlideShow();
    
    console.log('✅ Slider yeniden başlatıldı');
  }
  
  // ==================== KIOSK ENTEGRASYON FONKSİYONLARI SONU ====================

  // ==================== PARENT COMMUNICATION ====================
  
  // Parent frame'e landing hazır mesajı gönder
  function notifyParentReady() {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'LANDING_READY' }, '*');
      console.log('📤 Parent\'a LANDING_READY mesajı gönderildi');
    }
  }

  // Create Route butonuna tıklanınca parent'a bildir
  if (createRouteButton) {
    createRouteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('🎯 Create Route butonuna tıklandı');
      goToKioskHome();
    });
  }

  // Parent'dan gelen mesajları dinle
  window.addEventListener('message', (event) => {
    const { type, data } = event.data || {};
    
    switch (type) {
      case 'ACTIVATE':
        // Landing tekrar aktif olduğunda slide show'u yeniden başlat
        console.log('✅ Landing aktif edildi');
        startSlideShow();
        break;
        
      case 'INIT':
        console.log('✅ Parent\'dan INIT mesajı alındı', data);
        break;
        
      default:
        break;
    }
  });

  // Sayfa yüklendiğinde parent'a bildir
  if (document.readyState === 'complete') {
    notifyParentReady();
  } else {
    window.addEventListener('load', notifyParentReady);
  }
})();

