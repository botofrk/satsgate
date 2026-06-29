import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { getDb } from '../config/database';
import { checkLimit } from '../services/limiter';
import { getBtcUsdRate } from '../services/price';
import { AppError } from '../utils/error';
import { LNBITS_INVOICE_KEY, LNBITS_URL, LNBITS_WEBHOOK_SECRET, PORT } from '../config/env';

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

    let body: any = {};
    if (req.body && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const amount_sats = body.amount_sats;
    if (typeof amount_sats !== 'number' || isNaN(amount_sats) || amount_sats < 100 || amount_sats > 100000) {
      throw new AppError('Transaction amount must be between 100 and 100,000 satoshis', 400, 'INVALID_AMOUNT');
    }

    const costUsd = (amount_sats / 100_000_000) * getBtcUsdRate();
    await checkLimit(apiKey, costUsd);

    const callback_url = body.callback_url || null;
    const commission = Math.max(1, Math.floor(amount_sats * 0.01));
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
      'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, callback_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      paymentHash,
      apiKey,
      amount_sats,
      commission,
      forwarded,
      'pending',
      callback_url,
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
    const hash = req.params.hash;
    if (!hash) {
      throw new AppError('Missing invoice hash', 400, 'BAD_REQUEST');
    }

    const db = getDb();
    const invoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
    if (!invoice) {
      throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    }

    if (invoice.status === 'pending' && hash.startsWith('demo_')) {
      const lnbitsWebhookUrl = `http://127.0.0.1:${PORT}/lnbits-webhook?secret=${LNBITS_WEBHOOK_SECRET}`;
      await fetch(lnbitsWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_hash: hash })
      });
      
      const updatedInvoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', hash);
      return res.json({ paid: updatedInvoice.status === 'settled', status: updatedInvoice.status });
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
          return res.json({ paid: updatedInvoice.status === 'settled', status: updatedInvoice.status });
        }
      }
    }

    res.json({ paid: invoice.status === 'settled', status: invoice.status });
  } catch (error) {
    next(error);
  }
};
