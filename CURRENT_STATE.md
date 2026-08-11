# AIPP.dev — Current Project State & Master Blueprint
*Son Güncelleme: 11 Ağustos 2026 (Salı Öğle Seansı)*

Bu belge, AIPP (SatsGate) projesinde tamamlanan uçtan uca **Bitcoin Lightning (L402 / Bolt 12) & Base USDC (X402)** altyapısını, **Hermes AI Ajanı Beynini**, **Global Canlı Vitrini**, **LangChain & n8n Canlı Doğrulamalarını**, yeni eklenen **Notion Şablon Monetizasyon & `/embed` Desteğini** ve **Sosyal Medya Lansman Stratejisini** içerir.

---

## ⚡ Bugün Neler Yaptık ve Neleri Başardık? (11 Ağustos 2026)

### 1. n8n No-Code İş Akışı Monetizasyonu (Canlı Hesapta Doğrulandı)
- **1-Tıkla İçe Aktarılabilir JSON Şablonu:** `examples/n8n_aipp_monetization_workflow.json`
- **Görsel Rehber Notları (Sticky Notes):** Tuvalin en üstüne yerleştirilen yeşil ve mor rehber notlarıyla kullanıcıların 3 saniyede `aipp.dev` üzerinden etiket alıp bağlayabilmesi sağlandı.
- **Canlı Ödeme & 439ms Uçtan Uca Teslimat:**
  - Kullanıcının kendi n8n bulut hesabında (`aipp.app.n8n.cloud`) gerçek 16 Sats ödemesi yapıldı.
  - Ödeme `status: "settled"` olarak doğrulandı.
  - Kriptografik preimage (`89d0c89d1909...`) yakalandı ve premium içerik başarıyla teslim edildi.

### 2. LangChain & LangSmith Otonom Ajan Entegrasyonu (Canlı Doğrulandı)
- **`aipp-micropayments` Yeteneği:** LangSmith / Fleet ortamına resmi bir Skill olarak tanımlandı.
- **Canlı API Testi & Trace Grafikleri:**
  - Kullanıcının gerçek LangSmith API anahtarıyla (`eu.smith.langchain.com`) bağlandı.
  - `AIPP-Production-Agents` projesine otonom Lightning faturası kesildi, Phoenix ile ödendi, preimage doğrulandı ve **EU AI Act Madde 26 Resmi Makbuzu (`rec_fd5758bf-...`)** üretilerek canlı log ağacı oluşturuldu.

### 3. Notion Şablon Monetizasyonu & Gömülü Kartlar (`/embed`)
- **Notion `/embed` Desteği:** `https://aipp.dev/embed/:id` ve `https://aipp.dev/pay/:id` uç noktaları `frame-ancestors *` CSP başlığı ile Notion içine gömülebilir hale getirildi.
- **Gumroad'a Karşı Büyük Avantaj:** Gumroad'un %10 + 30¢ komisyonu ve 14 günlük bekleme süresi yerine, AIPP ile **%1 komisyon ve anında cüzdana aktarım** modeli dokümante edildi ([aipp.dev/docs.html#notion-templates](https://aipp.dev/docs.html#notion-templates)).

---

## 📊 Mevcut Sistem Durumu (Current Production Architecture)

- **Canlı Domain:** `https://aipp.dev` & `https://api.aipp.dev` (Traefik v3 + TLS v1.3)
- **Sunucu & Docker:** Hetzner Cloud (`89.167.84.31`), `aipp-key` (Port 3000)
- **Lightning Düğümü:** `aipp-phoenixd` (Port 9740, ACINQ Kanalı Aktif)
- **Base EVM Ağı:** Circle USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- **E-Posta & Destek:** `info@aipp.dev`, `support@aipp.dev` + Hermes Zero-Data Purge
- **Ecosystem:** n8n, LangChain, Notion, Chrome Extension (Manifest V3).

---

## 🗓️ SIRADAKİ EYLEM PLANI (Lansman & Dağıtım)

### 🎯 2. Madde: Sosyal Medya & Topluluk Lansmanı
- [ ] **X (Twitter) & Farcaster Lansman Zinciri:**
  - *"Monetize anything on the internet in 3 seconds without Stripe/Gumroad: SatsGate (aipp.dev)"*
- [ ] **Topluluk Paylaşımları:**
  - Reddit: `r/Notion` (350k), `r/n8n`, `r/LangChain`, `r/Bitcoin`.
  - Notion Creators & Champions Kanalları.
- [ ] **Chrome Web Store Mağaza Başvuru Detayları.**
