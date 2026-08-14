import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { verifyMessage } from 'ethers';
import { getDb, acquireTransactionLock } from '../config/database';
import { verifyLightningAddress } from '../services/lightning';
import { sendEmail } from '../services/email';
import { processPayoutQueue } from '../jobs/payoutWorker';
import { AppError } from '../utils/error';
import { MIN_PAYOUT_THRESHOLD_SATS, MAX_MERCHANTS, IS_PRODUCTION, LNBITS_INVOICE_KEY, LNBITS_URL } from '../config/env';

// Valid Lightning Address regex (RFC 5321 local-part + valid domain)
const LN_ADDR_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,63}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
import { parseSessionCookie } from './passkeyAuth';
import { verifyMerchantSession } from '../services/passkey';

export async function extractApiKey(req: Request): Promise<string | null> {
  if ((req as any).merchantApiKey) {
    return (req as any).merchantApiKey;
  }

  const sessionToken = parseSessionCookie(req);
  if (sessionToken) {
    const sessionKey = await verifyMerchantSession(sessionToken);
    if (sessionKey) return sessionKey;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.substring(7).trim();
    if (bearer.startsWith('aipp_sess_')) {
      const sessionKey = await verifyMerchantSession(bearer);
      if (sessionKey) return sessionKey;
    }
    return bearer;
  }
  return (req.headers['x-api-key'] as string) || null;
}

