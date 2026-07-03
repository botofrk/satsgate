import dotenv from 'dotenv';

dotenv.config();

export const PORT = process.env.PORT || 3000;
export const LNBITS_URL = process.env.LNBITS_URL || 'https://demo.lnbits.com';
export const LNBITS_INVOICE_KEY = process.env.LNBITS_INVOICE_KEY || '';
export const LNBITS_ADMIN_KEY = process.env.LNBITS_ADMIN_KEY || '';
export const LNBITS_WEBHOOK_SECRET = process.env.LNBITS_WEBHOOK_SECRET || '';
export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';
export const FEE_PER_REQUEST_SATS = parseInt(process.env.FEE_PER_REQUEST_SATS || '5');
export const DAILY_LIMIT_USD = parseInt(process.env.DAILY_LIMIT_USD || '100');
export const MAX_SINGLE_REQUEST_USD = parseInt(process.env.MAX_SINGLE_REQUEST_USD || '10');
export const MIN_TOPUP_SATS = parseInt(process.env.MIN_TOPUP_SATS || '100');
export const MIN_PAYOUT_THRESHOLD_SATS = parseInt(process.env.MIN_PAYOUT_THRESHOLD_SATS || '1000');
export const MAX_MERCHANTS = parseInt(process.env.MAX_MERCHANTS || '100');
