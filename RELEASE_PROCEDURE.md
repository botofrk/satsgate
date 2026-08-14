# AIPP.dev — Ekosistem Güncelleme ve Sürüm Prosedürü (Release Procedure)

> Open Tag production releases use `deploy_open_tag.sh`. The legacy
> `server_deploy.sh` must not be used because it edits compose configuration.

Bu kılavuz, AIPP.dev projesinde yapılacak her güncellemenin projenin tüm bileşenlerine (SDK'lar, web sayfaları, sunucu, GitHub, NPM ve PyPI) eksiksiz ve hatasız bir şekilde yansıtılmasını sağlamak için takip edilecek **standart operasyon adımlarını (SOP)** içerir.

---

## 📅 Güncelleme Kontrol Listesi (Checklist)

Herhangi bir kod değişikliği yapıldığında, yayına çıkmadan önce aşağıdaki adımlar sırasıyla takip edilmelidir:

### Adım 1: Yerel Test ve Doğrulama
Yeni özelliklerin veya hata düzeltmelerinin mevcut sistemi bozmadığından emin olun.
```bash
# Ana dizinde test süitini çalıştırın
npm test
```

### Adım 2: Web Sitesi ve Ön Yüz Sayfalarının Güncellenmesi (Frontend Updates)
Değişikliklerin ve yeni protokollerin web sitemizdeki tüm arayüz sayfaları ile uyumlu olduğundan emin olun. Gerekli durumlarda şu sayfaları güncelleyin:
* **`index.html` (Ana Sayfa / Sandbox):** Yeni protokollerin deneme arayüzleri ve sekmeleri buraya entegre edilmelidir.
* **`docs.html` (Dokümantasyon):** Yeni endpoint şemaları, kod örnekleri ve protokol açıklamaları dökümante edilmelidir.
* **`dashboard.html` (Satıcı Paneli):** Fatura durumları ve payout kuyruklarının görsel durumları güncellenmelidir.
* **`public/paywall.js` (Paywall Arayüzü):** Arayüzün tüm ödeme yöntemlerini destekleyecek şekilde güncellendiğinden emin olunmalıdır.

### Adım 3: SDK Sürüm Numaralarının Artırılması
Eğer SDK dosyalarında (`src/` altında) bir değişiklik yapıldıysa, versiyon çakışmasını önlemek için sürüm numaralarını (örn. `1.2.2` -> `1.2.3`) güncelleyin:
* **TypeScript SDK:** `sdk/aipp-node/package.json` içerisindeki `"version"` alanını artırın.
* **Python SDK:** `sdk/aipp-python/setup.py` içerisindeki `version="..."` parametresini artırın.

### Adım 4: SDK Paketlerinin Derlenmesi (Build)
* **TypeScript SDK Derleme:**
  ```bash
  cd sdk/aipp-node
  npm run build
  ```
* **Python SDK Derleme:**
  ```bash
  cd sdk/aipp-python
  python setup.py sdist bdist_wheel
  ```

### Adım 5: GitHub Deposuna Push
Tüm yerel değişiklikleri commit'leyip GitHub reposuna gönderin:
```bash
git add .
git commit -m "feat/chore: [güncelleme açıklaması]"
git push origin main
```

### Adım 6: Paketlerin NPM ve PyPI Ortamında Yayınlanması (Publish)
* **NPM (aipp-node) Yayınlama:**
  `sdk/aipp-node/.npmrc` dosyasına geçici olarak NPM token'ını ekleyin ve yayınlayın:
  ```bash
  cd sdk/aipp-node
  # .npmrc içine yazın: //registry.npmjs.org/:_authToken=[NPM_TOKEN]
  npm publish --access public
  # İşlem bitince .npmrc dosyasını güvenlik için SİLİN!
  ```
* **PyPI (aipp-sdk) Yayınlama:**
  ```bash
  cd sdk/aipp-python
  python -m twine upload dist/* -u __token__ -p [PYPI_TOKEN] --skip-existing
  ```

### Adım 7: Canlı Sunucu Dağıtımı
Sunucu adreslerini ve anahtar yollarını bu depoda tutmayın. Korunan runbook'taki değerleri ortam değişkenleriyle kullanın ve SSH host doğrulamasını açık bırakın:
```bash
# 1. Sunucudaki git reposunu güncelleyin
ssh -i "$AIPP_SSH_KEY_PATH" "$AIPP_DEPLOY_USER@$AIPP_DEPLOY_HOST" "cd '$AIPP_DEPLOY_PATH' && git pull --ff-only origin main"

# 2. Docker imajını derleyin ve konteyneri güncelleyin
ssh -i "$AIPP_SSH_KEY_PATH" "$AIPP_DEPLOY_USER@$AIPP_DEPLOY_HOST" "cd '$AIPP_DEPLOY_PATH' && ./server_deploy.sh"
```

### Adım 8: Servis Sağlık Kontrolü (Verification)
Sunucu üzerinde API'lerin doğru yanıt verdiğini test edin:
```bash
# Sağlık Durumu
curl -s -k -H 'Host: aipp.dev' https://localhost/health
# Ajan Keşif Standardı
curl -s -k -H 'Host: aipp.dev' https://localhost/aipp-agent.json

# Open Tag: same URL, agent representation
curl -s -k -H 'Host: aipp.dev' -H 'Accept: application/json' https://localhost/t/p_STAGING_TAG
```
