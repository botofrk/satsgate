# AIPP.dev — Current Project State & Next Steps
*Son Güncelleme: 10 Temmuz 2026*

Bu belge, AIPP projesinde bugüne kadar yapılan çalışmaları, en son uygulanan güvenlik sertleştirme (security hardening) işlemlerini ve bir sonraki çalışma seansında kalınan yerden nasıl devam edileceğini özetlemektedir.

---

## ⚡ Neler Yaptık?

### 1. Canlı LNBits & Gateway Altyapısı
* Uygulama, `demo.lnbits.com` bağımlılığından tamamen kurtarıldı.
* Sunucu üzerindeki **yerel LNBits cüzdanına** (`http://aipp-lnbits:5000`) entegre edildi.
* **USDC on Base (x402)** entegrasyonu tamamlandı. Gateway cüzdanından para çekimleri ve ödeme doğrulamaları aktif hale getirildi.
* Fiyat keşfi için makine-uyumlu `/pricing.json` manifestosu ve dinamik USD-sats dönüştürücü eklendi.

### 2. Güvenlik Sertleştirmesi (Security Hardening)
3 paralel ajanla yapılan detaylı kod analizi (71 bulgu) sonucunda aşağıdaki **kritik ve yüksek öncelikli** açıklar tamamen giderildi:
* **Gömülü Key Temizliği:** `src/config/env.ts` içindeki hardcoded private key ve demo fallback'leri kaldırıldı. Production'da eksik env varsa fail-fast (boot crash) sağlandı.
* **IDOR ve Yetkisiz Erişim Engellemesi:** `/merchant/payout-status` ve `/invoice/status` endpoint'leri `X-Api-Key` doğrulama zorunluluğuna tabi tutuldu. Unauthenticated satıcı API anahtarı ifşası önlendi.
* **Bypass Kodlarının Kapatılması:** `/premium-article-1` içindeki demo preimage ve mock tx bypass'ları production ortamı için tamamen kapatıldı (`!IS_PRODUCTION`).
* **Hız Sınırlama (Rate Limiting) & DoS Koruması:** `express-rate-limit` entegre edildi. Küresel limit (200 req/min) ve `/chat`, `/register` gibi hassas rotalar için sıkı limitler (10 req/min) tanımlandı.
* **Güvenli Docker:** Container root yetkileri olmayan (`appuser:appgroup`) bir kullanıcıyla çalışacak şekilde güncellendi. `.dockerignore` eklenerek `.env` sızıntısı önlendi.
* **Atomik Veritabanı İşlemleri:** Payout worker başarı durumları tek bir transaction bloğu (`BEGIN IMMEDIATE TRANSACTION`) içine alınarak crash-safe hale getirildi.

### 3. Arayüz Güncellemeleri
* **Görsel Düzenleme / Kırık Resim Giderimi (`index.html`):** Silinen 800KB'lık `api_token.jpg` dosyasından kalan kırık görsel bağlantısı, saf CSS ve SVG ile oluşturulmuş, yüksek performanslı ve modern bir yapay zeka token illüstrasyonu ile değiştirildi.
* **Müşteri/Satıcı Uyarısı (`dashboard.html`):** Satıcı paneline volatilitenin satoshi kazançlarını nasıl etkilediğini açıklayan Türkçe ve İngilizce uyarı eklendi.
* **Dokümantasyon Başlıkları (`docs.html`):** Dokümantasyondaki eksik "Errors" alanı ve sol menüdeki 14 başlığın tamamı anchor linklerle senkronize edilerek yayına alındı.
* **Canlı Ortam Senkronizasyonu:** Tüm HTML ve JS değişiklikleri `/home/hermes/aipp/aipp-key` dizinine ve Docker konteyneri (`aipp-key`) içine aktarıldı.

---

## 🔍 Nerede Kaldık?

Uygulama şu an **canlıda (Hetzner VPS) en güncel ve en güvenli haliyle** çalışmaktadır.
* TypeScript derlemesi: `tsc --noEmit` ➔ 0 Hata.
* Sunucu durumu: Aktif (`docker ps` ➔ `aipp-key` çalışıyor).
* Sağlık kontrolü: `https://aipp.dev/health` ➔ `{"status":"ok","db":"ok"}`.
* Fiyat Manifestosu: `https://aipp.dev/pricing.json` ➔ 200 OK.
* Git Durumu: Tüm değişiklikler commit edildi ve GitHub reposuna pushlandı (`main` branch güncellendi).

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
