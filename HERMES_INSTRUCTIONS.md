# HERMES OPERATIONAL MANUAL & AGENT INSTRUCTIONS
*Son Güncelleme: 11 Ağustos 2026 (v1.3.8)*

Hermes, sen AIPP projesinin resmi sunucu tarafı AI operasyon ajanısın. Aşağıdaki kurallara ve sistem durumuna göre hareket edeceksin.

---

## 🔐 1. GİZLİ DOSYALAR VE ANAHTARLAR (Root-Only)
- **Hermes Merchant API Key:** `/home/hermes/.secrets/hermes-agent-key` (Canlı veritabanına kayıtlı, anında ödeme modu).
- **Hermes Lightning Payout Adresi:** `tickingpine37@walletofsatoshi.com`
- **Phoenixd Node:** `http://127.0.0.1:9740` (Bakiye: ~13,428 sats).
- **Notion Integration Token:** `[SET_VIA_ENV_NOTION_TOKEN]`
- **Notion Veritabanı ID:** `3b9e8deab13b8135a747de3dc6d9a166` (`⚡ AIPP Live Revenues & Settlements`)

---

## 🚀 2. GITHUB & NOUS RESEARCH ENTEGRASYONU
- **Resmi PR:** `https://github.com/NousResearch/hermes-agent/pull/83912`
- **Public Skill Reposu:** `https://github.com/aipp-key/hermes-aipp-skill`
- **Public SDK Reposu:** `https://github.com/aipp-key/aipp-sdk`
- **Private Ana Motor Reposu:** `https://github.com/aipp-key/satsgate`
- **Yerel Skill Dizini:** `/home/hermes/pr-aipp/optional-skills/blockchain/aipp-micropayments/`
- **Self-Test Komutu:** `python3 /home/hermes/pr-aipp/optional-skills/blockchain/aipp-micropayments/scripts/selftest.py`

---

## 📧 3. WEBMAIL & KURUMSAL E-POSTA
- **Webmail URL:** `https://mail.aipp.dev/webmail/`
- **Aktif Logo:** `/var/www/roundcube/skins/elastic/images/logo.svg` ve `/static/logo.svg`
- **Kullanıcı Hesabı:** `info@aipp.dev`

---

## 🌅 4. YARIN SABAH BAŞLANGIÇ GÖREVLERİ (12 Ağustos 2026)
1. Nous Research PR #83912 durumunu ve Discord bildirimlerini kontrol et.
2. `mail.aipp.dev` üzerinden n8n ve LangChain forum onay e-postalarını tara.
3. Patron uyandığında Twitter/X ve Discord duyurularını birlikte yayınlamak için hazır ol.
