# AIPP.dev — Current Project State & Next Steps
*Son Güncelleme: 17 Temmuz 2026*

Bu belge, AIPP projesinde bugüne kadar yapılan çalışmaları, en son uygulanan güvenlik sertleştirme (security hardening) işlemlerini, pazar yeri ve AI ajan entegrasyonlarını, arayüz / dokümantasyon cilalamalarını ve bir sonraki çalışma seansında kalınan yerden nasıl devam edileceğini özetlemektedir.

---

## ⚡ Neler Yaptık?

### 1. Canlı LNBits & Gateway Altyapısı
* Uygulama, `demo.lnbits.com` bağımlılığından tamamen kurtarıldı.
* Sunucu üzerindeki **yerel LNBits cüzdanına** (`http://aipp-lnbits:5000`) entegre edildi.
* **USDC on Base (x402)** entegrasyonu tamamlandı. Gateway cüzdanından para çekimleri ve ödeme doğrulamaları aktif hale getirildi.
* Fiyat keşfi için makine-uyumlu `/pricing.json` manifestosu ve dinamik USD-sats dönüştürücü eklendi.

### 2. Pazar Yeri & AI Ajan Entegrasyonları (Yeni)
* **PaidMCP.dev Otomatik Listeleme:** AIPP-Key altyapısını kullanan satıcıların, kendi API'lerini PaidMCP pazar yerinde tek tıkla listeleyebilmeleri için `/paidmcp.json` manifestosunu dinamik olarak üreten bir endpoint ve Dashboard üzerinde kopyalama butonu eklendi.
* **AIPP Auto-Pay Skill (`aipp-pay.md`):** Claude Code ve Cursor gibi yapay zeka ajanlarının 402 HTTP hatası aldıklarında faturayı okuyup L402 veya x402 (Base/Base-Sepolia) üzerinden otomatik ödemesini ve isteği tekrarlamasını sağlayan AI Skill hazırlandı ve statik olarak sunuldu.
* **EU AI Act - Article 26 Makbuzlandırma:** Ağustos 2026 regülasyonları ile uyumlu, tamamlanan işlemlere dair blockchain kanıtı ve preimage içeren `/invoice/receipt/:hash` makine-okunabilir JSON makbuz uç noktası eklendi.
* **Base Sepolia (Testnet) Desteği:** Sistem `.env` dosyasındaki RPC adresinde `sepolia` tespit ettiğinde otomatik olarak test ağına geçiyor ve 402 meydan okumasında (challenge) ağı `base-sepolia` olarak dönüyor.
* **SDK Sürüm Yükseltmeleri ve Yayınlar:** Hem Node.js (`aipp-node`) hem de Python (`aipp-sdk`) kütüphaneleri **v1.2.1** sürümüne yükseltilerek npm registry ve PyPI üzerinde başarıyla yayınlandı.

### 3. Güvenlik Sertleştirmesi (Security Hardening)
3 paralel ajanla yapılan detaylı kod analizi (71 bulgu) sonucunda aşağıdaki **kritik ve yüksek öncelikli** açıklar tamamen giderildi:
* **Gömülü Key Temizliği:** `src/config/env.ts` içindeki hardcoded private key ve demo fallback'leri kaldırıldı. Production'da eksik env varsa fail-fast (boot crash) sağlandı.
* **IDOR ve Yetkisiz Erişim Engellemesi:** `/merchant/payout-status` ve `/invoice/status` endpoint'leri `X-Api-Key` doğrulama zorunluluğuna tabi tutuldu. Unauthenticated satıcı API anahtarı ifşası önlendi.
* **Bypass Kodlarının Kapatılması:** `/premium-article-1` içindeki demo preimage ve mock tx bypass'ları production ortamı için tamamen kapatıldı (`!IS_PRODUCTION`).
* **Hız Sınırlama (Rate Limiting) & DoS Koruması:** `express-rate-limit` entegre edildi. Küresel limit (200 req/min) ve `/chat`, `/register` gibi hassas rotalar için sıkı limitler (10 req/min) tanımlandı.
* **Güvenli Docker:** Container root yetkileri olmayan (`appuser:appgroup`) bir kullanıcıyla çalışacak şekilde güncellendi. `.dockerignore` eklenerek `.env` sızıntısı önlendi.
* **Zafiyetlerin Giderilmesi:** `npm audit` taramasında `sqlite3` bağımlılığından gelen `tar` açıkları, paketin en son sürüme güncellenmesiyle giderildi (**0 zafiyet**). Docker imajı Debian slim derleme araçları (`make`, `g++`, `python3`) ile native derleme yapacak şekilde güncellendi.
* **Atomik Veritabanı İşlemleri:** Payout worker başarı durumları tek bir transaction bloğu (`BEGIN IMMEDIATE TRANSACTION`) içine alınarak crash-safe hale getirildi.