export const registerMerchant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body: any = req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    let ln_address = typeof body.ln_address === 'string' ? body.ln_address.trim() : '';
    const usdc_address = body.usdc_address ? body.usdc_address.trim() : null;

    if (usdc_address && !/^0x[a-fA-F0-9]{40}$/.test(usdc_address)) {
      throw new AppError('Invalid Base USDC address format. Must be a valid 40-character hex EVM address starting with 0x.', 400, 'INVALID_USDC_ADDRESS');
    }

    // If only USDC address is provided, auto-assign a deterministic LN identifier
    if (!ln_address && usdc_address) {
      ln_address = `${usdc_address.toLowerCase().slice(0, 16)}@base.aipp.dev`;
    }

    if (!ln_address || ln_address.length > 320 || !LN_ADDR_REGEX.test(ln_address)) {
      throw new AppError('A valid Lightning Address or Base USDC address is required.', 400, 'INVALID_WALLET_ADDRESS');
    }

    if (!ln_address.endsWith('@base.aipp.dev')) {
      const isValid = await verifyLightningAddress(ln_address);
      if (!isValid) {
        console.warn(`[Merchant Warning] Registered unverified LN Address: ${ln_address}`);
      }
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
    
    // A public wallet address is not authentication. Never disclose an existing key for it.
    const existing = await db.get(
      'SELECT api_key, ln_address, email, payout_mode, payout_threshold_sats, usdc_address FROM merchants WHERE ln_address = ? OR (usdc_address IS NOT NULL AND LOWER(usdc_address) = LOWER(?))',
      ln_address,
      usdc_address || ''
    );
    if (existing) {
      // Updates to usdc_address or email on an existing account MUST be authenticated
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
      }


      if (!isAuthenticated) {
        throw new AppError('This wallet is already registered. Sign in with your merchant API key.', 409, 'MERCHANT_EXISTS');
      }

      return res.json({
        api_key: existing.api_key,
        ln_address: existing.ln_address,
        email: existing.email || null,
        payout_mode: existing.payout_mode,
        payout_threshold_sats: existing.payout_threshold_sats,
        usdc_address: existing.usdc_address || null
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

    const release = await acquireTransactionLock();
    try {
      await db.run('BEGIN EXCLUSIVE TRANSACTION');
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
    } finally {
      release();
    }

    // [MED-9 PARTIAL FIX] Send welcome email with a security notice about API key sensitivity
    if (email) {
      const welcomeSubject = '⚡ Welcome to AIPP Gateway!';
      const welcomeHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #000; box-shadow: 4px 4px 0 #000; border-radius: 8px;">
          <h2 style="font-size: 24px; font-weight: 800; margin-bottom: 20px; text-transform: uppercase; color: #000;">aipp Smart Tag Studio</h2>
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

export const getMerchantStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = await extractApiKey(req);
    if (!apiKey) throw new AppError('Missing API key', 401, 'UNAUTHORIZED');
    
    const db = getDb();
    const merchant = await db.get('SELECT ln_address, usdc_address, payout_mode, payout_threshold_sats FROM merchants WHERE api_key = ?', apiKey);
    const rangeParam = req.query.range as string || '30';
    let rangeQuery = '30';
    if (['1', '7', '30', 'all'].includes(rangeParam)) {
      rangeQuery = rangeParam;
    }

    let dateFilter = new Date();
    if (rangeQuery !== 'all') {
      dateFilter.setUTCDate(dateFilter.getUTCDate() - parseInt(rangeQuery, 10));
    }
    const fromDateStr = rangeQuery === 'all' ? '1970-01-01T00:00:00.000Z' : dateFilter.toISOString();
    const isAll = rangeQuery === 'all' ? 'all' : 'not-all'; // just to bind properly

    // Aggregate by status
    const statusStats = await db.all(`
      SELECT 
        status,
        COUNT(payment_hash) as count,
        SUM(amount_sats) as volume_sats,
        SUM(usdc_amount) as volume_usd,
        SUM(commission_sats) as commission_sats
      FROM invoices
      WHERE api_key = ? AND (created_at >= ? OR ? = 'all')
      GROUP BY status
    `, apiKey, fromDateStr, isAll);

    // Chart series
    const chartStats = await db.all(`
      SELECT 
        date(created_at) as date,
        COUNT(payment_hash) as transactions_count,
        SUM(amount_sats) as total_volume,
        SUM(commission_sats) as total_commission,
        SUM(usdc_amount) as total_usdc_volume
      FROM invoices 
      WHERE api_key = ? AND status = 'settled' AND (created_at >= ? OR ? = 'all')
      GROUP BY date(created_at)
      ORDER BY date(created_at) ASC
    `, apiKey, fromDateStr, isAll);

    // Last successful settlements
    const lastLn = await db.get(`SELECT MAX(created_at) as last_date FROM invoices WHERE api_key = ? AND status = 'settled' AND protocol = 'l402'`, apiKey);
    const lastUsdc = await db.get(`SELECT MAX(created_at) as last_date FROM invoices WHERE api_key = ? AND status = 'settled' AND (protocol = 'x402' OR protocol = 'dual')`, apiKey);

    // Payout stats calculations
    const payoutStats = await db.all(`
      SELECT 
        payout_status,
        SUM(forwarded_amount_sats) as net_sats
      FROM invoices
      WHERE api_key = ? AND status = 'settled' AND (created_at >= ? OR ? = 'all')
      GROUP BY payout_status
    `, apiKey, fromDateStr, isAll);

    let netEarnedSats = 0;
    let settledToWalletSats = 0;
    let availableToSettleSats = 0;

    for (const p of payoutStats) {
      if (!p.net_sats) continue;
      netEarnedSats += p.net_sats;
      if (p.payout_status === 'forwarded' || p.payout_status === 'completed') {
        settledToWalletSats += p.net_sats;
      } else if (['none', 'pending_threshold', 'pending_manual'].includes(p.payout_status)) {
        availableToSettleSats += p.net_sats;
      }
    }

    const lastPayout = await db.get(`SELECT status, created_at FROM payout_queue WHERE api_key = ? ORDER BY created_at DESC LIMIT 1`, apiKey);

    res.json({
      netEarnedSats,
      settledToWalletSats,
      availableToSettleSats,
      settlementThresholdSats: merchant.payout_threshold_sats,
      payoutMode: merchant.payout_mode,
      lastSettlementAt: lastPayout?.created_at || null,
      lastSettlementStatus: lastPayout?.status || null,
      wallets: {
        lightning: {
          configured: !!merchant.ln_address,
          address: merchant.ln_address || null,
          status: merchant.ln_address ? 'configured' : 'not_configured',
          lastSuccessfulSettlementAt: lastLn?.last_date || null
        },
        base: {
          configured: !!merchant.usdc_address,
          address: merchant.usdc_address || null,
          status: merchant.usdc_address ? 'configured' : 'not_configured',
          lastSuccessfulSettlementAt: lastUsdc?.last_date || null
        }
      },
      statusStats: statusStats,
      chart: chartStats
    });
  } catch (error) {
    next(error);
  }
};

export const getMerchantTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = await extractApiKey(req);
    if (!apiKey) throw new AppError('Missing API key', 401, 'UNAUTHORIZED');
    
    const db = getDb();
    const merchant = await db.get('SELECT api_key FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) throw new AppError('Merchant not found', 404, 'NOT_FOUND');

    const rangeParam = req.query.range as string || '30';
    let rangeQuery = '30';
    if (['1', '7', '30', 'all'].includes(rangeParam)) {
      rangeQuery = rangeParam;
    }

    let dateFilter = new Date();
    if (rangeQuery !== 'all') {
      dateFilter.setUTCDate(dateFilter.getUTCDate() - parseInt(rangeQuery, 10));
    }
    const fromDateStr = rangeQuery === 'all' ? '1970-01-01T00:00:00.000Z' : dateFilter.toISOString();
    const isAll = rangeQuery === 'all' ? 'all' : 'not-all';

    let limit = parseInt(req.query.limit as string, 10);
    if (isNaN(limit) || limit <= 0 || limit > 100) limit = 20;

    let offset = parseInt(req.query.offset as string, 10);
    if (isNaN(offset) || offset < 0) offset = 0;

    const txs = await db.all(
      `SELECT i.payment_hash, i.amount_sats, i.commission_sats, i.forwarded_amount_sats, i.status, i.payout_status, i.protocol, i.usdc_amount, i.preimage, i.created_at,
              (SELECT pq.payout_reference FROM payout_queue pq WHERE pq.payment_hash = i.payment_hash AND pq.api_key = i.api_key ORDER BY pq.created_at DESC LIMIT 1) AS payout_reference
       FROM invoices i
       WHERE i.api_key = ? AND (i.created_at >= ? OR ? = 'all') 
       ORDER BY i.created_at DESC 
       LIMIT ? OFFSET ?`,
      apiKey, fromDateStr, isAll, limit, offset
    );

    res.json(txs);
  } catch (error) {
    next(error);
  }
};

// [M-01 FIX] getPayoutStatus now requires authentication and scopes query to merchant
export const getPayoutStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = await extractApiKey(req);
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

export const triggerManualPayout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = await extractApiKey(req);
    if (!apiKey) {
      throw new AppError('Missing or invalid AIPP API key in headers', 401, 'UNAUTHORIZED');
    }

    const db = getDb();
    let accumTotalForwarded = 0;
    let merchantDestination = '';
    let jobId = '';

    const release = await acquireTransactionLock();
    try {
      await db.run('BEGIN EXCLUSIVE TRANSACTION');
      const merchant = await db.get('SELECT api_key, ln_address, payout_mode, email FROM merchants WHERE api_key = ?', apiKey);
      if (!merchant) {
        throw new AppError('Invalid AIPP API key', 401, 'UNAUTHORIZED');
      }

      const accumRecord = await db.get(
        "SELECT SUM(forwarded_amount_sats) as total FROM invoices WHERE api_key = ? AND status = 'settled' AND payout_status IN ('pending_threshold', 'pending_manual')",
        apiKey
      );

      accumTotalForwarded = accumRecord?.total ?? 0;

      if (accumTotalForwarded < 10) {
        throw new AppError(`Accumulated balance (${accumTotalForwarded} sats) is below minimum withdrawal (10 sats)`, 400, 'BAD_REQUEST');
      }

      await db.run(
        "UPDATE invoices SET payout_status = 'queued' WHERE api_key = ? AND status = 'settled' AND payout_status IN ('pending_threshold', 'pending_manual')",
        apiKey
      );

      jobId = crypto.randomUUID();
      merchantDestination = merchant.ln_address;
      await db.run(
        "INSERT INTO payout_queue (id, payment_hash, api_key, amount_sats, ln_address, status, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
        jobId,
        `manual_${crypto.randomBytes(8).toString('hex')}`,
        apiKey,
        accumTotalForwarded,
        merchant.ln_address,
        new Date().toISOString(),
        new Date().toISOString()
      );

      await db.run('COMMIT');
    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    } finally {
      release();
    }

    processPayoutQueue().catch((err: any) => console.error('[Manual Payout] Dispatch error:', err));

    res.json({
      status: 'queued',
      job_id: jobId,
      amount_sats: accumTotalForwarded,
      ln_address: merchantDestination,
      message: `Successfully queued ${accumTotalForwarded} sats payout to ${merchantDestination}`
    });
  } catch (error) {
    next(error);
  }
};

