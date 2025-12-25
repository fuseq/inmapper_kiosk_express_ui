(function () {
  const timeElement = document.getElementById('landingTime');
  const dateElement = document.getElementById('landingDate');
  const dayElement = document.getElementById('landingDay');
  const createRouteButton = document.getElementById('createRouteBtn');

  const originalSlides = Array.from(document.querySelectorAll('.slide'));
  const indicators = Array.from(document.querySelectorAll('.indicator'));
  const glassPanel = document.querySelector('.glass-panel');
  const fullscreenBg = document.getElementById('fullscreenBg');
  const panelPreview = document.getElementById('panelPreview');
  const filmStrip = document.getElementById('filmStrip');
  const slideshowContainer = document.querySelector('.slideshow-container');
  const slideIndicators = document.getElementById('slideIndicators');
  const routeIframe = document.getElementById('routeIframe');
  let currentIndex = 0;
  let slideTimer;
  let isTransitioning = false;
  let isPanelExpanded = false;
  const totalSlides = originalSlides.length;
  
  // Canvas for brightness detection and color extraction
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 100;
  canvas.height = 100;
  
  // Canvas for detailed color analysis
  const colorCanvas = document.createElement('canvas');
  const colorCtx = colorCanvas.getContext('2d');
  colorCanvas.width = 150;
  colorCanvas.height = 150;

  const timeFormatter = new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dateFormatter = new Intl.DateTimeFormat('en', {
    day: 'numeric',
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
      dateElement.innerHTML = `<span class="month-day">${month.toUpperCase()} ${day}</span>`;
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

  // Handle Create Route button click - expand panel
  if (createRouteButton) {
    createRouteButton.addEventListener('click', () => {
      togglePanelExpansion();
    });
  }
  
  // Function to toggle panel expansion
  function togglePanelExpansion() {
    isPanelExpanded = !isPanelExpanded;
    
    if (isPanelExpanded) {
      // Step 1: Fade out content first (0.3s)
      glassPanel.querySelector('.glass-content').style.opacity = '0';
      
      // Step 2: After content fades, show iframe and expand panel
      setTimeout(() => {
        // Show and prepare iframe
        if (routeIframe) {
          routeIframe.style.display = 'block';
          // Small delay to ensure display change is applied
          setTimeout(() => {
            routeIframe.classList.add('visible');
          }, 50);
        }
        
        // Expand panel to full screen (removes blur)
        glassPanel.classList.add('expanded');
        panelPreview.classList.add('expanded');
        slideshowContainer.classList.add('hidden');
        slideIndicators.classList.add('hidden');
        
        // Step 3: After iframe is visible and panel expanded, completely hide the panel
        setTimeout(() => {
          glassPanel.classList.add('hidden');
          panelPreview.classList.add('hidden');
        }, 600); // Wait for expansion animation to complete
        
        // Pause slideshow when expanded
        if (slideTimer) {
          window.clearInterval(slideTimer);
        }
      }, 300);
      
    } else {
      // Collapse: reverse the process
      
      // Show panel and preview again
      glassPanel.classList.remove('hidden');
      panelPreview.classList.remove('hidden');
      
      // Hide iframe first
      if (routeIframe) {
        routeIframe.classList.remove('visible');
      }
      
      // Remove expanded state
      glassPanel.classList.remove('expanded');
      panelPreview.classList.remove('expanded');
      slideshowContainer.classList.remove('hidden');
      slideIndicators.classList.remove('hidden');
      
      // Fade content back in
      setTimeout(() => {
        glassPanel.querySelector('.glass-content').style.opacity = '1';
        
        // Hide iframe after transition
        setTimeout(() => {
          if (routeIframe) {
            routeIframe.style.display = 'none';
          }
        }, 300);
      }, 100);
      
      // Resume slideshow
      startSlideShow();
    }
  }

  // Listen for messages from parent
  window.addEventListener('message', (event) => {
    const { type, data } = event.data || {};
    
    switch (type) {
      case 'INIT':
        // Parent initialized
        console.log('Landing page initialized by parent');
        // Notify parent that landing is ready
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: 'LANDING_READY',
            data: {}
          }, '*');
        }
        break;
        
      case 'LANDING_ACTIVATED':
        // Landing page is now visible
        console.log('Landing page activated');
        break;
        
      default:
        break;
    }
  });

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
  
  function updatePanelPreview(nextIndex) {
    if (!panelPreview || !originalSlides[nextIndex]) return;
    
    const nextSlide = originalSlides[nextIndex];
    const bgImage = nextSlide.style.backgroundImage;
    const imageUrl = bgImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
    
    if (imageUrl) {
      panelPreview.style.backgroundImage = `url('${imageUrl}')`;
      
      // Analyze colors for text contrast
      extractDominantColors(imageUrl).then(result => {
        updateTextColors(result.colors);
      });
    }
  }
  
  function updateTextColors(colors) {
    if (!glassPanel) return;
    
    // Always use white text colors
    const primary = '#ffffff';
    const secondary = 'rgba(255, 255, 255, 0.95)';
    const tertiary = 'rgba(255, 255, 255, 0.85)';
    
    // Apply white text colors as CSS variables
    glassPanel.style.setProperty('--text-primary', primary);
    glassPanel.style.setProperty('--text-secondary', secondary);
    glassPanel.style.setProperty('--text-tertiary', tertiary);
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
  
  function updateContrastAndColors(brightness, colors) {
    // Threshold: below 128 = dark background, above = light background
    const isDark = brightness < 128;
    
    if (glassPanel) {
      glassPanel.classList.remove('dark-bg', 'light-bg');
      glassPanel.classList.add(isDark ? 'dark-bg' : 'light-bg');
    }
    
    // Apply full gradient to fullscreen background
    const fullGradient = createFullGradientFromColors(colors, isDark);
    if (fullscreenBg) {
      fullscreenBg.style.background = fullGradient;
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
  
  function analyzeColorsForIndex(index) {
    const slideElement = originalSlides[index];
    if (slideElement) {
      const bgImage = slideElement.style.backgroundImage;
      const imageUrl = bgImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
      
      if (imageUrl) {
        extractDominantColors(imageUrl).then(result => {
          updateContrastAndColors(result.brightness, result.colors);
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
    analyzeColorsForIndex(currentIndex);
    
    // Update panel preview with next slide
    const nextIndex = (currentIndex + 1) % totalSlides;
    updatePanelPreview(nextIndex);
    
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
        analyzeColorsForIndex(currentIndex);
        
        // Update panel preview
        const nextIndex = (currentIndex + 1) % totalSlides;
        updatePanelPreview(nextIndex);
        
        isTransitioning = false;
      }, 800);
    } else {
      analyzeColorsForIndex(currentIndex);
      
      // Update panel preview
      const nextIndex = (currentIndex + 1) % totalSlides;
      updatePanelPreview(nextIndex);
      
      setTimeout(() => {
        isTransitioning = false;
      }, 800);
    }
  }

  function startSlideShow() {
    if (slideTimer) {
      window.clearInterval(slideTimer);
    }
    slideTimer = window.setInterval(() => {
      nextSlide();
    }, 8000);
  }

  indicators.forEach((indicator, index) => {
    indicator.addEventListener('click', () => {
      goToSlide(index);
      startSlideShow();
    });
  });

  if (originalSlides.length > 0 && filmStrip) {
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
    analyzeColorsForIndex(0);
    
    // Initialize panel preview with next slide (slide 1)
    updatePanelPreview(1);
    
    // Also initialize text colors with current slide
    const currentSlide = originalSlides[0];
    const bgImage = currentSlide.style.backgroundImage;
    const imageUrl = bgImage.replace(/url\(['"]?(.*?)['"]?\)/, '$1');
    if (imageUrl) {
      extractDominantColors(imageUrl).then(result => {
        updateTextColors(result.colors);
      });
    }
    
    startSlideShow();
  }
  
  // Handle window resize to recalculate slide positions
  let resizeTimer;
  window.addEventListener('resize', () => {
    if (resizeTimer) {
      window.clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(() => {
      updateSlidePosition(false);
    }, 150);
  });

  // ===================================================
  // INMAPPER KIOSK CLIENT - Backend Entegrasyonu
  // ===================================================
  
  // Kiosk Client'ı başlat
  if (typeof KioskClient !== 'undefined') {
    KioskClient.init({
      apiUrl: 'https://inmapper-kiosk-backend.isohtel.com.tr',
      pollInterval: 60000, // 1 dakikada bir güncelleme kontrolü
      
      onConfigLoaded: (config) => {
        console.log('✅ inMapper yapılandırması yüklendi:', config);
        
        if (config.landingPage && config.landingPage.slides && config.landingPage.slides.length > 0) {
          // Slider görsellerini güncelle
          updateSliderFromBackend(config.landingPage.slides);
          
          // Geçiş süresini güncelle
          if (config.landingPage.transitionDuration) {
            window.SLIDE_DURATION = config.landingPage.transitionDuration;
          }
        }
      },
      
      onError: (error) => {
        console.error('❌ Kiosk Client hatası:', error);
      }
    });
  } else {
    console.warn('⚠️ KioskClient bulunamadı');
  }
  
  // Backend'den gelen slider verilerini uygula
  function updateSliderFromBackend(slides) {
    if (!filmStrip || slides.length === 0) return;
    
    console.log('🖼️ Slider güncelleniyor:', slides.length, 'görsel');
    
    // Mevcut slide'ları temizle
    filmStrip.innerHTML = '';
    
    // Yeni slide'ları ekle
    slides.forEach((slide, index) => {
      const slideDiv = document.createElement('div');
      slideDiv.className = 'slide';
      slideDiv.style.backgroundImage = `url('${slide.imageUrl}')`;
      filmStrip.appendChild(slideDiv);
    });
    
    // Global değişkenleri güncelle
    const newSlides = Array.from(filmStrip.querySelectorAll('.slide'));
    window.originalSlides = newSlides;
    window.totalSlides = newSlides.length;
    
    // Indicator'ları güncelle
    if (slideIndicators) {
      slideIndicators.innerHTML = '';
      for (let i = 0; i < slides.length; i++) {
        const indicator = document.createElement('button');
        indicator.className = 'indicator' + (i === 0 ? ' active' : '');
        indicator.dataset.index = i;
        indicator.innerHTML = '<span></span>';
        indicator.addEventListener('click', () => {
          goToSlide(i);
          startSlideShow();
        });
        slideIndicators.appendChild(indicator);
      }
      window.indicators = Array.from(slideIndicators.querySelectorAll('.indicator'));
    }
    
    // Slider'ı yeniden başlat
    currentIndex = 0;
    initializeFilmStrip();
    
    console.log('✅ Slider güncellendi');
  }
})();

