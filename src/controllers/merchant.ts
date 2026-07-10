import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { verifyLightningAddress } from '../services/lightning';
import { sendEmail } from '../services/email';
import { AppError } from '../utils/error';
import { MIN_PAYOUT_THRESHOLD_SATS, MAX_MERCHANTS } from '../config/env';

export const registerMerchant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body: any = req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const ln_address = body.ln_address;
    if (typeof ln_address !== 'string' || !ln_address || !ln_address.includes('@')) {
      throw new AppError('Valid Lightning Address is required', 400, 'INVALID_LN_ADDRESS');
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
    const requested_threshold = body.payout_threshold_sats || MIN_PAYOUT_THRESHOLD_SATS;
    const payout_threshold_sats = Math.max(MIN_PAYOUT_THRESHOLD_SATS, requested_threshold);

    if (payout_mode !== 'instant' && payout_mode !== 'threshold' && payout_mode !== 'manual') {
      throw new AppError('payout_mode must be either "instant", "threshold", or "manual"', 400, 'BAD_REQUEST');
    }

    const db = getDb();
    
    // If merchant already exists, return their existing key
    const existing = await db.get('SELECT * FROM merchants WHERE ln_address = ?', ln_address.trim());
    if (existing) {
      // Update usdc_address if provided and different
      if (usdc_address && usdc_address !== existing.usdc_address) {
        await db.run('UPDATE merchants SET usdc_address = ? WHERE api_key = ?', usdc_address, existing.api_key);
        existing.usdc_address = usdc_address;
      }
      if (body.email && body.email.trim() !== existing.email) {
        const email = body.email.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!emailRegex.test(email)) {
          throw new AppError('Invalid email address', 400, 'INVALID_EMAIL');
        }
        await db.run('UPDATE merchants SET email = ? WHERE api_key = ?', email, existing.api_key);
        existing.email = email;
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

    // Capacity Check for New Merchants
    const countRecord = await db.get('SELECT COUNT(*) as count FROM merchants');
    if (countRecord && countRecord.count >= MAX_MERCHANTS) {
      throw new AppError('AIPP is currently in private beta and has reached its maximum merchant capacity.', 403, 'CAPACITY_REACHED');
    }

    const apiKey = 'aipp_merch_' + crypto.randomBytes(8).toString('hex');
    const email = body.email ? body.email.trim() : null;
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRegex.test(email)) {
        throw new AppError('Invalid email address', 400, 'INVALID_EMAIL');
      }
    }
    
    await db.run(
      'INSERT INTO merchants (api_key, ln_address, email, payout_mode, payout_threshold_sats, usdc_address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      apiKey,
      ln_address.trim(),
      email,
      payout_mode,
      payout_threshold_sats,
      usdc_address,
      new Date().toISOString()
    );

    // Send Welcome Email if email was provided
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
          <p><strong>Lightning Address:</strong> ${ln_address.trim()}</p>
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
      ln_address: ln_address.trim(),
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
      const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', apiKey);
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
      
      const accumTotalForwarded = accumRecord?.total || 0;

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
        `manual_${apiKey}_${Date.now()}`,
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
      await db.run('ROLLBACK');
      throw innerErr;
    }
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

export const getPayoutStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paymentHash = req.params.payment_hash;
    if (!paymentHash) {
      throw new AppError('Missing payment hash', 400, 'BAD_REQUEST');
    }

    const db = getDb();
    const job = await db.get('SELECT status FROM payout_queue WHERE payment_hash = ?', paymentHash);
    
    if (!job) {
      // Fallback: If it's a mock payout or not queued yet
      const invoice = await db.get('SELECT payout_status FROM invoices WHERE payment_hash = ?', paymentHash);
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
    
    if (!email || !email.includes('@')) {
      throw new AppError('Valid email address is required', 400, 'INVALID_EMAIL');
    }
    
    if (!ln_address || !ln_address.includes('@')) {
      throw new AppError('Valid Lightning Address is required', 400, 'INVALID_LN_ADDRESS');
    }

    const db = getDb();
    
    // Check if already in waitlist
    const existing = await db.get('SELECT * FROM waitlist WHERE email = ? OR ln_address = ?', email.trim(), ln_address.trim());
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