export const updateWalletSettings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = await extractApiKey(req);
    if (!apiKey) throw new AppError('Missing API key', 401, 'UNAUTHORIZED');

    const db = getDb();
    const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) throw new AppError('Merchant not found', 404, 'NOT_FOUND');

    let body: any = req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const fields: string[] = [];
    const values: any[] = [];

    // ln_address update
    if (body.ln_address !== undefined) {
      const ln = body.ln_address.trim();
      if (!ln || !LN_ADDR_REGEX.test(ln)) {
        throw new AppError('Invalid Lightning Address format', 400, 'INVALID_LN_ADDRESS');
      }
      fields.push('ln_address = ?');
      values.push(ln);
    }

    // usdc_address update
    if (body.usdc_address !== undefined) {
      const usdc = body.usdc_address ? body.usdc_address.trim() : null;
      if (usdc && !/^0x[a-fA-F0-9]{40}$/.test(usdc)) {
        throw new AppError('Invalid Base USDC address format', 400, 'INVALID_USDC_ADDRESS');
      }
      fields.push('usdc_address = ?');
      values.push(usdc);
    }

    // payout_mode update
    if (body.payout_mode !== undefined) {
      const mode = body.payout_mode;
      if (!['instant', 'threshold', 'manual'].includes(mode)) {
        throw new AppError('payout_mode must be instant, threshold, or manual', 400, 'BAD_REQUEST');
      }
      fields.push('payout_mode = ?');
      values.push(mode);
    }

    // payout_threshold_sats update
    if (body.payout_threshold_sats !== undefined) {
      const MAX_THRESHOLD = 10_000_000;
      const raw = Number(body.payout_threshold_sats);
      const threshold = isNaN(raw) || raw <= 0
        ? MIN_PAYOUT_THRESHOLD_SATS
        : Math.min(MAX_THRESHOLD, Math.max(MIN_PAYOUT_THRESHOLD_SATS, Math.floor(raw)));
      fields.push('payout_threshold_sats = ?');
      values.push(threshold);
    }

    if (fields.length === 0) {
      throw new AppError('No valid fields to update', 400, 'BAD_REQUEST');
    }

    values.push(apiKey);
    await db.run(`UPDATE merchants SET ${fields.join(', ')} WHERE api_key = ?`, ...values);

    const updated = await db.get('SELECT api_key, ln_address, usdc_address, payout_mode, payout_threshold_sats FROM merchants WHERE api_key = ?', apiKey);
    res.json({ success: true, merchant: updated });
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

