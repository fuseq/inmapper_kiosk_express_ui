# Apps Script Sheet Writer

Bu klasör, editor'in Birimler ve Kategoriler sekmelerinden yapılan
düzenlemeleri Google Sheets'e yazmak için kullanılan Apps Script web
app kodunu içerir.

## Hızlı kurulum

1. <https://script.google.com> adresinde **"+ New project"**.
2. Editör penceresinde `Code.gs` içeriğini silin, bu klasördeki
   [`sheet-writer.gs`](./sheet-writer.gs) dosyasının **tüm** içeriğini
   yapıştırın.
3. (Opsiyonel) `ALLOWED_SHEET_IDS` dizisini editör config'inizdeki
   `venue.sheets.sheetId` değeriyle doldurun. Boş bırakırsanız endpoint
   _herhangi_ bir Google Sheet'i yazabilir; deployment public ise bu
   güvenlik açığıdır.
4. Üst menüden **"Deploy"** → **"New deployment"** → **"Web app"**.
   - Description: `Inmapper Sheet Writer`
   - Execute as: **Me**
   - Who has access: **Anyone** (anonim isteklere izin verir)
   - Deploy → URL'i kopyalayın.
5. Editor → **Ayarlar** → **"Sheets Yazma Endpoint"** alanına URL'i
   yapıştırın. Kategoriler/Birimler sekmesindeki **"Sheet'e Sync"**
   butonu artık aktif.

## Test etme

Endpoint sağlığını kontrol etmek için tarayıcıda
`<URL>?op=ping` açın. `{ ok: true, version: "1.0.0" }` dönerse hazır.

İlk POST'ta Apps Script Google Sheets'e erişim için yetki ister; istek
sahibi (deploy eden hesap) onayladıktan sonra istekler herkese açık olur.

## Güvenlik notları

- Endpoint URL'i tahmin edilemez (uzun random ID). Yine de paylaşmayın;
  bilen herkes payload göndererek yazabilir.
- `ALLOWED_SHEET_IDS` listesini doldurun.
- Apps Script proje sahibi sizsiniz; istediğiniz zaman "Manage
  Deployments" → "Deactivate" ile yazma yetkisini durdurabilirsiniz.
- Editor varsayılan olarak yalnızca _değişen_ alanları gönderir; veri
  bütünlüğü garantili değil — kritik venue'lar için sheet'in
  Version geçmişini açık tutun.

## Operasyonlar

| Metod | Op           | Açıklama                                                              |
|-------|--------------|----------------------------------------------------------------------|
| GET   | `?op=ping`   | Sağlık kontrolü                                                       |
| POST  | `upsertRows` | Toplu satır upsert + opsiyonel sil. Birimler+Kategoriler sync'i bunu kullanır |
| POST  | `updateRow`  | Tek satır güncelleme — kullanılmıyor ama farklı entegrasyonlar için   |

## Sorun giderme

- **CORS hatası**: Deployment'ı "Anyone" yapmadığınızdan emin olun.
- **HTML response**: Sheet erişim izinleri gevşek değil. `gviz/tq` URL'i
  ile aynı sheet'e tarayıcıdan erişip "anyone with the link" iznini
  doğrulayın.
- **"sheetId boş"**: Editor → Ayarlar → "Sheets Sheet ID" alanını
  doldurun.