### 4. Arayüz & Dokümantasyon Güncellemeleri
* **Metin Çevirisi & Dil Bütünlüğü (`index.html`):** Ana sayfa üzerindeki "How It Works" adımlarında kalmış olan son Türkçe açıklamalar tamamen İngilizceye çevrildi.
* **L402 Terminal Arayüz Yenilemesi (`l402.html`):** L402 demo terminali iki sütunlu (split-grid) modern bir tasarıma kavuşturuldu. QR kod kutusuna marka renginde çerçeve eklenerek görsel kontrast uyumu sağlandı. Simülasyon butonu renkleri sarı/amber marka vurgularıyla birleştirildi.
* **Canlı Loglama & Simülasyon Altyapısı:** Lightning L402 simülasyon butonu eklendi. `/invoice/status/:hash` backend uç noktasında demo satıcı API anahtarına özel simüle etme parametresi (`?simulate=true`) tanımlanarak cüzdansız test imkanı sağlandı. Ödeme onaylandığında sağ panele preimage doğrulamaları ve API yanıt durum kodları dinamik olarak akıtıldı.
* **Dokümantasyon Cilalamaları (`docs.html`):** Sidebar aktif sayfa bağlantılarına şık bir sarı/amber sol çizgi (`border-left` accent bar) yerleştirildi. Kod başlığı etiketleri hiyerarşisi küçültülüp kalınlaştırılarak okunabilirlik artırıldı. Mobil uyumluluk için kod bloklarına dikey sarma (word-wrap) desteği getirildi. Örnek EVM cüzdan adresi `0x0000...dead` sahte adresiyle değiştirildi.
* **Müşteri/Satıcı Uyarısı (`dashboard.html`):** Satıcı paneline volatilitenin satoshi kazançlarını nasıl etkilediğini açıklayan Türkçe ve İngilizce uyarı eklendi.
* **Paywall Düzeltmesi (`paywall-demo.html` & `paywall.js`):** Script yolundaki 404 hatası giderildi, kırık yazar avatarı temizlendi. Sunucuya `/paywall_demo.html` alt çizgili url'inden gelen istekleri otomatik olarak `/paywall-demo.html` adresine yönlendiren bir yönlendirme (302 redirect) rotası eklendi.
* **SQLite İzin Çözümü (SQLITE_READONLY):** Docker konteynerinin `appuser` olarak yetkilendirilmesi sonucu oluşan SQLite yazma yetkisi hatası, sunucu üzerindeki `/home/hermes/data/aipp-key` klasör izinlerinin güncellenmesiyle çözüldü. Paywall QR üretimi başarıyla test edildi.
* **Canlı Ortam Senkronizasyonu:** Tüm HTML ve JS değişiklikleri `/home/hermes/aipp/aipp-key` dizinine ve Docker konteyneri (`aipp-key`) içine aktarıldı.


---

## 🔍 Nerede Kaldık?

Uygulama şu an **canlıda (Hetzner VPS) en güncel ve en güvenli haliyle** çalışmaktadır.
* TypeScript derlemesi: `tsc` ➔ 0 Hata.
* Sunucu durumu: Aktif (`docker ps` ➔ `aipp-key` çalışıyor).
* Sağlık kontrolü: `https://aipp.dev/health` ➔ `{"status":"ok","db":"ok"}`.
* Fiyat ve PaidMCP Manifestoları: Uç noktalar çalışıyor.
* Testler: **Vitest** ve **Supertest** entegre edildi. Fiyat servisi ve API rotaları için yazılan 9 testin tamamı sorunsuz geçiyor (`9/9 passed`).
* Git Durumu: Tüm değişiklikler commit edildi ve GitHub reposuna pushlandı (`main` branch güncellendi).
* Paketler: `aipp-node` (npm) ve `aipp-sdk` (pip) **v1.2.1** sürümü ile canlıda yayınlandı.

---

## 🚀 Sonraki Seans İçin Yol Haritası (Yapılacaklar)

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
