# AIPP Deployment Guide

Complete guide for deploying AIPP (satsgate) from scratch on a fresh server.

## Prerequisites

- Linux server (Ubuntu 22.04+ recommended)
- Docker 24+ and Docker Compose v2
- A domain name with DNS pointing to your server
- Traefik reverse proxy (or Dokploy for managed deployment)
- A Lightning Network wallet for receiving payments

## 1. Clone the Repository

```bash
git clone https://github.com/aippdev/satsgate.git /root/aipp
cd /root/aipp
```

## 2. Configure Environment

Copy the example and fill in all values:

```bash
cp .env.example .env
```

Generate secrets:

```bash
# Admin token
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Macaroon secret (for L402 token signing)
python3 -c "import secrets; print(secrets.token_hex(32))"

# JWT secret (for LNURL-Auth sessions)
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Edit `.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `AIPP_ADMIN_TOKEN` | YES | Protects admin endpoints |
| `SATSGATE_ADMIN_TOKEN` | YES | Same value as above |
| `SATSGATE_MACAROON_SECRET` | YES | L402 token signing key |
| `SATSGATE_JWT_SECRET` | YES | JWT signing key |
| `POSTGRES_PASSWORD` | YES | PostgreSQL password |
| `REDIS_PASSWORD` | YES | Redis auth password |
| `SATSGATE_LIGHTNING_ADDRESS` | YES | Lightning receiving address |
| `CORS_ORIGINS` | YES | Allowed browser domains |
| `LNURLPAY_URL` | Optional | LNbits URL if using LNbits |

## 3. Dokploy Network (if applicable)

If using Dokploy, the external network must exist:

```bash
docker network create dokploy-network
```

If deploying without Dokploy, remove the `dokploy-network` references from `docker-compose.yml`.

## 4. Build and Start

```bash
docker compose up -d --build
```

This starts 7 services:

| Service | Container | Port | URL |
|---------|-----------|------|-----|
| PostgreSQL | aipp-db | 5432 (internal) | — |
| Redis | aipp-redis | 6379 (internal) | — |
| Satsgate API | — | 8000 | api.aipp.dev |
| LNbits | aipp-lnbits | 5000 (internal) | — |
| Alby Hub | albyhub | 8080 | hub.aipp.dev |
| Frontend | aipp-frontend | 80 | aipp.dev |
| Dashboard | aipp-dashboard | 8501 | admin.aipp.dev |

## 5. Run Database Migrations

```bash
docker compose exec satsgate alembic upgrade head
```

## 6. Verify Health

```bash
docker compose exec satsgate python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read())"
```

Or from outside:

```bash
curl https://api.aipp.dev/health
```

Expected response: `{"ok": true, "wallet_mode": "lnaddr", ...}`

## 7. Frontend Build

The frontend Dockerfile runs `npm run build` (Next.js static export) during build. The output is served by nginx.

To rebuild the frontend after changes:

```bash
docker compose up -d --build frontend
```

## 8. SDK Publishing (Optional)

### Python SDK

```bash
cd satsgate/sdk/python
pip install build
python -m build
twine upload dist/*
```

### npm Packages

```bash
cd satsgate/sdk/typescript && npm run build && npm publish --access public
cd satsgate/sdk/mcp && npm run build && npm publish --access public
cd satsgate/sdk/vercel-ai && npm run build && npm publish --access public
```

## 9. CI/CD (GitHub Actions)

The `.github/workflows/deploy.yml` pipeline:
1. Runs `pytest` on every push
2. SSH-deploys to the server on pushes to `main`
3. Runs `alembic upgrade head`
4. Performs a post-deploy health check

Required GitHub secrets:
- `HOST_IP` — Server IP address
- `SSH_PRIVATE_KEY` — SSH key for deployment access

## Troubleshooting

### Services not starting
```bash
docker compose logs satsgate
docker compose logs postgres
docker compose logs redis
```

### Database connection refused
Ensure postgres healthcheck passes:
```bash
docker compose exec postgres pg_isready -U aipp
```

### Frontend not loading
The frontend builds from source. Ensure `npm ci` succeeds:
```bash
docker compose logs frontend
```

### Migration errors
```bash
docker compose exec satsgate alembic current
docker compose exec satsgate alembic upgrade head
```

### Redis auth failure
Verify the password matches between `.env` and the running container:
```bash
docker compose exec redis redis-cli -a "$REDIS_PASSWORD" ping
```

## Service Architecture

```
Internet
  |
  v
Traefik (reverse proxy, TLS termination)
  |
  +-- api.aipp.dev   --> satsgate:8000 (FastAPI + Gunicorn)
  +-- aipp.dev       --> frontend:80 (nginx, static export)
  +-- admin.aipp.dev --> dashboard:8501 (Streamlit)
  +-- hub.aipp.dev   --> albyhub:8080 (Alby Hub)
  |
  v
Internal network (aipp_net)
  |
  +-- postgres:5432 (PostgreSQL 15)
  +-- redis:6379 (Redis 7.4)
  +-- lnbits:5000 (LNbits)
```
