import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb, acquireTransactionLock } from '../config/database';
import { checkLimit } from '../services/limiter';
import { getBtcUsdRate } from '../services/price';
import { AppError } from '../utils/error';
import { isSafeCallbackUrl } from './webhook';
import { LNBITS_INVOICE_KEY, LNBITS_URL, MAX_SINGLE_REQUEST_USD, USDC_ADDRESS, BASE_NETWORK_NAME } from '../config/env';
import { getGatewayAddress, verifyUsdcPayment } from '../services/base';
import { publishInvoiceUpdate, subscribeToInvoice } from '../services/events';

import { generateInvoiceData, InvoiceDomainError } from '../services/invoiceService';

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

    let body: any = req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      try {
        body = JSON.parse(req.body.toString('utf8'));
      } catch {
        throw new AppError('Invalid JSON body', 400, 'INVALID_JSON');
      }
    }

    const rawProtocol = typeof body.protocol === 'string' ? body.protocol.toUpperCase() : 'DUAL';
    const callback_url = body.callback_url || null;

    if (callback_url && !isSafeCallbackUrl(callback_url)) {
      throw new AppError('Invalid callback_url: private/internal addresses are not allowed', 400, 'INVALID_CALLBACK_URL');
    }

    // Rate limits (check early, but service also validates limits)
    // We defer the checkLimit to the service or do it here. 
    // Actually, service validates amount. CheckLimit needs apiKey and amount. 
    // The user requested rate limit to stay in the controller.
    
    // We need amount_usd for checkLimit
    let amount_usd = body.amount_usd;
    if (amount_usd === undefined && body.amount_sats !== undefined) {
      amount_usd = (body.amount_sats / 100_000_000) * getBtcUsdRate();
    }
    if (amount_usd !== undefined && !isNaN(amount_usd)) {
       await checkLimit(apiKey, amount_usd);
    }

    const idempotencyKey = (req.headers['idempotency-key'] as string) || (req.headers['x-idempotency-key'] as string) || null;
    
    // Validate idempotency key constraints
    if (idempotencyKey) {
      if (idempotencyKey.trim().length === 0 || idempotencyKey.length > 128) {
        throw new AppError('Idempotency key must be between 1 and 128 characters', 400, 'INVALID_IDEMPOTENCY_KEY');
      }
      if (/[\x00-\x1F\x7F]/.test(idempotencyKey)) {
        throw new AppError('Idempotency key contains invalid control characters', 400, 'INVALID_IDEMPOTENCY_KEY');
      }
    }

    // Generate canonical request fingerprint
    let idempotencyFingerprint = null;
    if (idempotencyKey) {
      const canonicalRequest = {
        amount_usd: body.amount_usd !== undefined ? String(body.amount_usd) : null,
        amount_sats: body.amount_sats !== undefined ? String(body.amount_sats) : null,
        currency: 'USDC', // Default
        protocol: rawProtocol,
        memo: body.memo ?? null,
        callbackUrl: callback_url ?? null,
      };
      idempotencyFingerprint = crypto.createHash('sha256').update(JSON.stringify(canonicalRequest)).digest('hex');
    }

    let invoiceData;
    try {
      invoiceData = await generateInvoiceData({
        apiKey,
        protocol: rawProtocol as any,
        amountUsd: body.amount_usd, // Let generateInvoiceData handle string casting
        amountSats: body.amount_sats,
        callbackUrl: callback_url,
        idempotencyKey: idempotencyKey ? idempotencyKey.trim() : null,
        idempotencyFingerprint
      });
    } catch (err: any) {
      if (err instanceof InvoiceDomainError) {
        let statusCode = 400;
        if (err.code === 'UNAUTHORIZED') statusCode = 401;
        if (err.code === 'SINGLE_LIMIT_EXCEEDED') statusCode = 429;
        if (err.code === 'LNBITS_ERROR' || err.code === 'DB_ERROR') statusCode = 502;
        if (err.code === 'CONFLICT') statusCode = 409;
        throw new AppError(err.message, statusCode, err.code);
      }
      throw err;
    }

    if (invoiceData.challengeBase64) {
      res.setHeader('PAYMENT-REQUIRED', invoiceData.challengeBase64);
      // Remove challengeBase64 from json output to keep backwards compatibility
      delete invoiceData.challengeBase64;
    }

    res.json(invoiceData);
  } catch (error) {
    next(error);
  }
};

