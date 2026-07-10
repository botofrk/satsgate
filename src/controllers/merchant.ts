import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { verifyLightningAddress } from '../services/lightning';
import { sendEmail } from '../services/email';
import { AppError } from '../utils/error';
import { MIN_PAYOUT_THRESHOLD_SATS, MAX_MERCHANTS, IS_PRODUCTION } from '../config/env';

// Valid Lightning Address regex (RFC 5321 local-part + valid domain)
const LN_ADDR_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,63}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const registerMerchant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body: any = req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    // [Y-15 FIX] Proper Lightning Address validation
    const ln_address = typeof body.ln_address === 'string' ? body.ln_address.trim() : '';
    if (!ln_address || ln_address.length > 320 || !LN_ADDR_REGEX.test(ln_address)) {
      throw new AppError('Valid Lightning Address is required (e.g. user@domain.com)', 400, 'INVALID_LN_ADDRESS');
    }

    const isValid = await verifyLightningAddress(ln_address);
    if (!isValid) {
      console.warn(`[Merchant Warning] Registered unverified LN Address: ${ln_address}`);
    }

    const usdc_address = body.usdc_address ? body.usdc_address.trim() : null;
    if (usdc_address && !/^0x[a-fA-F0-9]{40}$/.test(usdc_address)) {
      throw new AppError('Invalid Base USDC address format. Must be a valid 40-character hex EVM address starting with 0x.', 400, 'INVALID_USDC_ADDRESS');
    }

    const payout_mode = body.payout_mode || 'instant';
    if (payout_mode !== 'instant' && payout_mode !== 'threshold' && payout_mode !== 'manual') {
      throw new AppError('payout_mode must be either "instant", "threshold", or "manual"', 400, 'BAD_REQUEST');
    }

    // [M-03 FIX] Bounded payout_threshold with upper limit (0.1 BTC = 10M sats)
    const MAX_THRESHOLD = 10_000_000;
    const rawThreshold = Number(body.payout_threshold_sats);
    const payout_threshold_sats = isNaN(rawThreshold) || rawThreshold <= 0
      ? MIN_PAYOUT_THRESHOLD_SATS
      : Math.min(MAX_THRESHOLD, Math.max(MIN_PAYOUT_THRESHOLD_SATS, Math.floor(rawThreshold)));

    const db = getDb();
    
    // If merchant already exists:
    // [M-04 FIX] DO NOT return the api_key on re-registration — account takeover vector
    const existing = await db.get('SELECT api_key, ln_address, email, payout_mode, payout_threshold_sats, usdc_address FROM merchants WHERE ln_address = ?', ln_address);
    if (existing) {
      // Updates to usdc_address or email on an existing account MUST be authenticated
      // via X-Api-Key — unauthenticated re-registration cannot mutate account data
      const apiKey = (req.headers['x-api-key'] as string) || null;
      const isAuthenticated = apiKey && apiKey === existing.api_key;

      if (isAuthenticated) {
        if (usdc_address && usdc_address !== existing.usdc_address) {
          await db.run('UPDATE merchants SET usdc_address = ? WHERE api_key = ?', usdc_address, existing.api_key);
          existing.usdc_address = usdc_address;
        }
        if (body.email) {
          const email = body.email.trim();
          if (email.length > 320 || !EMAIL_REGEX.test(email)) {
            throw new AppError('Invalid email address', 400, 'INVALID_EMAIL');
          }
          if (email !== existing.email) {
            await db.run('UPDATE merchants SET email = ? WHERE api_key = ?', email, existing.api_key);
            existing.email = email;
          }
        }
        // Return full info only to authenticated re-registrant
        return res.json({
          api_key: existing.api_key,
          ln_address: existing.ln_address,
          email: existing.email || null,
          payout_mode: existing.payout_mode,
          payout_threshold_sats: existing.payout_threshold_sats,
          usdc_address: existing.usdc_address || null
        });
      }

      // [M-04 FIX] Unauthenticated re-registration: never reveal api_key
      return res.status(409).json({
        error: 'A merchant account already exists for this Lightning Address. Please use your existing API key.',
        code: 'ALREADY_REGISTERED'
      });
    }

    // [M-02 FIX] Wrap capacity check + INSERT in exclusive transaction to prevent race condition
    const apiKey = 'aipp_merch_' + crypto.randomBytes(16).toString('hex'); // [M-08 FIX] 128-bit entropy
    const email = body.email ? body.email.trim() : null;
    if (email) {
      if (email.length > 320 || !EMAIL_REGEX.test(email)) {
        throw new AppError('Invalid email address', 400, 'INVALID_EMAIL');
      }
    }

    await db.run('BEGIN EXCLUSIVE TRANSACTION');
    try {
      const countRecord = await db.get('SELECT COUNT(*) as count FROM merchants');
      if (countRecord && countRecord.count >= MAX_MERCHANTS) {
        await db.run('ROLLBACK');
        throw new AppError('AIPP is currently in private beta and has reached its maximum merchant capacity.', 403, 'CAPACITY_REACHED');
      }

      await db.run(
        'INSERT INTO merchants (api_key, ln_address, email, payout_mode, payout_threshold_sats, usdc_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        apiKey,
        ln_address,
        email,
        payout_mode,
        payout_threshold_sats,
        usdc_address,
        new Date().toISOString()
      );
      await db.run('COMMIT');
    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    }

    // [MED-9 PARTIAL FIX] Send welcome email with a security notice about API key sensitivity
    if (email) {
      const welcomeSubject = '⚡ Welcome to AIPP Gateway!';
      const welcomeHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #000; box-shadow: 4px 4px 0 #000; border-radius: 8px;">
          <h2 style="font-size: 24px; font-weight: 800; margin-bottom: 20px; text-transform: uppercase; color: #000;">⚡ AIPP Payment Gateway</h2>
          <p>Hi there,</p>
          <p>Thank you for registering with AIPP. Your account has been created successfully.</p>
          <div style="background: #ffdb00; padding: 15px; border: 2px solid #000; font-weight: bold; margin: 20px 0; font-family: monospace; font-size: 16px; text-align: center; border-radius: 4px;">
            Your API Key: ${apiKey}
          </div>
          <p style="color: #dc2626; font-size: 13px; background: #fef2f2; border: 1px solid #fca5a5; padding: 10px; border-radius: 4px;">
            ⚠️ <strong>Security Notice:</strong> Keep this API key confidential. Do not share it or forward this email. Anyone with this key can create payment invoices on your behalf.
          </p>
          <p><strong>Lightning Address:</strong> ${ln_address}</p>
          ${usdc_address ? `<p><strong>Base USDC Address:</strong> ${usdc_address}</p>` : ''}
          <p><strong>Payout Mode:</strong> ${payout_mode} ${payout_mode === 'threshold' ? `(Threshold: ${payout_threshold_sats} sats)` : ''}</p>
          <hr style="border: 1px solid #000; margin: 25px 0;">
          <h3 style="font-size: 18px; font-weight: 700;">Integration Quickstart:</h3>
          <p>Use the HTTP header <code>X-AIPP-Key</code> with your API key to create invoices via:</p>
          <pre style="background: #f3f4f6; padding: 10px; border: 1px solid #ddd; overflow-x: auto; font-family: monospace;">POST https://aipp.dev/invoice/create</pre>
          <p>Check out our documentation at <a href="https://aipp.dev/docs.html" style="color: #000; font-weight: bold;">aipp.dev/docs.html</a></p>
          <p>If you have any questions, reply to this email or create a ticket on our chat.</p>
          <p>Best regards,<br>AIPP Team</p>
        </div>
      `;
      sendEmail(email, welcomeSubject, welcomeHtml).catch(err => console.error('Failed to send welcome email:', err));
    }

    res.json({
      api_key: apiKey,
      ln_address,
      email,
      payout_mode,
      payout_threshold_sats,
      usdc_address
    });
  } catch (error) {
    next(error);
  }
};

export const triggerManualPayout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    let apiKey = (req.headers['x-api-key'] as string) || null;
    if (!apiKey && authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      apiKey = authHeader.substring(7).trim();
    }
    
    if (!apiKey) {
      throw new AppError('Missing or invalid AIPP API key in headers', 401, 'UNAUTHORIZED');
    }

    const db = getDb();
    
    await db.run('BEGIN EXCLUSIVE TRANSACTION');
    try {
      const merchant = await db.get('SELECT api_key, ln_address, payout_mode, email FROM merchants WHERE api_key = ?', apiKey);
      if (!merchant) {
        throw new AppError('Invalid AIPP API key', 401, 'UNAUTHORIZED');
      }

      if (merchant.payout_mode !== 'manual') {
        throw new AppError('Payout mode is not set to manual', 400, 'BAD_REQUEST');
      }

      const accumRecord = await db.get(
        "SELECT SUM(forwarded_amount_sats) as total FROM invoices WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_manual'",
        apiKey
      );
      
      const accumTotalForwarded = accumRecord?.total ?? 0;

      if (accumTotalForwarded < MIN_PAYOUT_THRESHOLD_SATS) {
        throw new AppError(`Accumulated balance is too low to withdraw (minimum ${MIN_PAYOUT_THRESHOLD_SATS} sats)`, 400, 'BAD_REQUEST');
      }

      // Mark invoices as queued
      await db.run(
        "UPDATE invoices SET payout_status = 'queued' WHERE api_key = ? AND status = 'settled' AND payout_status = 'pending_manual'",
        apiKey
      );

      // Create payout job
      const jobId = crypto.randomUUID();
      await db.run(
        "INSERT INTO payout_queue (id, payment_hash, api_key, amount_sats, ln_address, status, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
        jobId,
        `manual_${crypto.randomBytes(8).toString('hex')}`, // [K-11 FIX] Random suffix, not api_key in hash
        apiKey,
        accumTotalForwarded,
        merchant.ln_address,
        new Date().toISOString(),
        new Date().toISOString()
      );

      await db.run('COMMIT');

      res.json({
        status: 'queued',
        job_id: jobId,
        amount_sats: accumTotalForwarded,
        ln_address: merchant.ln_address,
        message: 'Withdrawal successfully queued.'
      });

    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    }
  } catch (error) {
    next(error);
  }
};

// [M-06 FIX] Consistent case-insensitive Bearer header extraction helper
function extractApiKey(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }
  return (req.headers['x-api-key'] as string) || null;
}

export const getMerchantStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) throw new AppError('Missing API key', 401, 'UNAUTHORIZED');
    
    const db = getDb();
    const merchant = await db.get('SELECT ln_address, usdc_address FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) throw new AppError('Merchant not found', 404, 'NOT_FOUND');

    const stats = await db.all(`
      SELECT 
        date(created_at) as date,
        COUNT(payment_hash) as transactions_count,
        SUM(amount_sats) as total_volume,
        SUM(commission_sats) as total_commission,
        SUM(usdc_amount) as total_usdc_volume
      FROM invoices 
      WHERE api_key = ? AND status = 'settled'
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
      LIMIT 30
    `, apiKey);

    res.json({
      ln_address: merchant.ln_address,
      usdc_address: merchant.usdc_address,
      stats: stats
    });
  } catch (error) {
    next(error);
  }
};

export const getMerchantTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) throw new AppError('Missing API key', 401, 'UNAUTHORIZED');
    
    const db = getDb();
    const merchant = await db.get('SELECT api_key FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) throw new AppError('Merchant not found', 404, 'NOT_FOUND');

    const txs = await db.all(
      'SELECT payment_hash, amount_sats, commission_sats, forwarded_amount_sats, status, payout_status, protocol, usdc_amount, created_at FROM invoices WHERE api_key = ? ORDER BY created_at DESC LIMIT 50',
      apiKey
    );

    res.json(txs);
  } catch (error) {
    next(error);
  }
};

// [M-01 FIX] getPayoutStatus now requires authentication and scopes query to merchant
export const getPayoutStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = extractApiKey(req);
    if (!apiKey) throw new AppError('Missing API key', 401, 'UNAUTHORIZED');

    const paymentHash = req.params.payment_hash;
    if (!paymentHash) {
      throw new AppError('Missing payment hash', 400, 'BAD_REQUEST');
    }

    const db = getDb();
    const merchant = await db.get('SELECT api_key FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

    // [M-01 FIX] Scope query to authenticated merchant's api_key
    const job = await db.get('SELECT status FROM payout_queue WHERE payment_hash = ? AND api_key = ?', paymentHash, apiKey);
    
    if (!job) {
      const invoice = await db.get('SELECT payout_status FROM invoices WHERE payment_hash = ? AND api_key = ?', paymentHash, apiKey);
      if (invoice) {
        return res.json({ status: invoice.payout_status === 'forwarded' ? 'completed' : invoice.payout_status });
      }
      return res.json({ status: 'not_found' });
    }

    res.json({ status: job.status });
  } catch (error) {
    next(error);
  }
};

export const joinWaitlist = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, ln_address } = req.body;
    
    // [M-07 FIX] Use proper regex validation (same as the rest of the file)
    if (!email || typeof email !== 'string' || email.length > 320 || !EMAIL_REGEX.test(email)) {
      throw new AppError('Valid email address is required', 400, 'INVALID_EMAIL');
    }
    
    // [Y-15 FIX] Proper Lightning Address validation for waitlist too
    if (!ln_address || typeof ln_address !== 'string' || ln_address.length > 320 || !LN_ADDR_REGEX.test(ln_address)) {
      throw new AppError('Valid Lightning Address is required', 400, 'INVALID_LN_ADDRESS');
    }

    const db = getDb();
    
    const existing = await db.get('SELECT id FROM waitlist WHERE email = ? OR ln_address = ?', email.trim(), ln_address.trim());
    if (existing) {
      return res.json({ status: 'ok', message: 'You are already on the waitlist!' });
    }

    await db.run(
      'INSERT INTO waitlist (id, email, ln_address, created_at) VALUES (?, ?, ?, ?)',
      crypto.randomUUID(),
      email.trim(),
      ln_address.trim(),
      new Date().toISOString()
    );

    res.json({ status: 'ok', message: 'Successfully joined the waitlist!' });
  } catch (error) {
    next(error);
  }
};
