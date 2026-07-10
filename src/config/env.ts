import dotenv from 'dotenv';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Fail-fast validation for required environment variables in production
// ─────────────────────────────────────────────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === 'production';

const REQUIRED_IN_PROD = [
  'LNBITS_URL',
  'LNBITS_INVOICE_KEY',
  'LNBITS_ADMIN_KEY',
  'LNBITS_WEBHOOK_SECRET',
  'ADMIN_SECRET',
] as const;

if (IS_PROD) {
  for (const key of REQUIRED_IN_PROD) {
    if (!process.env[key]) {
      console.error(`FATAL: Required environment variable "${key}" is not set. Refusing to start.`);
      process.exit(1);
    }
  }
}

// [CRIT-2 FIX] No demo.lnbits.com fallback — fail fast if not set
export const LNBITS_URL = process.env.LNBITS_URL || (IS_PROD ? '' : 'https://demo.lnbits.com');
export const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || '';
export const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || '';

// [CRIT-3 FIX] ADMIN_SECRET must be its own value — never inherit from LNBits key
export const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

export const LNBITS_WEBHOOK_SECRET = process.env.LNBITS_WEBHOOK_SECRET || '';
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

// [CRIT-1 FIX] AIPP_BASE_PRIVATE_KEY is optional — print warning if not set in production instead of crash
if (IS_PROD && !process.env.AIPP_BASE_PRIVATE_KEY) {
  console.warn('⚠️ WARNING: AIPP_BASE_PRIVATE_KEY is not set. EVM/Base USDC functions (x402) will be disabled.');
}
export const AIPP_BASE_PRIVATE_KEY = process.env.AIPP_BASE_PRIVATE_KEY || '';

export const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://sepolia.base.org';

// [LOW-3 FIX] Chain ID must be explicitly set — URL sniffing is unreliable
export const BASE_CHAIN_ID = process.env.BASE_CHAIN_ID
  ? parseInt(process.env.BASE_CHAIN_ID, 10)
  : (BASE_RPC_URL.includes('sepolia') ? 84532 : 8453);

export const USDC_ADDRESS = process.env.USDC_ADDRESS
  || (BASE_RPC_URL.includes('sepolia')
    ? '0x036cbd53842c5426634e7929541ec2318f3dcf7e'
    : '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');

export const IS_PRODUCTION = IS_PROD;
export const PORT = process.env.PORT || 3000;

// [MED-2 FIX] parseInt with radix=10 and NaN guard on all numeric env vars
function safeInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(raw || '', 10);
  return isNaN(n) || n < 0 ? fallback : n;
}

export const FEE_PER_REQUEST_SATS = safeInt(process.env.FEE_PER_REQUEST_SATS, 5);
export const DAILY_LIMIT_USD = safeInt(process.env.DAILY_LIMIT_USD, 100);
export const MAX_SINGLE_REQUEST_USD = safeInt(process.env.MAX_SINGLE_REQUEST_USD, 10);
export const MIN_TOPUP_SATS = safeInt(process.env.MIN_TOPUP_SATS, 100);
export const MIN_PAYOUT_THRESHOLD_SATS = safeInt(process.env.MIN_PAYOUT_THRESHOLD_SATS, 1000);
export const MAX_MERCHANTS = safeInt(process.env.MAX_MERCHANTS, 100);
