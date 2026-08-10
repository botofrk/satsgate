# AIPP.dev — Current Project State & Master Blueprint
*Son Güncelleme: 10 Ağustos 2026 (Pazartesi Gece Kapanışı)*

Bu belge, AIPP (SatsGate) projesinde tamamlanan uçtan uca **Bitcoin Lightning (L402 / Bolt 12) & Base USDC (X402)** altyapısını, **Hermes AI Ajanı Destek & Gizlilik Kalkanlarını**, **Global Canlı Vitrini (Emerging Markets Crypto Report Showcase)**, **LangChain & n8n Entegrasyonlarını ve Canlı Test Doğrulamalarını**, ayrıca **Yarın (11 Ağustos 2026)** sabah başlayacağımız **2. Madde (Sosyal Medya & Lansman Manifestosu)** eylem planını içerir.

---

## ⚡ Bugün Neler Yaptık ve Neleri Başardık? (10 Ağustos 2026)

### 1. Resmi Alan Adı E-Postaları & Mailu Entegrasyonu
- Eski geçici e-posta (`proton.me`) tüm kod tabanından, arayüzlerden (`index.html`, `docs.html`, `legal.html`) ve dokümantasyondan tamamen temizlendi.
- Resmi kurumsal e-postalar devreye alındı:
  - **`info@aipp.dev`** (Genel İletişim / İş Birlikleri)
  - **`support@aipp.dev`** (7/24 Müşteri & Geliştirici Desteği)

