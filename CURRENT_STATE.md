# AIPP.dev — Current Project State & Next Steps
*Son Güncelleme: 2 Ağustos 2026 (Gece Seansı)*

Bu belge, AIPP projesinde bugüne kadar yapılan çalışmaları, en son uygulanan **AIPP Marka Kit (Brand Kit) entegrasyonunu**, Chrome Uzantısının **10/10 Viral UX dönüşümünü**, Logo/Favicon bütünleştirmesini, Lightning QR kod uyumluluğunu ve gelecek seans için kalınan noktaları özetlemektedir.

---

## ⚡ Bugün Neler Yaptık?

### 1. AIPP Resmi Marka Kit (Brand Kit) & Tasarım Temizliği (%100 Tamamlandı)
* **Neobrutalist Kalıntıların Silinmesi:** Projedeki eski 3px kaba siyah çerçeveler ve 6-8px sert gölgeler `index.html`, `dashboard.html`, `docs.html`, `l402.html`, `checkout.html` ve `paywall.js` dosyalarından tamamen temizlendi.
* **Tasarım Sistemi Bütünlüğü:** Tüm sayfalarda `1px solid #e4e4e7` (mineral çizgi), soft mikron gölgeler (`0 4-16px rgba(0,0,0,0.03)`), `Space Grotesk` başlıklar, `Inter` gövde metinleri ve **Warm Amber (`#ffc700`)** renk anayasası uygulandı.
* **Sarı Yoğunluğu Dengelendi:** Marka kuralı uyarınca sarı renk sadece ekrandaki **tek bir ana CTA butonuna** saklandı; sekmeler ve ikincil elemanlar Deep Black (`#0f0f11`) ve mineral gri tonlarına çekildi.

### 2. Chrome Extension — 10/10 Viral UX Dönüşümü
* **Viral UX Yenilikleri (`extension/popup/popup.html` & `popup.js`):**
  - **Başlık & Subtitle:** Kuru `"ELEMENT PICKER"` silindi, `"Monetize Any Content"` ve 3 vuruşlu `"Pick any text, image or section. Set a price. Start earning instantly."` eklendi.
  - **Canlı Kazanç Hesaplayıcısı (Earnings Estimator):** Kullanıcı fiyat girdikçe anında güncellenen `You receive $0.10` dinamik kutusu yerleştirildi.
  - **Uluslararası Virgül/Nokta Desteği:** Fiyat girdilerinde hem `,` hem `.` otomatik algılanıp sayıya dönüştürüldü.
  - **Eylem Odaklı CTA:** Buton `"Select & Protect Content"` yapıldı; altına `⚡ 1-Click: HTML Paywall code is copied to clipboard automatically` mikro-notu eklendi.
  - **4 Adımlı Mikro Akış:** `1️⃣ Pick ➔ 2️⃣ Price ➔ 3️⃣ Paste ➔ 4️⃣ Earn` görsel bilgi akışı yerleştirildi.
  - **Vektörel SVG İkonlar:** Sekmelerdeki işletim sistemi emojileri silindi, yerine minimal 13x13 SVG outline ikonlar eklendi.
* **İnteraktif Sayfa İçi Kilitleme (Picker Animation):**
  - Butona basıldığında imleç otomatik `crosshair` (hedef imleci) şeklini alıyor.
  - Gezdirilen elemanların etrafında pulsing (yanıp sönen) altın sarısı hare ve şeffaf amber vurgusu beliriyor.
* **Zip Güncellemesi:** Derlenen yeni uzantı `public/aipp-extension.zip` olarak paketlenip canlıya deploy edildi.

### 3. Logolar & Favicon Bütünleştirmesi (Single Brand Identity)
* **Tek Resmi Logo:** Siyah kare zemin (`#0f0f11`), parlak amber (`#ffc700`) hedef halkası, nokta ve ok simgesi içeren AIPP amblemi tek resmi logo olarak belirlendi.
* **Yüksek Çözünürlüklü Varliklar (Pillow/PIL ile üretildi):**
  - Web Favicon'ları: `favicon.svg`, `favicon.ico` (multi-size), `favicon.png` (32x32), `favicon-192.png`.
  - Chrome Extension İkonları: `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png`.
  - Web sitesi, tarayıcı sekmesi ve uzantı simgeleri %100 aynı resmi ambleme kavuşturuldu.

