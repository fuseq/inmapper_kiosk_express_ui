let intervalId = null;

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const timeEl = document.getElementById('currentTime');
    const dateEl = document.getElementById('currentDate');
    const dayEl = document.getElementById('currentDay');

    if (timeEl) timeEl.textContent = `${hours}:${minutes}`;

    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

    const dayName = days[now.getDay()];
    const monthName = months[now.getMonth()];
    const date = now.getDate();

    if (dateEl) {
        dateEl.innerHTML = `<span class="month-day">${date} ${monthName}</span><span class="day">${dayName}</span>`;
    }
    if (dayEl) dayEl.textContent = dayName;
}

export function init() {
    updateClock();
    intervalId = setInterval(updateClock, 1000);
}

export function destroy() {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
}
