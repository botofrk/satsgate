# AIPP — AI Payment Protocol

Lightning Network L402 paywall infrastructure for AI agents, APIs, and web apps.

## Architecture

```
Internet
  │
  ▼
Traefik (reverse proxy, TLS)
  │
  ├── api.aipp.dev   → satsgate:8000  (FastAPI + Gunicorn)
  ├── aipp.dev       → frontend:80    (Next.js static export + nginx)
  ├── admin.aipp.dev → dashboard:8501 (Streamlit operator panel)
  └── hub.aipp.dev   → albyhub:8080   (Alby Hub)
  │
  ▼
Internal network (aipp_net)
  ├── postgres:5432  (PostgreSQL 15)
  ├── redis:6379     (Redis 7.4)
  └── lnbits:5000    (LNbits)
```

## Components

| Component | Path | Description |
|-----------|------|-------------|
| **satsgate** | `satsgate/` | FastAPI backend — L402 paywall, prepaid credits, reporting |
| **frontend** | `frontend/` | Next.js 15 + TailwindCSS v4 landing page, login, dashboard |
| **dashboard** | `dashboard/` | Streamlit operator dashboard (revenue, verifications, charts) |
| **SDKs** | `satsgate/sdk/` | Python, TypeScript, MCP, Vercel AI SDKs |

## Quick Start (Local Development)

### Backend (satsgate)

```bash
cd satsgate
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt

cp .env.example .env
# Edit .env — set at minimum: SATSGATE_MACAROON_SECRET, SATSGATE_JWT_SECRET

uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

### Dashboard

```bash
cd dashboard
pip install -r requirements.txt
streamlit run app.py
```

## Production Deployment

See [DEPLOY.md](./DEPLOY.md) for the complete deployment guide.

```bash
docker compose up -d --build
docker compose exec satsgate alembic upgrade head
```

## SDKs

| Package | Install | Docs |
|---------|---------|------|
| `satsgate-sdk` (Python) | `pip install satsgate-sdk` | [README](satsgate/sdk/python/README.md) |
| `@satsgate/sdk` (TypeScript) | `npm install @satsgate/sdk` | [README](satsgate/sdk/typescript/README.md) |
| `@satsgate/mcp` (MCP) | `npx satsgate-mcp` | [README](satsgate/sdk/mcp/README.md) |
| `@satsgate/vercel-ai` | `npm install @satsgate/vercel-ai` | [README](satsgate/sdk/vercel-ai/README.md) |

## Testing

```bash
# Backend
cd satsgate && pytest tests/ -v

# Frontend (lint)
cd frontend && npm run lint
```

## License

Apache 2.0 — see [satsgate/LICENSE](satsgate/LICENSE)