### 4. Lightning QR Kod Uyumluluğu & Teşhis
* **Mobil Cüzdan Uyumluluğu:** `paywall.js` ve `index.html` üzerindeki QR kod URI formatı `LIGHTNING:LNBC...` (büyük harfli BECH32) ve Level M error correction ile güncellenerek Phoenix, Wallet of Satoshi, BlueWallet, Strike ve Zeus uyumlu hale getirildi.
* **Lightning Node Teşhisi:** Sunucu üzerindeki Phoenixd node'unun `channels: []` boş olduğu için ilk ödemede ACINQ tarafından otomatik kanal açılması gerektiği (JIT Liquidity) ve bunun için minimum ~2500 satoshi (~$1.60) tutarında ilk faturanın ödenmesi gerektiği tespit edildi.

### 5. Dokümantasyon & PyPI / NPM Doğrulaması
* **PyPI Paket İsmi Düzeltmesi:** Dokümantasyondaki `pip install aipp` komutu gerçek yayınlanan **`pip install aipp-sdk`** (v1.2.4) ismiyle düzeltildi. NPM paketi `@aipp/sdk` (v1.0.0) ile doğrulandı.
* **Kontrast Düzeltmesi:** `docs.html` navigasyonundaki `Dashboard →` butonunun siyah zemin üzerindeki beyaz yazı rengi (`color: #ffffff !important`) netleştirildi.

### 6. Canlı Sunucu (Hetzner VPS & Docker) Dağıtımı
* Yapılan tüm CSS, HTML, JS, PNG, SVG ve ZIP dosyaları Git repository'sine (`main` branch) push edildi.
* Sunucu üzerindeki `/home/hermes/aipp/aipp-key` dizinine çekildi ve `docker cp` komutları ile `aipp-key` Docker konteynerine aktarılarak **%100 canlıya alındı**.

---

## 🔍 Nerede Kaldık? (Gelecek Seans İçin Hatırlatmalar)

Sistem şu an **canlıda (aipp.dev), GitHub main branch'inde %100 güncel, tutarlı ve kusursuz** durumda.

1. **İlk Lightning Kanalı Açılışı (Gelecek Odak):**
   - Kendi Phoenix/Zeus cüzdanından ~3000 satoshi'lik (~$2) bir demo ödeme yaparak sunucudaki Phoenixd node'una ilk ACINQ kanalını açtırmak (bu sayede tüm küçük faturalar mobil cüzdanlarla şak diye ödenir hale gelecek).
2. **Chrome Web Store Yayın Portal:**
   - Güncellenen `.zip` paketi ile Chrome Web Store geliştirici portalına başvuruyu tamamlamak.
3. **Pazar Yeri ve SDK İletişimi:**
   - PaidMCP pazar yeri listelemelerini takip etmek.

Gelecek seanslarda sistemin sertleştirilmesini devam ettirmek için aşağıdaki orta-düşük öncelikli işler yapılabilir:

### 1. Webhook Dağıtık Yapısı & Güvenilirlik
* **In-memory queue yerine DB persistence:** Şu an webhook tekrar denemeleri (`triggerWebhookWithRetry`) in-memory `setTimeout` ile yapılıyor. Sunucu çökerse denemeler kaybolur. Bunlar için `webhook_deliveries` adında bir DB tablosu oluşturulup arka planda worker ile durdurulup devam ettirilebilir.

### 2. API Sürümlendirme (Versioning)
* API rotalarını gelecekteki değişikliklerden korumak için `/v1/` prefix'ine geçilebilir.

### 3. Fiyat Sağlayıcı Fallback Mekanizması
* `price.ts` dosyasında CoinGecko'ya ek olarak Kraken fallback'i yapıldı ancak daha fazla API kaynağı eklenerek Bitcoin kuru daha da dayanıklı hale getirilebilir.

### 4. Admin Paneli Brute Force Koruması
* `/admin` endpoints için IP bazlı rate limit daha da düşürülebilir veya captcha eklenebilir.

---

## 🛠️ Yararlı Komutlar (Hızlı Başvuru)

### Konteyner Durumunu Kontrol Etme
```bash
ssh -i ~/.ssh/id_ed25519 root@89.167.84.31 "docker ps | grep aipp-key"
```

### Canlı Logları İzleme
```bash
ssh -i ~/.ssh/id_ed25519 root@89.167.84.31 "docker logs -f --tail 50 aipp-key"
```

### Yerelde TypeScript Derleme Testi
```powershell
node node_modules/typescript/bin/tsc --noEmit
```

### Sunucuyu Yeniden Başlatma
```bash
ssh -i ~/.ssh/id_ed25519 root@89.167.84.31 "docker restart aipp-key"
```
