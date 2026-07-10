import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { checkLimit } from '../services/limiter';
import { getBtcUsdRate } from '../services/price';
import { AppError } from '../utils/error';
import { isSafeCallbackUrl } from './webhook';
import { LNBITS_INVOICE_KEY, LNBITS_URL, LNBITS_WEBHOOK_SECRET, PORT, MAX_SINGLE_REQUEST_USD, USDC_ADDRESS } from '../config/env';
import { getGatewayAddress, verifyUsdcPayment } from '../services/base';


function getAippKey(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.substring(7).trim();
  }
  return (req.headers['x-api-key'] as string) || null;
}

export const createInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = getAippKey(req);
    if (!apiKey) {
      throw new AppError('Missing or invalid AIPP API key in headers', 401, 'UNAUTHORIZED');
    }

    const db = getDb();
    const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) {
      throw new AppError('Invalid AIPP API key', 401, 'UNAUTHORIZED');
    }

    let body: any = req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const protocol = (body.protocol || 'L402').toUpperCase();

    // SSRF protection: validate callback_url before storing
    const callback_url = body.callback_url || null;
    if (callback_url && !isSafeCallbackUrl(callback_url)) {
      throw new AppError('Invalid callback_url: private/internal addresses are not allowed', 400, 'INVALID_CALLBACK_URL');
    }

    if (protocol === 'X402') {
      if (!merchant.usdc_address) {
        throw new AppError('Merchant has not configured a Base USDC payout address', 400, 'MERCHANT_NO_USDC_ADDRESS');
      }

      let amount_usd = body.amount_usd;
      if (amount_usd === undefined && body.amount_sats !== undefined) {
        amount_usd = (body.amount_sats / 100_000_000) * getBtcUsdRate();
      }

      if (typeof amount_usd !== 'number' || isNaN(amount_usd) || amount_usd < 0.01 || amount_usd > 100.0) {
        throw new AppError('Transaction amount must be between 0.01 and 100.00 USD (or equivalent sats)', 400, 'INVALID_AMOUNT');
      }

      // Validate single-request USD cap
      if (MAX_SINGLE_REQUEST_USD > 0 && amount_usd > MAX_SINGLE_REQUEST_USD) {
        throw new AppError(`Single request exceeds max allowed ($${MAX_SINGLE_REQUEST_USD})`, 400, 'SINGLE_LIMIT_EXCEEDED');
      }
      await checkLimit(apiKey, amount_usd);

      const paymentHash = 'x402_' + crypto.randomBytes(16).toString('hex');

      await db.run(
        'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, callback_url, protocol, usdc_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        paymentHash,
        apiKey,
        0, // amount_sats is 0 for x402
        0,
        0,
        'pending',
        callback_url,
        'x402',
        amount_usd,
        new Date().toISOString()
      );

      // Generate x402 PAYMENT-REQUIRED challenge header
      const challengeObj = {
        scheme: 'exact',
        network: 'base',
        payTo: getGatewayAddress(),
        price: amount_usd.toFixed(2),
        token: USDC_ADDRESS,
        payment_hash: paymentHash
      };
      
      const challengeBase64 = Buffer.from(JSON.stringify(challengeObj), 'utf8').toString('base64');
      res.setHeader('PAYMENT-REQUIRED', challengeBase64);

      return res.json({
        payment_hash: paymentHash,
        protocol: 'x402',
        amount_usd,
        pay_to: challengeObj.payTo,
        network: challengeObj.network,
        token: challengeObj.token,
        status: 'pending',
        expires_in: 3600
      });
    }

    // Default L402 Flow
    let amount_sats = body.amount_sats;

    if (body.amount_usd !== undefined) {
      if (typeof body.amount_usd !== 'number' || isNaN(body.amount_usd) || body.amount_usd <= 0) {
        throw new AppError('amount_usd must be a positive number', 400, 'INVALID_AMOUNT');
      }
      amount_sats = Math.ceil((body.amount_usd / getBtcUsdRate()) * 100_000_000);
    }

    if (typeof amount_sats !== 'number' || isNaN(amount_sats) || amount_sats < 100 || amount_sats > 100000) {
      throw new AppError('Transaction amount must be between 100 and 100,000 satoshis (or equivalent USD)', 400, 'INVALID_AMOUNT');
    }

    // Validate single-request USD cap
    const costUsd = (amount_sats / 100_000_000) * getBtcUsdRate();
    if (MAX_SINGLE_REQUEST_USD > 0 && costUsd > MAX_SINGLE_REQUEST_USD) {
      throw new AppError(`Single request exceeds max allowed ($${MAX_SINGLE_REQUEST_USD})`, 400, 'SINGLE_LIMIT_EXCEEDED');
    }
    await checkLimit(apiKey, costUsd);

    // Commission: flat 1% with 20 sat minimum
    const commission = Math.max(20, Math.ceil(amount_sats * 0.01));
    const forwarded = amount_sats - commission;

    let paymentHash = '';
    let paymentRequest = '';

    if (LNBITS_INVOICE_KEY) {
      const response = await fetch(`${LNBITS_URL}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'X-Api-Key': LNBITS_INVOICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          out: false,
          amount: amount_sats,
          memo: `AIPP Invoice (Merch: ${apiKey.slice(-6)})`,
          webhook: LNBITS_WEBHOOK_SECRET ? `https://aipp.dev/lnbits-webhook?secret=${LNBITS_WEBHOOK_SECRET}` : undefined
        }),
      });

      if (!response.ok) {
        throw new AppError(`LNBits returned status ${response.status}`, 502, 'LNBITS_ERROR');
      }

      const data = (await response.json()) as any;
      paymentHash = data.payment_hash;
      paymentRequest = data.payment_request;
    } else {
      paymentHash = 'demo_' + crypto.randomBytes(8).toString('hex');
      paymentRequest = `lnbc${amount_sats}n1demo_invoice_generated_by_aipp_backend_for_testing_purposes`;
    }

    await db.run(
      'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, callback_url, protocol, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      paymentHash,
      apiKey,
      amount_sats,
      commission,
      forwarded,
      'pending',
      callback_url,
      'L402',
      new Date().toISOString()
    );

    res.json({
      payment_hash: paymentHash,
      payment_request: paymentRequest,
      amount_sats,
      commission_sats: commission,
      status: 'pending',
      expires_in: 3600
    });
  } catch (error) {
    next(error);
  }
};

