# 🧪 AIPP / Satsgate Ürün Test Rehberi

## 1. Docker ile Başlatma (Önerilen)

```bash
cd AIPP_WORKSPACE/core
docker compose up --build
```

Bu komut şunları başlatır:
- **PostgreSQL** (port 5432)
- **Redis** (port 6379)  
- **Satsgate Backend** (port 8000)
- **Frontend** (port 3000)

---

## 2. Sağlık Kontrolü

```bash
# Backend health check
curl http://localhost:8000/health

# Beklenen yanıt:
# {"ok":true,"wallet_mode":"mock","time":...}

# Machine-readable manifest
curl http://localhost:8000/.well-known/satsgate.json
```

---

## 3. Planları Listele

```bash
curl http://localhost:8000/v1/plans

# Beklenen: 6 plan (trial, starter, growth, scale, hyper, mega)
```

---

## 4. Demo Ticket (L402 Akışı Testi)

```bash
# 402 challenge al
curl -i http://localhost:8000/v1/tickets

# Yanıt header'da WWW-Authenticate: L402 macaroon="...", invoice="..." olacak
# invoice'ı bir Lightning cüzdanıyla ödeyin
# Ödeme sonrası Authorization header ile tekrar istek atın
```

---

## 5. Kullanıcı Kaydı (LNURL Auth)

```bash
# LNURL生成
curl http://localhost:8000/v1/auth/lnurl/generate

# Yanıt: {"lnurl": "lnurl1...", "k1": "hex_string"}

# k1 ile status kontrolü
curl "http://localhost:8000/v1/auth/lnurl/status?k1=<k1_value>"

# Kimlik doğrulandıktan sonra JWT token alacaksınız
```

---

## 6. API Key Oluşturma (Provision)

```bash
# JWT token ile API key provisioning
curl -X POST http://localhost:8000/v1/auth/provision \
  -H "Authorization: Bearer <jwt_token>"

# Beklenen: {"ok":true,"api_key":"sg_...","message":"Welcome! 50 free credits granted."}
```

---

## 7. Bakiye Kontrolü

```bash
curl http://localhost:8000/v1/balance \
  -H "X-Api-Key: sg_<your_api_key>"

# Beklenen: {"ok":true,"client_id":1,"credits":50}
```

---

## 8. Usage İstatistikleri

```bash
# Son 24 saat usage summary
curl "http://localhost:8000/v1/usage/summary?since_hours=24" \
  -H "X-Api-Key: sg_<key>"

# Son 30 gün günlük usage
curl "http://localhost:8000/v1/usage/daily?days=30" \
  -H "X-Api-Key: sg_<key>"

# Ledger (credit hareketleri)
curl "http://localhost:8000/v1/ledger?limit=10" \
  -H "X-Api-Key: sg_<key>"

# Forecast + satın alma önerisi
curl "http://localhost:8000/v1/usage/forecast" \
  -H "X-Api-Key: sg_<key>"
```

---

## 9. Paywall Challenge & Verify (L402 Akışı)

```bash
# 1. Challenge oluştur
curl -X POST http://localhost:8000/v1/paywall/challenge \
  -H "X-Api-Key: sg_<key>" \
  -H "Content-Type: application/json" \
  -d '{"amount_sats": 10, "resource": "api/secret-data"}'

# Yanıt: macaroon, invoice, payment_hash

# 2. Mock wallet ile öde (development)
curl http://localhost:8000/dev/mock/pay/<payment_hash>

# Yanıt: {"ok":true, "preimage": "hex_string"}

# 3. Verify
curl -X POST http://localhost:8000/v1/paywall/verify \
  -H "X-Api-Key: sg_<key>" \
  -H "Authorization: L402 <macaroon>:<preimage>" \
  -H "Idempotency-Key: unique-key-1" \
  -H "Content-Type: application/json" \
  -d '{"cost_ccredits": 1, "expected_resource": "api/secret-data"}'

# Beklenen: {"ok":true,"resource":"api/secret-data","charged_credits":1,"new_balance":49}
```

---

## 10. Webhook CRUD

```bash
# Webhook listele
curl http://localhost:8000/v1/webhooks \
  -H "X-Api-Key: sg_<key>"

# Webhook oluştur
curl -X POST http://localhost:8000/v1/webhooks \
  -H "X-Api-Key: sg_<key>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-app.com/webhook","events":["payment.received","balance.low"]}'

# Yanıt: webhook_id + secret (bir kez gösterilir!)

# Webhook sil
curl -X DELETE http://localhost:8000/v1/webhooks/<webhook_id> \
  -H "X-Api-Key: sg_<key>"
```

---

## 11. Alert Ayarları

```bash
# Alert config getir
curl http://localhost:8000/v1/alerts \
  -H "X-Api-Key: sg_<key>"

# Alert config güncelle
curl -X POST http://localhost:8000/v1/alerts \
  -H "X-Api-Key: sg_<key>" \
  -H "Content-Type: application/json" \
  -d '{
    "balance_threshold_low": 100,
    "balance_threshold_critical": 10,
    "auto_topup_enabled": true,
    "auto_topup_threshold": 50,
    "auto_topup_plan_id": "starter",
    "usage_alert_enabled": true,
    "usage_alert_daily_limit": 200
  }'
```

---

## 12. Credit Harcama (Manual Spend)

```bash
curl -X POST "http://localhost:8000/v1/spend?cost=1" \
  -H "X-Api-Key: sg_<key>" \
  -H "Idempotency-Key: spend_test_1"

# Beklenen: {"ok":true,"spent":1,"new_balance":49}
```

---

## 13. Frontend Testi

Tarayıcıda açın: **http://localhost:3000**

### Adımlar:
1. **Login** sayfasına git → QR code ile Lightning wallet ile tara
2. **Dashboard** otomatik yüklenecek
3. **"Generate API Key"** butonuna tıkla
4. API key'i kopyala
5. **Usage & Spending** bölümünü kontrol et (balance, verifications)
6. **Daily Usage** grafiğini kontrol et (recharts bar chart)
7. **Webhooks** bölümünden yeni webhook ekle/sil
8. **Alerts & Auto-Topup** bölümünden threshold ayarla

---

## 14. Otomatik Testler

```bash
cd AIPP_WORKSPACE/core/satsgate

# Unit testler (hızlı)
pytest tests/test_webhooks.py tests/test_webhook_retry.py -v

# E2E testler (SQLite in-memory)
DATABASE_URL='sqlite+aiosqlite:///:memory:' pytest tests/test_e2e.py -v

# Tüm testler
pytest tests/ -v
```

---

## 15. WebSocket Testi (Dev Tools ile)

```bash
# Browser Dev Tools console'da:
const ws = new WebSocket('ws://localhost:8000/ws/notifications?token=<jwt_token>');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
ws.onopen = () => ws.send('ping');
ws.onclose = (e) => console.log('Closed:', e.code, e.reason);
```

---

## 🚨 Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| `docker compose up` başarısız | `docker compose logs satsgate` ile logları kontrol et |
| `no such table` hatası | `alembic upgrade head` çalıştır |
| Rate limit 429 | `SATSGATE_RL_ENABLED=0` ile dev modda test et |
| Mock wallet ödeme çalışmıyor | `SATSGATE_DEV_MODE=1` olmalı |
| Frontend boş sayfa | `npm run build` ile build kontrol et |
| CORS hatası | `CORS_ORIGINS` env var'ını ayarla |
