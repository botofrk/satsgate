# AIPP Chrome Extension — Kurulum ve Kullanım

Sürüm: 1.1.0 — 13 Ağustos 2026

## Yükleme

1. Chrome'da `chrome://extensions` adresini açın.
2. **Geliştirici Modu**nu açın.
3. **Paketlenmemiş öğe yükle**yi seçin.
4. Projedeki `aipp-key/extension` klasörünü seçin.

## İlk ayar

**Payout Wallet** sekmesinde Lightning/Base adresinizi kaydederek yeni bir API
anahtarı alın veya **Already have one?** bağlantısıyla mevcut anahtarınızı girin.
Anahtar yalnızca bu Chrome profilinin yerel extension storage alanında tutulur;
Chrome Sync'e veya dashboard URL'sine yazılmaz.

## Quick Link

Başlık, $0.01–$100 arası fiyat ve ödeme sonrası açılacak geçerli bir `http(s)`
URL girin. **Generate Pay Link** gerçek bir Smart Tag üretir ve paylaşılabilir
`aipp.dev/t/p_...` Open Tag bağlantısını verir. Bu tek URL tarayıcıda checkout,
agent istemcisinde ise makine manifesti olarak çalışır. Eklenti sonuç ekranından
insan bağlantısını veya Agent Manifest adresini ayrı ayrı kopyalayabilirsiniz.

## Create Tag / Element Picker

1. Kontrol ettiğiniz web sayfasını açın.
2. Fiyatı girip **Stick Tag to Element** düğmesine basın.
3. Eklenti gerçek Smart Tag'i oluşturduktan sonra sayfadaki öğeyi seçin.
4. Mevcut sayfada yalnızca bir önizleme gösterilir; yayınlanabilir embed kodu
   panoya kopyalanır.
5. Kalıcı olması için kodu web sitenizin editörüne yapıştırıp yayınlayın.

## Önemli güvenlik sınırı

Element Picker'ın ürettiği embed istemci tarafında görsel bir ödeme duvarıdır.
Gizli içeriği HTML kaynak kodunun içine koymayın; teknik kullanıcılar istemci
tarafı blur efektini kaldırabilir. Gerçekten gizli dosya, API çıktısı veya özel
bağlantı için **Quick Link** ile ödeme sonrası fulfillment yönlendirmesini ya da
sunucu tarafı HTTP 402 doğrulamasını kullanın.

## Klasör yapısı

```text
extension/
├── manifest.json
├── popup/
│   ├── popup.html
│   └── popup.js
├── content/
│   ├── content.js
│   └── content.css
└── icons/
```

Destek ve dokümantasyon: <https://aipp.dev/docs.html>
