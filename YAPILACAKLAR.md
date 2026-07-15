# Yapılacaklar Listesi (User Action Items)

AIPP-Key projesi kod, mimari ve güvenlik anlamında şu an yayına hazır ve sunucuda çalışır durumda. Ancak, gerçek dünyada ödemeleri başarıyla alıp USDC'ye dönüştürebilmek için teknik dışı ve node yönetimine dair yapmanız gereken bazı işlemler bulunuyor.

Sorduğunuz gibi **evet, en büyük adım Lightning Kanalı açmak**; ancak bilmeniz gereken birkaç küçük detay daha var. Aşağıdaki listeyi sırasıyla tamamlamanız yeterlidir:

## 1. Lightning Kanalı ve Likidite (En Önemlisi)
Müşterilerden Lightning ağı üzerinden sorunsuzca ödeme alabilmeniz için düğümünüzün (LND/Core Lightning) yeterli **INBOUND (Gelen) Likiditeye** sahip olması gerekmektedir. 

* **Kanal Açma:** Büyük ve güvenilir düğümlerle (örneğin ACINQ, Kraken, veya popüler yönlendirme düğümleri) Lightning kanalları açın.
* **Gelen Likidite (Inbound Liquidity):** Sadece kanal açmanız yetmez; bu kanallardan size para "gelebilmesi" için karşı tarafın size likidite sağlaması gerekir. Loop Out (Lightning Labs) hizmetini kullanarak veya `lnbig`, `bitrefill` gibi servislerden inbound likidite satın alarak bunu sağlayabilirsiniz.
> [!IMPORTANT]  
> Inbound likiditeniz dolduğunda yeni ödeme alamazsınız. Düzenli olarak kanallarınızı dengelemeli (rebalance) veya biriken satoshi'leri zincir üstüne (on-chain) çıkarıp kanalları boşaltmalısınız.

## 2. Base (Ethereum) Cüzdanı İçin Gas Ücreti
Satıcılara (Merchant) hak edişlerini USDC (veya EURC) olarak Base ağında gönderdiğimiz için bir işlem ücreti (Gas Fee) ödenmesi gerekir.
* Akıllı sözleşme veya cüzdan sistemimizin kullandığı **Base cüzdan adresine (AIPP-Key sisteminin kendi cüzdanına)** bir miktar **Base ağında ETH (Ether)** göndermelisiniz. 
* Base ağında ücretler çok düşüktür (genellikle 1 cent'ten az). 5-10 dolarlık bir ETH bile sizi aylar boyunca idare edebilir. 
> [!WARNING]  
> Cüzdanda Base ETH kalmazsa, sistem satıcıya USDC göndermek istediğinde "Yetersiz bakiye" (Insufficient Funds) hatası verecek ve aktarım (payout) gerçekleşmeyecektir.

## 3. Merchant (Satıcı) Api Anahtarlarını Dağıtma
Sistem hazır olduğuna göre, platformunuzu kullanacak satıcılara API anahtarlarını ve entegrasyon dokümantasyonunu ulaştırabilirsiniz. 
* Satıcılar sisteme kendi Base cüzdan adresleriyle kaydolacaklardır. (Base ağındaki USDC veya EURC adresleri).
* Satıcılara oluşturulan `API Key`'leri ileterek, L402 / X402 protokolüyle fatura oluşturmalarını (POST /invoice/create) sağlayın.

## 4. Yedekleme
Her şey tamamlandıktan sonra sunucunuzda çalışan Lightning düğümünün `channel.backup` dosyasını ve özel anahtarlarını güvenli bir offline (soğuk) ortamda yedeklemeyi unutmayın.

---
**Özetle şu anki göreviniz:**
1. Base cüzdanına 5-10$ lık Base ETH atmak.
2. Lightning düğümünüze Inbound (Gelen) likiditesi yüksek kanallar açmak.
3. Test için kendi sisteminize küçük bir Lightning ödemesi yapıp, USDC olarak satıcıya (size) ulaştığını doğrulamak.
