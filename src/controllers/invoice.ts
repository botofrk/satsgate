import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb, acquireTransactionLock } from '../config/database';
import { checkLimit } from '../services/limiter';
import { getBtcUsdRate } from '../services/price';
import { AppError } from '../utils/error';
import { isSafeCallbackUrl } from './webhook';
import { LNBITS_INVOICE_KEY, LNBITS_URL, MAX_SINGLE_REQUEST_USD, USDC_ADDRESS, BASE_NETWORK_NAME } from '../config/env';
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
    const merchant = await db.get('SELECT api_key, usdc_address, payout_mode FROM merchants WHERE api_key = ?', apiKey);
    if (!merchant) {
      throw new AppError('Invalid AIPP API key', 401, 'UNAUTHORIZED');
    }

    let body: any = req.body;
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      try {
        body = JSON.parse(req.body.toString('utf8'));
      } catch {
        throw new AppError('Invalid JSON body', 400, 'INVALID_JSON');
      }
    }

    // [I-06 FIX] Whitelist protocol field
    const rawProtocol = typeof body.protocol === 'string' ? body.protocol.toUpperCase() : 'DUAL';
    if (!['L402', 'X402', 'DUAL'].includes(rawProtocol)) {
      throw new AppError('protocol must be L402, X402 or DUAL', 400, 'INVALID_PROTOCOL');
    }
    const protocol = rawProtocol;

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

      if (MAX_SINGLE_REQUEST_USD > 0 && amount_usd > MAX_SINGLE_REQUEST_USD) {
        throw new AppError(`Single request exceeds max allowed ($${MAX_SINGLE_REQUEST_USD})`, 400, 'SINGLE_LIMIT_EXCEEDED');
      }
      await checkLimit(apiKey, amount_usd);

      const paymentHash = 'x402_' + crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

      await db.run(
        'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, callback_url, protocol, usdc_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        paymentHash,
        apiKey,
        0,
        0,
        0,
        'pending',
        callback_url,
        'x402',
        amount_usd,
        new Date().toISOString()
      );

      const challengeObj = {
        scheme: 'exact',
        network: BASE_NETWORK_NAME,
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

    if (protocol === 'DUAL') {
      if (!merchant.usdc_address) {
        throw new AppError('Merchant has not configured a Base USDC payout address (required for DUAL protocol)', 400, 'MERCHANT_NO_USDC_ADDRESS');
      }

      let amount_usd = body.amount_usd;
      let amount_sats = body.amount_sats;

      if (amount_usd === undefined && amount_sats !== undefined) {
        amount_usd = (amount_sats / 100_000_000) * getBtcUsdRate();
      } else if (amount_usd !== undefined && amount_sats === undefined) {
        amount_sats = Math.ceil((amount_usd / getBtcUsdRate()) * 100_000_000);
      }

      if (amount_usd === undefined || isNaN(amount_usd) || amount_usd < 0.01 || amount_usd > 100.0) {
        throw new AppError('USD amount must be between 0.01 and 100.00 USD (or equivalent sats)', 400, 'INVALID_AMOUNT');
      }
      if (!Number.isInteger(amount_sats) || amount_sats < 1 || amount_sats > 1000000) {
        throw new AppError('Sats amount must be an integer between 1 and 1,000,000 satoshis (or equivalent USD)', 400, 'INVALID_AMOUNT');
      }

      if (MAX_SINGLE_REQUEST_USD > 0 && amount_usd > MAX_SINGLE_REQUEST_USD) {
        throw new AppError(`Single request exceeds max allowed ($${MAX_SINGLE_REQUEST_USD})`, 400, 'SINGLE_LIMIT_EXCEEDED');
      }
      await checkLimit(apiKey, amount_usd);

      const commission = Math.max(5, Math.ceil(amount_sats * 0.01));
      const forwarded = Math.max(1, amount_sats - commission);

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
            memo: `AIPP Dual Invoice`,
          }),
        });

        if (!response.ok) {
          throw new AppError(`LNBits returned status ${response.status}`, 502, 'LNBITS_ERROR');
        }

        const data = (await response.json()) as any;
        if (!data?.payment_hash || !data?.payment_request) {
          throw new AppError('Malformed response from LNBits', 502, 'LNBITS_ERROR');
        }
        paymentHash = data.payment_hash;
        paymentRequest = data.payment_request;
      } else {
        paymentHash = 'demo_' + crypto.randomBytes(8).toString('hex');
        paymentRequest = `lnbc${amount_sats}n1demo_invoice_generated_by_aipp_backend_for_testing_purposes`;
      }

      await db.run(
        'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, callback_url, protocol, usdc_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        paymentHash,
        apiKey,
        amount_sats,
        commission,
        forwarded,
        'pending',
        callback_url,
        'dual',
        amount_usd,
        new Date().toISOString()
      );

      const challengeObj = {
        scheme: 'exact',
        network: BASE_NETWORK_NAME,
        payTo: getGatewayAddress(),
        price: amount_usd.toFixed(2),
        token: USDC_ADDRESS,
        payment_hash: paymentHash
      };
      
      const challengeBase64 = Buffer.from(JSON.stringify(challengeObj), 'utf8').toString('base64');
      res.setHeader('PAYMENT-REQUIRED', challengeBase64);

      return res.json({
        payment_hash: paymentHash,
        protocol: 'dual',
        amount_sats,
        amount_usd,
        payment_request: paymentRequest,
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

    // [I-03 FIX] Require integer amount_sats >= 1
    if (!Number.isInteger(amount_sats) || amount_sats < 1 || amount_sats > 1000000) {
      throw new AppError('Transaction amount must be an integer between 1 and 1,000,000 satoshis (or equivalent USD)', 400, 'INVALID_AMOUNT');
    }

    const costUsd = (amount_sats / 100_000_000) * getBtcUsdRate();
    if (MAX_SINGLE_REQUEST_USD > 0 && costUsd > MAX_SINGLE_REQUEST_USD) {
      throw new AppError(`Single request exceeds max allowed ($${MAX_SINGLE_REQUEST_USD})`, 400, 'SINGLE_LIMIT_EXCEEDED');
    }
    await checkLimit(apiKey, costUsd);

    const commission = Math.max(5, Math.ceil(amount_sats * 0.01));
    const forwarded = Math.max(1, amount_sats - commission);

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
          // [I-08 FIX] Use random short ID instead of api_key suffix in memo
          memo: `AIPP Invoice`,
        }),
      });

      if (!response.ok) {
        throw new AppError(`LNBits returned status ${response.status}`, 502, 'LNBITS_ERROR');
      }

      // [I-04 FIX] Validate LNBits response before using
      const data = (await response.json()) as any;
      if (!data?.payment_hash || !data?.payment_request) {
        throw new AppError('Malformed response from LNBits — missing payment_hash or payment_request', 502, 'LNBITS_ERROR');
      }
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
          } catch (innerErr) {
            await db.run('ROLLBACK').catch(() => {});
            throw innerErr;
          } finally {
            release();
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
              await settleDemoInvoice(hash);
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
          } catch (innerErr) {
            await db.run('ROLLBACK').catch(() => {});
            throw innerErr;
          } finally {
            release();
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