export const checkInvoiceStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const hash = req.params.hash;
    if (!hash) {
      throw new AppError('Missing invoice hash', 400, 'BAD_REQUEST');
    }

    const db = getDb();
    const invoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
    if (!invoice) {
      throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    }

    // Handle x402 Protocol Verification
    if (invoice.protocol === 'x402') {
      let txHash = (req.query.tx_hash || req.headers['payment-signature'] || req.headers['x-payment-signature']) as string;
      if (!txHash) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.toLowerCase().startsWith('x402 ')) {
          txHash = authHeader.substring(5).trim();
        } else if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
          txHash = authHeader.substring(7).trim();
        }
      }

      if (invoice.status === 'pending' && txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        const isPaid = await verifyUsdcPayment(txHash, invoice.usdc_amount);
        if (isPaid) {
          await db.run('BEGIN EXCLUSIVE TRANSACTION');
          try {
            const currentInvoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
            if (currentInvoice.status === 'pending') {
              await db.run(
                "UPDATE invoices SET status = 'settled', preimage = ?, payout_status = 'pending_manual' WHERE payment_hash = ?",
                txHash,
                hash
              );

              const merchant = await db.get('SELECT * FROM merchants WHERE api_key = ?', invoice.api_key);
              if (merchant && merchant.payout_mode === 'instant') {
                await db.run(
                  "UPDATE invoices SET payout_status = 'queued' WHERE payment_hash = ?",
                  hash
                );
                
                const jobId = crypto.randomUUID();
                await db.run(
                  "INSERT INTO payout_queue (id, payment_hash, api_key, amount_sats, usdc_address, usdc_amount, protocol, status, next_retry_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
                  jobId,
                  hash,
                  invoice.api_key,
                  0,
                  merchant.usdc_address,
                  invoice.usdc_amount,
                  'x402',
                  new Date().toISOString(),
                  new Date().toISOString()
                );
              }
            }
            await db.run('COMMIT');
          } catch (innerErr) {
            await db.run('ROLLBACK');
            throw innerErr;
          }
        }
      }

      const updatedInvoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
      return res.json({
        paid: updatedInvoice.status === 'settled',
        status: updatedInvoice.status,
        preimage: updatedInvoice.preimage || null
      });
    }

    // Default L402 Status Check
    if (invoice.status === 'pending' && hash.startsWith('demo_')) {
      const lnbitsWebhookUrl = `http://127.0.0.1:${PORT}/lnbits-webhook?secret=${LNBITS_WEBHOOK_SECRET}`;
      await fetch(lnbitsWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_hash: hash })
      });
      
      const updatedInvoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
      return res.json({ paid: updatedInvoice.status === 'settled', status: updatedInvoice.status, preimage: '0000000000000000000000000000000000000000000000000000000000000000' });
    }

    if (invoice.status === 'pending' && !hash.startsWith('demo_') && LNBITS_INVOICE_KEY) {
      const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${hash}`, {
        headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
      });
      if (verifyRes.ok) {
        const verifyData = (await verifyRes.json()) as any;
        if (verifyData.paid) {
          const lnbitsWebhookUrl = `http://127.0.0.1:${PORT}/lnbits-webhook?secret=${LNBITS_WEBHOOK_SECRET}`;
          await fetch(lnbitsWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_hash: hash })
          });
          const updatedInvoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
          return res.json({ paid: updatedInvoice.status === 'settled', status: updatedInvoice.status, preimage: verifyData.preimage });
        }
      }
    }

    res.json({ paid: invoice.status === 'settled', status: invoice.status, preimage: invoice.preimage || null });
  } catch (error) {
    next(error);
  }
};
