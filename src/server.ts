import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { PORT, LNBITS_INVOICE_KEY, LNBITS_ADMIN_KEY, LNBITS_WEBHOOK_SECRET, IS_PRODUCTION, FEE_PER_REQUEST_SATS, DAILY_LIMIT_USD } from './config/env';
import { initDb, getDb } from './config/database';
import { errorHandler } from './utils/error';
import { refreshBtcRate, getBtcUsdRate } from './services/price';
import { startPayoutWorker } from './jobs/payoutWorker';
import { startPruneWorker } from './jobs/pruneWorker';
import { startWebhookWorker } from './jobs/webhookWorker';
import apiRoutes from './routes/api';
import path from 'path';

const app = express();

// Trust proxy for rate limiting behind Traefik/Dokploy
app.set('trust proxy', 1);

// CORS: restrict to known origins in production, wildcard in dev only
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : null;

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, mobile apps)
    if (!origin) return callback(null, true);
    if (!ALLOWED_ORIGINS || ALLOWED_ORIGINS.includes('*')) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'X-Admin-Key']
}));

// [HIGH-2 FIX] Explicit body size limits to prevent DoS
app.use('/lnbits-webhook', express.raw({ type: 'application/json', limit: '8kb' }));
app.use(express.json({ limit: '64kb' }));

// ─────────────────────────────────────────────────────────────────────────────
// [Y-22 / X-01 FIX] Global + per-route rate limiting
// ─────────────────────────────────────────────────────────────────────────────

// Global fallback: 200 req/min per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.', code: 'RATE_LIMIT_EXCEEDED' }
});
app.use(globalLimiter);

// Tight limits for expensive / sensitive unauthenticated endpoints
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.', code: 'RATE_LIMIT_EXCEEDED' }
});
app.use('/merchant/register', strictLimiter);
app.use('/merchant/waitlist', strictLimiter);
app.use('/chat', strictLimiter);
app.use('/ticket', rateLimit({ windowMs: 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false }));
app.use('/admin', rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }));

// Invoice creation: Temporarily increased to 100 for high-concurrency load testing
const invoiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many invoice requests from this IP, please wait a minute.', code: 'RATE_LIMIT_EXCEEDED' }
});
app.use('/pay', invoiceLimiter);
app.use('/t', invoiceLimiter);

// API Routes
app.use('/', apiRoutes);

// Health Check — does NOT expose BTC rate or internal state
app.get('/health', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    await db.get('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), db: 'ok' });
  } catch (e) {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString(), db: 'down' });
  }
});

// API info endpoint & Host-based routing for api.aipp.dev
app.get('/api', (req: Request, res: Response) => {
  res.json({
    name: 'AIPP Protocol (SatsGate) API',
    version: '2.0.0',
    status: 'online',
    docs: 'https://aipp.dev/docs.html',
    endpoints: {
      create_tag: 'POST /merchant/links/create',
      create_invoice: 'POST /invoice/create',
      check_status: 'GET /invoice/status/:hash',
      merchant_register: 'POST /merchant/register',
      health: 'GET /health'
    }
  });
});

// Host-based root router for api.aipp.dev
app.get('/', (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.host && req.headers.host.startsWith('api.')) {
    return res.json({
      name: 'AIPP Protocol (SatsGate) API',
      version: '2.0.0',
      status: 'online',
      docs: 'https://aipp.dev/docs.html',
      endpoints: {
        create_tag: 'POST /merchant/links/create',
        create_invoice: 'POST /invoice/create',
        check_status: 'GET /invoice/status/:hash',
        merchant_register: 'POST /merchant/register',
        health: 'GET /health'
      }
    });
  }
  next();
});

// Serve ONLY the public/ directory as static — single source of truth for all HTML and assets
app.use(express.static(path.join(__dirname, '../public')));
app.get('/paywall_demo.html', (req: Request, res: Response) => {
  res.redirect('/paywall-demo.html');
});

// Global Error Handler
app.use(errorHandler);

// Bootstrapping
async function bootstrap() {
  try {
    // 1. Initialize Database
    await initDb();

    // 2. Refresh BTC Rate and set interval
    await refreshBtcRate();
    setInterval(refreshBtcRate, 5 * 60 * 1000);

    // 3. Start Background Payout Worker (Dead Letter Queue)
    startPayoutWorker();
    
    // 4. Start Prune Worker (Garbage Collection)
    startPruneWorker();

    // 5. Start Webhook Worker (Reliable Deliveries)
    startWebhookWorker();

    // 6. Start Server
    app.listen(PORT, () => {
      console.log(`⚡ aipp Smart Tag Server listening on port ${PORT}`);
      // [LOW-7 FIX] Log config status at debug level, no sensitive details
      if (!IS_PRODUCTION) {
        console.log(`⚡ LNBits API configured: ${LNBITS_INVOICE_KEY ? 'YES' : 'NO'}`);
        console.log(`⚡ Admin key configured (payouts): ${LNBITS_ADMIN_KEY ? 'YES' : '❌ NO'}`);
        console.log(`⚡ Webhook secret: ${LNBITS_WEBHOOK_SECRET ? 'SET ✅' : '⚠️ NOT SET'}`);
        console.log(`⚡ Rate limit: Default fee: ${FEE_PER_REQUEST_SATS} sats, Daily limit: $${DAILY_LIMIT_USD}`);
      }
      console.log(`⚡ Mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

export { app };

const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || Boolean(process.env.VITEST_WORKER_ID);

if (!isTestEnv) {
  bootstrap();
}