### 2. Hermes AI Ajanı Mimari Beyni & Otonom Destek Playbook'u
- **Master Mimari Kılavuzu ([HERMES_INSTRUCTIONS.md](file:///c:/Users/faruk/Desktop/aipp-key/HERMES_INSTRUCTIONS.md)):**
  - Sunucudaki Hermes ajanının eski Python/Streamlit dosyalarından kafasının karışması engellendi.
  - Sistemin tek çatıda `aipp-key` konteynerinde çalıştığı, Traefik yönlendirmeleri, veritabanı şemaları ve operasyonel komutları yazıldı.
- **Otonom Destek & Gizlilik Kılavuzu ([HERMES_SUPPORT_PLAYBOOK.md](file:///c:/Users/faruk/Desktop/aipp-key/HERMES_SUPPORT_PLAYBOOK.md)):**
  - **Gizli Bilgi Kalkanı:** Hermes'in sunucu IP'sini, private key'leri, master şifreleri ve diğer satıcıların bilgilerini asla sızdırmayacağı kurallar tanımlandı.
  - **6 Onaylı Destek Şablonu:** Ödeme takibi, bakiye çekimi, cüzdanla giriş, etiket oluşturma, SDK kullanımı ve komisyon soruları için profesyonel yanıt kalıpları hazırlandı.
  - **Bölüm 5 (Zero-Data Auto-Purge):** 30 gün sonra e-postaların `[email]` şeklinde maskelenmesi ve 90 gün sonra kalıcı silinmesi kuralı devreye alındı.

### 3. Küresel Canlı Vitrin (Global Live Demo Showcase)
- **Ana Sayfa Vitrini (`public/index.html#showcase`):**
  - **Başlık:** *"Emerging Markets Crypto Wallet Adoption & Non-Custodial Infrastructure Analysis (2026)"*
  - **Metrikler:** `120M+ Active Wallets` · `Top 3 Global Velocity` · `88% Mobile Dominance`
  - **Kilitli Önizleme:** 12 sayfalık Notability araştırma raporu AIPP Smart Tag (`TAG-254EB7FB`) ile kilitlendi.
  - **Canlı 1-Tıkla Ödeme:** Dinamik QR kod ve 16 sats ($0.01) ödeme butonu entegre edildi.

### 4. LangChain AI Agent & n8n No-Code Entegrasyonları (Doğrulandı)
- **Dokümantasyon:** `public/docs.html` içine `#langchain-agents` ve `#n8n-workflows` bölümleri eklendi.
- **Hazır Şablonlar:**
  - `examples/langchain_aipp_agent.py` (Otonom AI ajanları için L402 challenge & EU AI Act Art. 26 makbuz aracı).
  - `examples/n8n_aipp_monetization_workflow.json` (1-Tıkla n8n iş akışlarını paraya dönüştüren import edilebilir JSON şablonu).
- **Canlı Para Testi:**
  - Gerçek satoshilerle Python LangChain aracı çağrıldı, fatura kesildi, Phoenix üzerinden ödendi, preimage kanıtlandı ve **EU AI Act Madde 26 Resmi Kriptografik Makbuzu (`rec_f6c82d32-...`)** başarıyla üretildi!
  - n8n HTTP doğrulama simülasyonu çalıştırıldı ve `status == "settled"` koşulu ile içerik teslimatı %100 doğrulandı!

### 5. Sunucu ve Git Temizliği
- Eski `core-satsgate-1` konteyneri kaldırıldı, `core` klasörü arşivlendi.
- `https://api.aipp.dev/` artık 404 yerine doğrudan temiz bir JSON API özet sayfası dönüyor.
- Sunucu ve yerel repolar: **`working tree clean`** ✅.

---

## 📊 Mevcut Sistem Durumu (Current Production Architecture)

- **Canlı Domain:** `https://aipp.dev` & `https://api.aipp.dev` (Traefik v3 + TLS v1.3)
- **Sunucu & Docker:** Hetzner Cloud (`89.167.84.31`), `aipp-key` (Port 3000)
- **Lightning Düğümü:** `aipp-phoenixd` (Port 9740, ACINQ Kanalı Aktif)
- **Base EVM Ağı:** Circle USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), Gas Tankı Dolu
- **E-Posta Altyapısı:** Mailu (`info@aipp.dev`, `support@aipp.dev`) + Hermes Zero-Data Purge
- **Emanetsiz Mimari:** %100 Non-Custodial (Sıfır fon riski, anında cüzdana aktarım)

---

## 🗓️ YARININ PLANI (11 Ağustos 2026 — 2. Madde: Lansman & Sosyal Medya)

### 🎯 Odak Noktası: 2. Madde (Sosyal Medya & Lansman Manifestosu)
- [ ] **1. Adım: X (Twitter) & Farcaster Lansman Tweet Zinciri (Viral Thread):**
  - *"Stripe veya PayPal olmadan, internetteki herhangi bir linke, PDF'e veya AI prompt'una 3 saniyede fiyat etiketi koyun: SatsGate (aipp.dev)"* manifestosu.
  - Emerging Markets canlı vitrin linki (`aipp.dev/#showcase`) ve 16 sats ile test etme çağrısı.
- [ ] **2. Adım: 1 Dakikalık Ekran Kaydı & Video Demo Senaryosu:**
  - 1️⃣ Sitede 3 saniyede Smart Tag oluşturma,
  - 2️⃣ Cep telefonunda Phoenix / WoS ile "1-Tıkla Ödeme" butonuyla faturayı anında onaylama,
  - 3️⃣ Kilitli Notability raporunun açılışı ve satıcı cüzdanına paranın saniyesinde düşüşü.
- [ ] **3. Adım: Product Hunt & Topluluk Duyuru Taslakları:**
  - Geliştirici ve içerik üretici toplulukları (Reddit, Hacker News, Farcaster) için lansman metinleri.
- [ ] **4. Adım: Chrome Web Store Mağaza Başvuru Formu:**
  - `public/aipp-extension.zip` paketinin mağaza listeleme detayları.

---

## 🛠️ Hızlı Erişim Komutları

```bash
# Canlı Konteyner Loglarını İzleme
ssh root@89.167.84.31 "docker logs -f --tail 50 aipp-key"

# Sunucuyu Yeniden Başlatma
ssh root@89.167.84.31 "docker restart aipp-key"
```
