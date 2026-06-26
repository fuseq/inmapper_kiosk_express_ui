# Floor Plan Viewer - Kat Planı Görüntüleyici

Modern, performanslı ve kullanıcı dostu bir kat planı görüntüleyici uygulaması.

## 🎯 Özellikler

- **SVG Tabanlı Harita**: Leaflet.js kullanarak 0.svg dosyasını interaktif harita olarak görüntüleme
- **Optimize Edilmiş Canvas Rendering**: Binlerce marker'ı sorunsuz gösterebilen performans
- **Kategori Filtreleme**: Mağazalar, Bankalar, Yemek & İçecek, Binalar
- **Arama Fonksiyonu**: Tüm birimlerde hızlı arama
- **Detaylı Bilgi Paneli**: Her birim için ayrıntılı bilgi görüntüleme
- **Responsive Tasarım**: Mobil ve masaüstü uyumlu
- **Modern UI**: Smooth animasyonlar ve kullanıcı dostu arayüz

## 🚀 Kurulum

### Gereksinimler

- Modern bir web tarayıcısı (Chrome, Firefox, Safari, Edge)
- Yerel bir web sunucusu (Live Server, http-server, vb.)

### Kullanım

1. Projeyi klonlayın veya indirin
2. `0.svg` dosyanızı `public/assets/` veya `assets/` klasörüne yerleştirin
3. Yerel bir web sunucusu başlatın:

```bash
# Python 3 ile
python -m http.server 8000

# Node.js http-server ile
npx http-server

# VS Code Live Server extension ile
# Sağ tık > "Open with Live Server"
```

4. Tarayıcınızda `http://localhost:8000` adresini açın

## 📁 Proje Yapısı

```
google-travel-clone/
├── index.html          # Ana HTML dosyası
├── styles.css          # Tüm stiller
├── app.js             # Ana uygulama mantığı
├── data.js            # Veri yönetimi ve SVG parsing
├── leaflet-map.js     # Leaflet harita yönetimi
├── assets/            # SVG ve diğer dosyalar
│   ├── 0.svg         # Kat planı SVG dosyası
│   └── list.xlsx     # (Opsiyonel) Excel veri dosyası
└── public/           # Public assets
    └── assets/
        └── 0.svg
```

## 🎨 SVG Yapısı

Uygulama, SVG dosyasında şu yapıyı arar:

```xml
<svg>
  <g id="Rooms">
    <g id="Shop">
      <!-- Mağaza birimleri -->
    </g>
    <g id="Bank">
      <!-- Banka birimleri -->
    </g>
    <g id="Food">
      <!-- Yemek & İçecek birimleri -->
    </g>
    <g id="Building">
      <!-- Bina birimleri -->
    </g>
    <g id="Other">
      <!-- Diğer birimler -->
    </g>
  </g>
</svg>
```

## 🛠️ Teknolojiler

- **Vanilla JavaScript (ES6+)**: Framework kullanmadan, saf JavaScript
- **Leaflet.js 1.9.4**: Harita görüntüleme ve interaktif özellikler
- **Canvas Rendering**: Yüksek performanslı marker rendering
- **CSS3**: Modern stil ve animasyonlar
- **Lucide Icons**: Hafif ve modern icon seti

## 📊 Performans Özellikleri

- **Canvas Tabanlı Marker'lar**: 10,000+ marker sorunsuz render
- **Optimize Edilmiş SVG Yükleme**: Hızlı başlangıç süresi
- **Lazy Loading**: Sadece görünen öğeler yüklenir
- **Smooth Animasyonlar**: 60 FPS animasyonlar

## 🎯 Kullanım Kılavuzu

### Kategori Filtreleme

Üst menüdeki kategori chip'lerine tıklayarak birimleri filtreleyin:
- Tümü: Tüm birimler
- Mağazalar: Sadece mağazalar
- Bankalar: Sadece bankalar
- Yemek & İçecek: Restoranlar ve kafeler
- Binalar: Bina yapıları

### Arama

Üst menüdeki arama kutusunu kullanarak birim adlarında, açıklamalarında veya konumlarında arama yapın.

### Harita Kontrolleri

- **Zoom**: Sağ üstteki + / - butonları veya mouse tekerleği
- **Pan**: Haritayı sürükleyin
- **Marker Tıklama**: Detaylı bilgi için bir marker'a tıklayın
- **Popup**: Marker'a tıkladığınızda hızlı bilgi görüntülenir

### Yan Panel

Sol taraftaki panel tüm birimleri listeler:
- Her birim kartına tıklayarak detayları görün
- "View details" butonuyla detaylı paneli açın
- Detaylı panelde ilgili birimler listelenir

## 🔧 Özelleştirme

### Kategori Renkleri

`data.js` dosyasında kategori renklerini değiştirebilirsiniz:

```javascript
export const categoryColors = {
    shop: '#e74c3c',      // Kırmızı
    bank: '#3498db',      // Mavi
    food: '#2ecc71',      // Yeşil
    building: '#9b59b6',  // Mor
    other: '#95a5a6'      // Gri
};
```

### Marker Boyutları

`leaflet-map.js` dosyasında marker boyutlarını ayarlayabilirsiniz:

```javascript
const marker = new MarkerCircle([y, x], {
    renderer: this.renderer,
    radius: 10,  // Marker boyutu
    fillColor: color,
    fillOpacity: 0.85,
    color: '#ffffff',
    weight: 2.5
});
```

## 🐛 Sorun Giderme

### SVG Yüklenmiyor

- `0.svg` dosyasının `public/assets/` veya `assets/` klasöründe olduğundan emin olun
- Tarayıcı konsolunda (F12) hata mesajlarını kontrol edin
- CORS hatası alıyorsanız, yerel bir web sunucusu kullanın

### Veriler Görünmüyor

- SVG dosyasının doğru yapıda olduğundan emin olun
- Tarayıcı konsolunda "Loaded X items from SVG" mesajını kontrol edin
- `Rooms` grubunun SVG'de mevcut olduğunu doğrulayın

### Performans Sorunları

- Çok fazla marker varsa (10,000+), Canvas rendering'in aktif olduğundan emin olun
- Tarayıcı donanım hızlandırmasını etkinleştirin
- Eski tarayıcılar yerine modern tarayıcılar kullanın

## 📝 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## 🤝 Katkıda Bulunma

Katkılarınızı memnuniyetle karşılıyoruz! Lütfen bir pull request gönderin veya issue açın.

## 📧 İletişim

Sorularınız için issue açabilir veya pull request gönderebilirsiniz.

---

**Not**: Bu proje Next.js'ten vanilla JavaScript'e dönüştürülmüştür ve hiçbir framework gerektirmez.