// [K-04 FIX] Internal settlement function — called directly instead of via loopback HTTP
async function settleDemoInvoice(hash: string, preimage?: string): Promise<void> {
  const db = getDb();
  const release = await acquireTransactionLock();
  try {
    await db.run('BEGIN EXCLUSIVE TRANSACTION');
    const inv = await db.get('SELECT payment_hash, api_key, forwarded_amount_sats, status FROM invoices WHERE payment_hash = ?', hash);
    if (!inv || inv.status !== 'pending') {
      if (inv && preimage) {
        await db.run('UPDATE invoices SET preimage = ? WHERE payment_hash = ?', preimage, hash);
      }
      await db.run('COMMIT');
      return;
    }
    const merchant = await db.get('SELECT payout_mode, payout_threshold_sats, ln_address FROM merchants WHERE api_key = ?', inv.api_key);
    if (!merchant) {
      await db.run('ROLLBACK');
      return;
    }
    const payoutMode = merchant.payout_mode || 'instant';
    const payout_status = payoutMode === 'manual' ? 'pending_manual' : 'pending_threshold';
    await db.run(
      "UPDATE invoices SET status = 'settled', payout_status = ?, preimage = ? WHERE payment_hash = ?",
      payout_status, preimage || null, hash
    );
    await db.run('COMMIT');

    publishInvoiceUpdate(hash, {
      paid: true,
      status: 'settled',
      preimage: preimage || '0000000000000000000000000000000000000000000000000000000000000000',
      protocol: 'L402',
      amount_sats: inv.forwarded_amount_sats
    });
  } catch (e) {
    await db.run('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    release();
  }
}

export const checkInvoiceStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const hash = req.params.hash || (req.query.hash as string) || (req.query.payment_hash as string);
    if (!hash || hash === 'undefined' || hash === 'null' || hash === '') {
      return res.json({ paid: false, status: 'pending', error: 'Missing or empty invoice hash' });
    }

    const db = getDb();
    const invoice = await db.get('SELECT payment_hash, api_key, status, preimage, protocol, usdc_amount FROM invoices WHERE payment_hash = ?', hash);
    if (!invoice) {
      return res.json({ paid: false, status: 'pending', error: 'Invoice not found or pending settlement' });
    }

    // Allow simulation for the demo merchant (demo page testing)
    const isDemoMerchant = invoice.api_key === 'aipp_merch_5053bb61d143c879';
    const queryTxHash = req.query.tx_hash as string;
    if (invoice.status === 'pending' && isDemoMerchant && (req.query.simulate === 'true' || queryTxHash === '0xmocktxhash')) {
      await settleDemoInvoice(hash);
      invoice.status = 'settled';
      if (invoice.protocol === 'x402' || queryTxHash === '0xmocktxhash') {
        await db.run("UPDATE invoices SET preimage = '0xmocktxhash', protocol = 'x402' WHERE payment_hash = ?", hash);
        invoice.preimage = '0xmocktxhash';
        invoice.protocol = 'x402';
      } else {
        await db.run("UPDATE invoices SET preimage = '0000000000000000000000000000000000000000000000000000000000000000', protocol = 'L402' WHERE payment_hash = ?", hash);
        invoice.preimage = '0000000000000000000000000000000000000000000000000000000000000000';
        invoice.protocol = 'L402';
      }
    }

    // Handle DUAL Protocol Verification
    if (invoice.protocol === 'dual') {
      let txHash = (req.query.tx_hash || req.headers['payment-signature'] || req.headers['x-payment-signature']) as string;
      if (!txHash) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.toLowerCase().startsWith('x402 ')) {
          txHash = authHeader.substring(5).trim();
        } else if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
          txHash = authHeader.substring(7).trim();
        }
      }

      // 1. Try to verify via USDC on Base first if txHash is provided
      if (invoice.status === 'pending' && txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        // [ANTI-REPLAY] Ensure this txHash has not already been used for another settled invoice
        const alreadyUsed = await db.get("SELECT payment_hash FROM invoices WHERE preimage = ? AND status = 'settled'", txHash);
        if (alreadyUsed && alreadyUsed.payment_hash !== hash) {
          console.warn(`[x402 Anti-Replay] Transaction ${txHash} was already consumed by invoice ${alreadyUsed.payment_hash}`);
        } else {
          const isPaid = await verifyUsdcPayment(txHash, invoice.usdc_amount);
          if (isPaid) {
            const release = await acquireTransactionLock();
            try {
              await db.run('BEGIN EXCLUSIVE TRANSACTION');
              const currentInvoice = await db.get('SELECT status, api_key, usdc_amount FROM invoices WHERE payment_hash = ?', hash);
              if (currentInvoice.status === 'pending') {
                await db.run(
                  "UPDATE invoices SET status = 'settled', preimage = ?, payout_status = 'pending_manual', protocol = 'x402' WHERE payment_hash = ?",
                  txHash,
                  hash
                );

                const merchant = await db.get('SELECT payout_mode, usdc_address FROM merchants WHERE api_key = ?', invoice.api_key);
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

              publishInvoiceUpdate(hash, {
                paid: true,
                status: 'settled',
                preimage: txHash,
                protocol: 'x402',
                usdc_amount: invoice.usdc_amount
              });
            } catch (innerErr) {
              await db.run('ROLLBACK').catch(() => {});
              throw innerErr;
            } finally {
              release();
            }
          }
        }
      }

      // 2. Try to verify via Lightning (L402) if still pending
      const checkAgain = await db.get('SELECT status FROM invoices WHERE payment_hash = ?', hash);
      if (checkAgain.status === 'pending') {
        if (hash.startsWith('demo_')) {
          await settleDemoInvoice(hash);
          await db.run("UPDATE invoices SET protocol = 'L402', preimage = '0000000000000000000000000000000000000000000000000000000000000000' WHERE payment_hash = ?", hash);
        } else if (LNBITS_INVOICE_KEY) {
          const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${hash}`, {
            headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
          });
          if (verifyRes.ok) {
            const verifyData = (await verifyRes.json()) as any;
            if (verifyData.paid) {
              await settleDemoInvoice(hash, verifyData.preimage);
              await db.run("UPDATE invoices SET protocol = 'L402', preimage = ? WHERE payment_hash = ?", verifyData.preimage, hash);
            }
          }
        }
      }

      const updatedInvoice = await db.get('SELECT status, preimage, protocol FROM invoices WHERE payment_hash = ?', hash);
      return res.json({
        paid: updatedInvoice.status === 'settled',
        status: updatedInvoice.status,
        preimage: updatedInvoice.preimage || null,
        protocol: updatedInvoice.protocol
      });
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
        // [ANTI-REPLAY] Ensure this txHash has not already been used for another settled invoice
        const alreadyUsed = await db.get("SELECT payment_hash FROM invoices WHERE preimage = ? AND status = 'settled'", txHash);
        if (alreadyUsed && alreadyUsed.payment_hash !== hash) {
          console.warn(`[x402 Anti-Replay] Transaction ${txHash} was already consumed by invoice ${alreadyUsed.payment_hash}`);
        } else {
          const isPaid = await verifyUsdcPayment(txHash, invoice.usdc_amount);
          if (isPaid) {
            const release = await acquireTransactionLock();
            try {
              await db.run('BEGIN EXCLUSIVE TRANSACTION');
              const currentInvoice = await db.get('SELECT status, api_key, usdc_amount FROM invoices WHERE payment_hash = ?', hash);
              if (currentInvoice.status === 'pending') {
                await db.run(
                  "UPDATE invoices SET status = 'settled', preimage = ?, payout_status = 'pending_manual' WHERE payment_hash = ?",
                  txHash,
                  hash
                );

                const merchant = await db.get('SELECT payout_mode, usdc_address FROM merchants WHERE api_key = ?', invoice.api_key);
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

              publishInvoiceUpdate(hash, {
                paid: true,
                status: 'settled',
                preimage: txHash,
                protocol: 'x402',
                usdc_amount: invoice.usdc_amount
              });
            } catch (innerErr) {
              await db.run('ROLLBACK').catch(() => {});
              throw innerErr;
            } finally {
              release();
            }
          }
        }
      }

      const updatedInvoice = await db.get('SELECT status, preimage FROM invoices WHERE payment_hash = ?', hash);
      return res.json({
        paid: updatedInvoice.status === 'settled',
        status: updatedInvoice.status,
        preimage: updatedInvoice.preimage || null
      });
    }

    // Default L402 Status Check
    // [K-04 FIX] Use direct function call instead of loopback HTTP with secret-in-URL
    if (invoice.status === 'pending' && hash.startsWith('demo_')) {
      await settleDemoInvoice(hash);
      const updatedInvoice = await db.get('SELECT status FROM invoices WHERE payment_hash = ?', hash);
      return res.json({ 
        paid: updatedInvoice.status === 'settled', 
        status: updatedInvoice.status, 
        preimage: '0000000000000000000000000000000000000000000000000000000000000000' 
      });
    }

    if (invoice.status === 'pending' && !hash.startsWith('demo_') && LNBITS_INVOICE_KEY) {
      const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${hash}`, {
        headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
      });
      if (verifyRes.ok) {
        const verifyData = (await verifyRes.json()) as any;
        if (verifyData.paid) {
          // [K-04 FIX] Also use direct settlement here instead of loopback HTTP
          await settleDemoInvoice(hash, verifyData.preimage); // reuses the same atomic settlement logic
          const updatedInvoice = await db.get('SELECT status, preimage, amount_sats FROM invoices WHERE payment_hash = ?', hash);
          return res.json({ 
            paid: updatedInvoice.status === 'settled', 
            status: updatedInvoice.status, 
            preimage: verifyData.preimage || updatedInvoice.preimage || null,
            amount_sats: updatedInvoice.amount_sats
          });
        }
      }
    }

    if (invoice.status === 'settled' && !invoice.preimage && LNBITS_INVOICE_KEY && !hash.startsWith('demo_')) {
      const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${hash}`, {
        headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
      });
      if (verifyRes.ok) {
        const verifyData = (await verifyRes.json()) as any;
        if (verifyData.preimage) {
          await db.run('UPDATE invoices SET preimage = ? WHERE payment_hash = ?', verifyData.preimage, hash);
          invoice.preimage = verifyData.preimage;
        }
      }
    }

    res.json({ 
      paid: invoice.status === 'settled', 
      status: invoice.status, 
      preimage: invoice.preimage || null,
      amount_sats: invoice.amount_sats
    });
  } catch (error) {
    next(error);
  }
};

export const getReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = req.params.hash;
    if (!hash) {
      throw new AppError('Missing invoice hash', 400, 'BAD_REQUEST');
    }

    const db = getDb();
    const invoice = await db.get(`
      SELECT 
        i.payment_hash, i.api_key, i.amount_sats, i.commission_sats, i.forwarded_amount_sats, 
        i.status, i.protocol, i.usdc_amount, i.created_at, i.preimage,
        m.ln_address, m.usdc_address
      FROM invoices i
      LEFT JOIN merchants m ON i.api_key = m.api_key
      WHERE i.payment_hash = ?
    `, hash);

    if (!invoice) {
      throw new AppError('Invoice not found', 404, 'NOT_FOUND');
    }

    if (invoice.status === 'pending' && LNBITS_INVOICE_KEY && !hash.startsWith('demo_')) {
      const verifyRes = await fetch(`${LNBITS_URL}/api/v1/payments/${hash}`, {
        headers: { 'X-Api-Key': LNBITS_INVOICE_KEY }
      });
      if (verifyRes.ok) {
        const verifyData = (await verifyRes.json()) as any;
        if (verifyData.paid) {
          await settleDemoInvoice(hash);
          invoice.status = 'settled';
          invoice.preimage = verifyData.preimage;
        }
      }
    }

    if (invoice.status !== 'settled') {
      throw new AppError('Receipts are only available for settled invoices', 400, 'NOT_SETTLED');
    }

    const receipt = {
      receipt_id: `rec_${crypto.randomUUID()}`,
      transaction_id: invoice.payment_hash,
      date: invoice.created_at,
      status: invoice.status,
      compliance: {
        regulation: 'EU AI Act Article 26',
        note: 'This receipt serves as a verifiable record of a machine-to-machine transaction.'
      },
      payment_details: {
        protocol: invoice.protocol,
        proof: invoice.preimage || null,
        merchant_destination: invoice.protocol === 'x402' ? invoice.usdc_address : invoice.ln_address,
      },
      financials: {
        currency: invoice.protocol === 'x402' ? 'USDC' : 'SATS',
        total_amount: invoice.protocol === 'x402' ? invoice.usdc_amount : invoice.amount_sats,
        merchant_amount: invoice.protocol === 'x402' ? invoice.usdc_amount * 0.99 : invoice.forwarded_amount_sats,
        platform_fee: invoice.protocol === 'x402' ? invoice.usdc_amount * 0.01 : invoice.commission_sats
      }
    };

    res.json(receipt);
  } catch (error) {
    next(error);
  }
};

/**
 * Real-time SSE (Server-Sent Events) endpoint for checkout pages.
 * Delivers 0 ms latency settlement notifications with zero database polling overhead.
 */
export const streamInvoiceStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = req.params.hash || (req.query.hash as string) || (req.query.payment_hash as string);
    if (!hash || hash === 'undefined' || hash === 'null' || hash.trim() === '') {
      return res.status(400).json({ error: 'Missing invoice hash', status: 'bad_request' });
    }

    // Set Server-Sent Events headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*'
    });

    res.write(': connected\n\n');

    const db = getDb();
    const invoice = await db.get(
      'SELECT payment_hash, status, preimage, protocol, amount_sats, usdc_amount FROM invoices WHERE payment_hash = ?',
      hash
    );

    if (!invoice) {
      res.write(`data: ${JSON.stringify({ paid: false, status: 'not_found', error: 'Invoice not found' })}\n\n`);
      return res.end();
    }

    // If already settled, send event immediately and close stream
    if (invoice.status === 'settled') {
      res.write(`data: ${JSON.stringify({
        paid: true,
        status: 'settled',
        preimage: invoice.preimage || null,
        protocol: invoice.protocol,
        amount_sats: invoice.amount_sats,
        usdc_amount: invoice.usdc_amount
      })}\n\n`);
      return res.end();
    }

    // Subscribe to in-memory event bus
    let isClosed = false;
    const unsubscribe = subscribeToInvoice(hash, (eventData) => {
      if (isClosed) return;
      try {
        res.write(`data: ${JSON.stringify(eventData)}\n\n`);
        if (eventData.paid) {
          isClosed = true;
          clearInterval(heartbeat);
          unsubscribe();
          res.end();
        }
      } catch {
        isClosed = true;
        clearInterval(heartbeat);
        unsubscribe();
      }
    });

    // 15-second heartbeat ping to prevent connection timeout by reverse proxies / firewalls
    const heartbeat = setInterval(() => {
      if (isClosed) {
        clearInterval(heartbeat);
        return;
      }
      try {
        res.write(': ping\n\n');
      } catch {
        isClosed = true;
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 15000);

    req.on('close', () => {
      isClosed = true;
      clearInterval(heartbeat);
      unsubscribe();
    });

  } catch (error) {
    next(error);
  }
};