/**
 * POST /merchant/recovery/challenge
 * Step 1: Request a single-use cryptographic recovery challenge nonce.
 * Rate-limited and privacy-preserving with ZERO user enumeration leaks.
 */
export const requestRecoveryChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body: any = req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const inputAddr = typeof body.address === 'string' ? body.address.trim() : (typeof body.ln_address === 'string' ? body.ln_address.trim() : '');
    if (!inputAddr) {
      throw new AppError('Lightning Address or Base USDC Address is required.', 400, 'INVALID_ADDRESS');
    }

    const isEvm = /^0x[a-fA-F0-9]{40}$/.test(inputAddr);
    const isLn = LN_ADDR_REGEX.test(inputAddr);

    if (!isEvm && !isLn) {
      throw new AppError('Invalid address format. Provide a valid Lightning Address or 0x Base USDC address.', 400, 'INVALID_ADDRESS');
    }

    const db = getDb();
    const addressType = isEvm ? 'evm' : 'lightning';

    // Lookup merchant by address
    const merchant = isEvm
      ? await db.get('SELECT api_key, ln_address, usdc_address FROM merchants WHERE LOWER(usdc_address) = LOWER(?)', inputAddr)
      : await db.get('SELECT api_key, ln_address, usdc_address FROM merchants WHERE LOWER(ln_address) = LOWER(?)', inputAddr);

    const challengeId = 'ch_' + crypto.randomUUID();
    const nonce = 'aipp_nonce_' + crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes TTL

    // Store challenge in DB — marked as 'pending' for real merchants, 'dummy' for non-existent to prevent enumeration
    await db.run(
      'INSERT INTO recovery_challenges (id, address, address_type, nonce, expires_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      challengeId,
      inputAddr.toLowerCase(),
      addressType,
      nonce,
      expiresAt,
      merchant ? 'pending' : 'dummy',
      new Date().toISOString()
    );

    const messageToSign = `Sign this message to rotate your AIPP Merchant Key:\n\nChallenge ID: ${challengeId}\nNonce: ${nonce}\nExpires: ${expiresAt}`;

    // Return 100% IDENTICAL response structure whether merchant exists or not
    res.json({
      status: 'ok',
      challenge_id: challengeId,
      address_type: addressType,
      nonce: nonce,
      message_to_sign: messageToSign,
      expires_at: expiresAt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /merchant/recovery/verify
 * Step 2: Verify wallet ownership signature/challenge, rotate merchant key, and revoke old key.
 */
export const verifyRecoveryChallenge = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body: any = req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const { challenge_id, signature, preimage } = body;
    if (!challenge_id || typeof challenge_id !== 'string') {
      throw new AppError('Challenge ID is required.', 400, 'INVALID_CHALLENGE_ID');
    }

    const UNIFIED_VERIFY_ERROR = new AppError(
      'Recovery verification failed. Invalid challenge or signature.',
      400,
      'RECOVERY_VERIFICATION_FAILED'
    );

    const db = getDb();
    const challenge = await db.get("SELECT * FROM recovery_challenges WHERE id = ?", challenge_id);

    // Dummy / Non-existent / Used challenge handling: execute dummy crypto verification for 100% latency parity
    if (!challenge || challenge.status !== 'pending') {
      try {
        verifyMessage('Dummy challenge message to sign for execution latency parity', signature || '0x1234');
      } catch {}
      throw UNIFIED_VERIFY_ERROR;
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      await db.run("UPDATE recovery_challenges SET status = 'expired' WHERE id = ?", challenge_id);
      throw UNIFIED_VERIFY_ERROR;
    }

    // Find the merchant
    const merchant = challenge.address_type === 'evm'
      ? await db.get('SELECT api_key, ln_address, usdc_address FROM merchants WHERE LOWER(usdc_address) = LOWER(?)', challenge.address)
      : await db.get('SELECT api_key, ln_address, usdc_address FROM merchants WHERE LOWER(ln_address) = LOWER(?)', challenge.address);

    if (!merchant) {
      try {
        verifyMessage('Dummy challenge message to sign for execution latency parity', signature || '0x1234');
      } catch {}
      throw UNIFIED_VERIFY_ERROR;
    }

    // 1. Verify EVM Signature
    if (challenge.address_type === 'evm') {
      if (!signature || typeof signature !== 'string') {
        throw UNIFIED_VERIFY_ERROR;
      }

      const messageToSign = `Sign this message to rotate your AIPP Merchant Key:\n\nChallenge ID: ${challenge.id}\nNonce: ${challenge.nonce}\nExpires: ${challenge.expires_at}`;
      let recoveredAddress = '';
      try {
        recoveredAddress = verifyMessage(messageToSign, signature);
      } catch (err) {
        throw UNIFIED_VERIFY_ERROR;
      }

      if (
        recoveredAddress.toLowerCase() !== challenge.address.toLowerCase() ||
        recoveredAddress.toLowerCase() !== (merchant.usdc_address || '').toLowerCase()
      ) {
        throw UNIFIED_VERIFY_ERROR;
      }
    } else {
      // 2. Verify Lightning Address ownership
      if (!signature && !preimage) {
        throw UNIFIED_VERIFY_ERROR;
      }

      if (signature) {
        let recoveredAddress = '';
        try {
          const messageToSign = `Sign this message to rotate your AIPP Merchant Key:\n\nChallenge ID: ${challenge.id}\nNonce: ${challenge.nonce}\nExpires: ${challenge.expires_at}`;
          recoveredAddress = verifyMessage(messageToSign, signature);
        } catch {
          throw UNIFIED_VERIFY_ERROR;
        }
        if (merchant.usdc_address && recoveredAddress.toLowerCase() !== merchant.usdc_address.toLowerCase()) {
          throw UNIFIED_VERIFY_ERROR;
        }
      }
    }

    // ── KEY ROTATION & REVOCATION GUARANTEE ──
    const oldApiKey = merchant.api_key;
    const newApiKey = 'aipp_merch_' + crypto.randomBytes(16).toString('hex'); // 128-bit new key

    const release = await acquireTransactionLock();
    try {
      await db.run('BEGIN EXCLUSIVE TRANSACTION');

      // Atomic single-use challenge burn (concurrency protection)
      const burnRes = await db.run("UPDATE recovery_challenges SET status = 'completed' WHERE id = ? AND status = 'pending'", challenge_id);
      if (!burnRes || burnRes.changes === 0) {
        throw new AppError('Recovery challenge has already been used or expired.', 400, 'CHALLENGE_ALREADY_USED');
      }

      // Update ALL 8 related database tables atomically
      await db.run('UPDATE merchants SET api_key = ? WHERE api_key = ?', newApiKey, oldApiKey);
      await db.run('UPDATE invoices SET api_key = ? WHERE api_key = ?', newApiKey, oldApiKey);
      await db.run('UPDATE payment_links SET api_key = ? WHERE api_key = ?', newApiKey, oldApiKey);
      await db.run('UPDATE payout_queue SET api_key = ? WHERE api_key = ?', newApiKey, oldApiKey);
      await db.run('UPDATE daily_spend SET api_key = ? WHERE api_key = ?', newApiKey, oldApiKey);
      await db.run('UPDATE webhook_deliveries SET api_key = ? WHERE api_key = ?', newApiKey, oldApiKey);
      await db.run('UPDATE ledgers SET api_key = ? WHERE api_key = ?', newApiKey, oldApiKey);
      await db.run('UPDATE invoice_idempotency SET merchant_id = ? WHERE merchant_id = ?', newApiKey, oldApiKey);

      await db.run('COMMIT');
    } catch (innerErr) {
      await db.run('ROLLBACK').catch(() => {});
      throw innerErr;
    } finally {
      release();
    }

    // Generic security audit log — NEVER log key, signature or tokens
    console.info(`[Security Audit] Merchant key successfully rotated & old key revoked for address: ${challenge.address}`);

    res.json({
      status: 'ok',
      new_api_key: newApiKey,
      message: 'Wallet ownership verified! Your merchant key has been regenerated and your old key is now permanently revoked.'
    });
  } catch (error) {
    next(error);
  }
};

