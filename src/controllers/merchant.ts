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
