# AIPP Chrome Extension — Kurulum ve Kullanım Kılavuzu

Bu dosya, **AIPP Creator & Autopay Chrome Eklentisi'ni** Google Chrome tarayıcısına nasıl yükleyeceğinizi ve nasıl kullanacağınızı adım adım anlatır.

---

## 🚀 1. Eklentiyi Chrome'a Yükleme (Adım Adım)

1. **Google Chrome** tarayıcınızı açın.
2. Adres çubuğuna aşağıdaki adresi yazıp `Enter` tuşuna basın:
   ```
   chrome://extensions
   ```
3. Sayfanın sağ üst köşesinde bulunan **"Geliştirici Modu" (Developer Mode)** anahtarını açın.
4. Sol üstte beliren **"Paketlenmemiş öğe yükle" (Load unpacked)** butonuna tıklayın.
5. Dosya seçici penceresinde bilgisayarınızdaki şu klasörü seçin:
   ```
   C:\Users\ucala\Desktop\aipp-key\extension
   ```
6. Tebrikler! 🎉 **aipp.dev — Monetization & Autopay** eklentisi Chrome araç çubuğunuza eklendi.

---

## 🔒 2. Eklentiyi Kullanma (Sıfır Kod ile İçerik Kilitleme)

### A. İlk Ayar (Cüzdan / API Key Bağlama):
1. Chrome araç çubuğundaki **AIPP simgesine** (sarı halkalı simge) tıklayın.
2. **⚙️ Wallet Key** sekmesine geçin.
3. Lightning Adresinizi (örn: `yourname@getalby.com`) veya `aipp.dev` API Anahtarınızı girip **"Save Wallet Settings"** butonuna basın.

### B. Herhangi Bir Web Sayfasındaki İçeriği Kilitleme (No-Code Element Picker):
1. Kilitlemek istediğiniz herhangi bir web sitesine gidin (Wordpress, Substack, Medium, vb.).
2. AIPP Chrome eklentisini açın ve **🔒 Lock Content** sekmesindeki **"Pick & Lock Element"** butonuna tıklayın.
3. Fareyi kilitli hale getirmek istediğiniz paragrafın, görselin veya indirme linkinin üzerine getirin (Öğe sarı renkle vurgulanacaktır).
4. Sol tıklayın! Seçtiğiniz içerik anında blurlanır ve ödeme duvarı (Paywall) ile kilitlenir.

### C. Hızlı Ödeme Linki (Quick Pay Link) Oluşturma:
1. Eklenti menüsündeki **⚡ Quick Link** sekmesine tıklayın.
2. Ürün Adı, Fiyat ($1.00) ve İndirme Linkini girip **"Generate Pay Link"** butonuna basın.
3. Oluşan linki kopyalayıp müşterilerinize veya sosyal medyada paylaşın.

---

## 📁 Eklenti Klasör Yapısı (Geliştiriciler İçin)

```
c:\Users\ucala\Desktop\aipp-key\extension\
├── manifest.json            # Chrome Manifest V3 konfigürasyonu
├── popup/
│   ├── popup.html           # Eklenti açılır pencere tasarımı
│   └── popup.js             # Eklenti ön yüz mantığı
├── content/
│   ├── content.js           # Sayfa üstü element seçici (Picker) & paywall enjeksiyonu
│   └── content.css          # Seçim vurgulama ve kilit stilleri
└── background/
    └── service_worker.js    # Arka plan servisleri & Sağ tık menüsü
```

---
*Destek ve Dokümantasyon:* [aipp.dev/docs.html](https://aipp.dev/docs.html)
