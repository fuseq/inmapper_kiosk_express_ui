import { eventBus } from '../../core/event-bus.js';

const slideState = {
    currentIndex: 0,
    totalSlides: 0,
    autoPlayInterval: null,
};

function goToSlide(index) {
    const strip = document.getElementById('miniFilmStrip');
    const indicators = document.querySelectorAll('.mini-indicator');
    if (!strip) return;

    slideState.currentIndex = index;
    strip.style.transform = `translateX(-${index * 100}%)`;
    indicators.forEach((ind, i) => ind.classList.toggle('active', i === index));
}

export function nextSlide() {
    const next = (slideState.currentIndex + 1) % slideState.totalSlides;
    goToSlide(next);
}

export function startAutoPlay() {
    stopAutoPlay();
    if (slideState.totalSlides > 1) {
        slideState.autoPlayInterval = setInterval(nextSlide, 5000);
    }
}

export function stopAutoPlay() {
    if (slideState.autoPlayInterval) {
        clearInterval(slideState.autoPlayInterval);
        slideState.autoPlayInterval = null;
    }
}

export function show() {
    const el = document.getElementById('homeMiniSlideshow');
    if (el) el.classList.remove('hidden');
    startAutoPlay();
}

export function hide() {
    const el = document.getElementById('homeMiniSlideshow');
    if (el) el.classList.add('hidden');
    stopAutoPlay();
}

export function initSlideshow() {
    const strip = document.getElementById('miniFilmStrip');
    const indicatorsEl = document.getElementById('miniSlideIndicators');
    if (!strip || !indicatorsEl) return;

    const slides = strip.querySelectorAll('.mini-slide');
    slideState.totalSlides = slides.length;

    if (slideState.totalSlides <= 1) return;

    indicatorsEl.innerHTML = '';
    for (let i = 0; i < slideState.totalSlides; i++) {
        const dot = document.createElement('div');
        dot.className = 'mini-indicator' + (i === 0 ? ' active' : '');
        dot.addEventListener('click', () => goToSlide(i));
        indicatorsEl.appendChild(dot);
    }

    startAutoPlay();

    eventBus.on('messaging:miniSliderUpdate', (data) => {
        if (data && data.slides) {
            strip.innerHTML = data.slides.map(s =>
                `<div class="mini-slide"><img src="${s.src}" alt="${s.alt || ''}"></div>`
            ).join('');
            slideState.totalSlides = data.slides.length;
            slideState.currentIndex = 0;
            initSlideshow();
        }
    });
}
