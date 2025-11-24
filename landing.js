(function () {
  const timeElement = document.getElementById('landingTime');
  const dateElement = document.getElementById('landingDate');
  const dayElement = document.getElementById('landingDay');
  const createRouteButton = document.getElementById('createRouteBtn');

  const originalSlides = Array.from(document.querySelectorAll('.slide'));
  const indicators = Array.from(document.querySelectorAll('.indicator'));
  const glassPanel = document.querySelector('.glass-panel');
  const glassNavbar = document.querySelector('.glass-navbar');
  const fullscreenBg = document.getElementById('fullscreenBg');
  const filmStrip = document.getElementById('filmStrip');
  let currentIndex = 0;
  let slideTimer;
  let isTransitioning = false;
  const totalSlides = originalSlides.length;
  
  // Cache for precomputed colors for each slide
  const slideColorCache = {};
  
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
    analyzeColorsForIndex(0, false); // No animation on initial load
    preloadNextSlideColors(0); // Preload next slide colors
    
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
    createRouteButton.addEventListener('click', () => {
      console.log('🎯 Create Route butonuna tıklandı');
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'CREATE_ROUTE' }, '*');
        console.log('📤 Parent\'a CREATE_ROUTE mesajı gönderildi');
      }
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

