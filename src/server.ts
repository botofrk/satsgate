import express, { Request, Response } from 'express';
import cors from 'cors';
import { PORT, LNBITS_INVOICE_KEY, LNBITS_ADMIN_KEY, LNBITS_WEBHOOK_SECRET, IS_PRODUCTION, FEE_PER_REQUEST_SATS, DAILY_LIMIT_USD } from './config/env';
import { initDb, getDb } from './config/database';
import { errorHandler } from './utils/error';
import { refreshBtcRate, getBtcUsdRate } from './services/price';
import { startPayoutWorker } from './jobs/payoutWorker';
import { startPruneWorker } from './jobs/pruneWorker';
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

// We parse raw body for webhook signature verification, then use express.json for others
app.use('/lnbits-webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

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

// Serve ONLY the public/ directory as static — prevents .env and source code exposure
app.use(express.static(path.join(__dirname, '../public')));
// Also serve HTML files from root (index.html, dashboard.html, etc.) explicitly
const ROOT_HTML_FILES = ['index.html', 'dashboard.html', 'docs.html', 'l402.html', 'admin.html', 'paywall-demo.html'];
ROOT_HTML_FILES.forEach(file => {
  app.get(`/${file}`, (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', file));
  });
});
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
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

    // 5. Start Server
    app.listen(PORT, () => {
      console.log(`⚡ AIPP Generic Payment Bridge listening on port ${PORT}`);
      console.log(`⚡ LNBits API configured: ${LNBITS_INVOICE_KEY ? 'YES' : 'NO'}`);
      console.log(`⚡ Admin key configured (payouts): ${LNBITS_ADMIN_KEY ? 'YES' : '❌ NO'}`);
      console.log(`⚡ Webhook secret: ${LNBITS_WEBHOOK_SECRET ? 'SET ✅' : '⚠️ NOT SET'}`);
      console.log(`⚡ Mode: ${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}`);
      console.log(`⚡ Rate limit: Default fee: ${FEE_PER_REQUEST_SATS} sats, Daily limit: $${DAILY_LIMIT_USD}`);
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
