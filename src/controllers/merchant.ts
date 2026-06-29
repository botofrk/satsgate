import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { verifyLightningAddress } from '../services/lightning';
import { AppError } from '../utils/error';

export const registerMerchant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body: any = {};
    if (req.body && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const ln_address = body.ln_address;
    if (typeof ln_address !== 'string' || !ln_address || !ln_address.includes('@')) {
      throw new AppError('Valid Lightning Address is required', 400, 'INVALID_LN_ADDRESS');
    }

    const isValid = await verifyLightningAddress(ln_address);
    if (!isValid) {
      throw new AppError('Lightning Address could not be resolved or is inactive. Check spelling.', 400, 'LN_ADDRESS_RESOLUTION_FAILED');
    }

    const payout_mode = body.payout_mode || 'instant';
    const payout_threshold_sats = body.payout_threshold_sats || 0;

    if (payout_mode !== 'instant' && payout_mode !== 'threshold') {
      throw new AppError('payout_mode must be either "instant" or "threshold"', 400, 'BAD_REQUEST');
    }

    const apiKey = 'aipp_merch_' + crypto.randomBytes(8).toString('hex');
    const db = getDb();
    
    await db.run(
      'INSERT INTO merchants (api_key, ln_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, ?, ?, ?)',
      apiKey,
      ln_address.trim(),
      payout_mode,
      payout_threshold_sats,
      new Date().toISOString()
    );

    res.json({
      api_key: apiKey,
      ln_address: ln_address.trim(),
      payout_mode,
      payout_threshold_sats
    });
  } catch (error) {
    next(error);
  }
};

export const getMerchantStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (req.headers['x-api-key'] as string) || (req.headers.authorization?.replace('Bearer ', '').trim());
    if (!apiKey) throw new AppError('Missing API key', 401, 'UNAUTHORIZED');
    
    const db = getDb();
    const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) throw new AppError('Merchant not found', 404, 'NOT_FOUND');

    const stats = await db.all(`
      SELECT 
        date(created_at) as date,
        COUNT(payment_hash) as transactions_count,
        SUM(amount_sats) as total_volume,
        SUM(commission_sats) as total_commission
      FROM invoices 
      WHERE api_key = ? AND status = 'settled'
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
      LIMIT 30
    `, apiKey);

    res.json({
      ln_address: merchant.ln_address,
      stats: stats
    });
  } catch (error) {
    next(error);
  }
};

export const getMerchantTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (req.headers['x-api-key'] as string) || (req.headers.authorization?.replace('Bearer ', '').trim());
    if (!apiKey) throw new AppError('Missing API key', 401, 'UNAUTHORIZED');
    
    const db = getDb();
    const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) throw new AppError('Merchant not found', 404, 'NOT_FOUND');

    const txs = await db.all(
      'SELECT * FROM invoices WHERE api_key = ? ORDER BY created_at DESC LIMIT 50',
      apiKey
    );

    res.json(txs);
  } catch (error) {
    next(error);
  }
};
