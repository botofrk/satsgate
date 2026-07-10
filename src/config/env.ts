import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 3000;
export const LNBITS_URL = process.env.LNBITS_URL || 'https://demo.lnbits.com';
export const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || '';
export const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || '';
export const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.LNBITS_ADMIN_KEY || '';
export const LNBITS_WEBHOOK_SECRET = process.env.LNBITS_WEBHOOK_SECRET || '';
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
export const RESEND_API_KEY = process.env.RESEND_API_KEY || '';

export const AIPP_BASE_PRIVATE_KEY = process.env.AIPP_BASE_PRIVATE_KEY || '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
export const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://sepolia.base.org';
export const BASE_CHAIN_ID = BASE_RPC_URL.includes('sepolia') ? 84532 : 8453;
export const USDC_ADDRESS = BASE_RPC_URL.includes('sepolia') 
  ? '0x036cbd53842c5426634e7929541ec2318f3dcf7e' 
  : '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const FEE_PER_REQUEST_SATS = parseInt(process.env.FEE_PER_REQUEST_SATS || '5');
export const DAILY_LIMIT_USD = parseInt(process.env.DAILY_LIMIT_USD || '100');
export const MAX_SINGLE_REQUEST_USD = parseInt(process.env.MAX_SINGLE_REQUEST_USD || '10');
export const MIN_TOPUP_SATS = parseInt(process.env.MIN_TOPUP_SATS || '100');
export const MIN_PAYOUT_THRESHOLD_SATS = parseInt(process.env.MIN_PAYOUT_THRESHOLD_SATS || '1000');
export const MAX_MERCHANTS = parseInt(process.env.MAX_MERCHANTS || '100');
