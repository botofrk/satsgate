import crypto from 'crypto';
import { getDb } from '../config/database';
import { getBtcUsdRate } from './price';
import { LNBITS_INVOICE_KEY, LNBITS_URL, LNBITS_WEBHOOK_SECRET, MAX_SINGLE_REQUEST_USD, USDC_ADDRESS, BASE_NETWORK_NAME } from '../config/env';
import { getGatewayAddress } from './base';
import { ethers } from 'ethers';
import { calculateLightningFeeSats } from './fees';

export class InvoiceDomainError extends Error {
  public code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'InvoiceDomainError';
    this.code = code;
  }
}

export interface GenerateInvoiceOptions {
  apiKey: string;
  protocol: 'L402' | 'X402' | 'DUAL';
  amountUsd?: number | string;
  amountSats?: number;
  callbackUrl?: string | null;
  memo?: string;
  idempotencyKey?: string | null;
  idempotencyFingerprint?: string | null;
  tagId?: string | null;
}

export interface InvoiceResult {
  payment_hash: string;
  payment_request?: string;
  protocol: string;
  amount_usd?: number;
  amount_sats?: number;
  commission_sats?: number;
  merchant_amount_sats?: number;
  pay_to?: string;
  network?: string;
  token?: string;
  receiver?: string;
  status: string;
  expires_in: number;
  challengeBase64?: string;
  tag_id?: string;
}

export async function generateInvoiceData(options: GenerateInvoiceOptions): Promise<InvoiceResult> {
  const db = getDb();
  
  // 1. Merchant Validation
  const merchant = await db.get('SELECT api_key, usdc_address, payout_mode FROM merchants WHERE api_key = ?', options.apiKey);
  if (!merchant) {
    throw new InvoiceDomainError('Invalid AIPP API key or Merchant not found', 'UNAUTHORIZED');
  }

  // 2. Protocol Validation
  if (!['L402', 'X402', 'DUAL'].includes(options.protocol)) {
    throw new InvoiceDomainError('Protocol must be L402, X402 or DUAL', 'INVALID_PROTOCOL');
  }

  if (options.protocol === 'X402' || options.protocol === 'DUAL') {
    if (!merchant.usdc_address) {
      throw new InvoiceDomainError('Merchant has not configured a Base USDC payout address', 'MERCHANT_NO_USDC_ADDRESS');
    }
  }

  // 3. Amount & Limits Calculation
  let amount_usd = options.amountUsd;
  let amount_sats = options.amountSats;

  // Enforce string parsing for USD
  let grossUnits = 0n;
  if (amount_usd !== undefined) {
    const amountStr = typeof amount_usd === 'number' ? amount_usd.toString() : amount_usd;
    
    // Strict format validation: no scientific notation, no leading '+', no '.5' or '1.'
    if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(amountStr)) {
      throw new InvoiceDomainError('Invalid USDC amount format. Must be a valid positive number with up to 6 decimal places (e.g. "12.345678")', 'INVALID_AMOUNT');
    }

    try {
      grossUnits = ethers.parseUnits(amountStr, 6);
      if (grossUnits <= 0n) {
        throw new InvoiceDomainError('Amount must be positive', 'INVALID_AMOUNT');
      }
      
      // Ensure it fits within SQLite Signed 64-bit bounds (approx 9e18) safely
      // 9,223,372,036,854,775,807 is max INT in SQLite
      if (grossUnits > 9000000000000000000n) {
        throw new InvoiceDomainError('Amount is too large', 'INVALID_AMOUNT');
      }
    } catch (e) {
      throw new InvoiceDomainError('Invalid USDC amount format', 'INVALID_AMOUNT');
    }
    
    // Convert back to number ONLY for legacy logic or limits checking
    amount_usd = Number(ethers.formatUnits(grossUnits, 6));
  }

  if (amount_usd === undefined && amount_sats !== undefined) {
    amount_usd = (amount_sats / 100_000_000) * getBtcUsdRate();
    grossUnits = ethers.parseUnits(amount_usd.toFixed(6), 6);
  } else if (amount_usd !== undefined && amount_sats === undefined) {
    amount_sats = Math.ceil((amount_usd / getBtcUsdRate()) * 100_000_000);
  } else if (amount_usd === undefined && amount_sats === undefined) {
    throw new InvoiceDomainError('Must provide amountUsd or amountSats', 'INVALID_AMOUNT');
  }

  if (amount_usd === undefined || isNaN(amount_usd) || amount_usd < 0.01 || amount_usd > 100.0) {
    throw new InvoiceDomainError('USD amount must be between 0.01 and 100.00 USD (or equivalent sats)', 'INVALID_AMOUNT');
  }

  // Minimum invoice amount check
  const percentageFee = (grossUnits + 99n) / 100n; // 1% rounded up
  const minimumBaseFeeUnits = 1000n; // $0.001 USDC minimum fee — keeps the disclosed 1% policy and allows $0.01 micro-tags on x402
  const feeUnits = percentageFee > minimumBaseFeeUnits ? percentageFee : minimumBaseFeeUnits;
  const netUnits = grossUnits - feeUnits;
  
  if (options.protocol !== 'L402' && netUnits <= 0n) {
    throw new InvoiceDomainError('Invoice amount too small to cover minimum network and service fees', 'INVALID_AMOUNT');
  }

  if (options.protocol !== 'X402') {
    if (amount_sats === undefined || !Number.isInteger(amount_sats) || amount_sats < 1 || amount_sats > 1000000) {
      throw new InvoiceDomainError('Transaction amount must be an integer between 1 and 1,000,000 satoshis', 'INVALID_AMOUNT');
    }
  }

  if (MAX_SINGLE_REQUEST_USD > 0 && amount_usd > MAX_SINGLE_REQUEST_USD) {
    throw new InvoiceDomainError(`Single request exceeds max allowed ($${MAX_SINGLE_REQUEST_USD})`, 'SINGLE_LIMIT_EXCEEDED');
  }

  const protocolLower = options.protocol.toLowerCase();

  // 4. Idempotency Check & Transaction
  let paymentHash = '';
  let paymentRequest = '';
  let finalCommissionSats = 0;
  let finalForwardedSats = 0;

  if (options.protocol === 'X402') {
    paymentHash = 'x402_' + crypto.randomBytes(16).toString('hex');
  } else {
    // LNBITS
    // Public prices are merchant-net prices. Add the disclosed AIPP fee on top.
    const merchantPriceSats = amount_sats!;
    finalCommissionSats = calculateLightningFeeSats(merchantPriceSats);
    finalForwardedSats = merchantPriceSats;
    amount_sats = merchantPriceSats + finalCommissionSats;
    
    if (LNBITS_INVOICE_KEY) {
      const webhookUrl = process.env.API_BASE_URL
        ? `${process.env.API_BASE_URL}/lnbits-webhook?secret=${LNBITS_WEBHOOK_SECRET}`
        : `https://api.aipp.dev/lnbits-webhook?secret=${LNBITS_WEBHOOK_SECRET}`;

      // Need to run this outside transaction to avoid blocking DB during HTTP request
      const response = await fetch(`${LNBITS_URL}/api/v1/payments`, {
        method: 'POST',
        headers: { 'X-Api-Key': LNBITS_INVOICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          out: false,
          amount: amount_sats,
          memo: options.memo || `AIPP Invoice`,
          webhook: webhookUrl
        }),
      });

      if (!response.ok) {
        throw new InvoiceDomainError(`LNBits returned status ${response.status}`, 'LNBITS_ERROR');
      }

      const data = (await response.json()) as any;
      if (!data?.payment_hash || !data?.payment_request) {
        throw new InvoiceDomainError('Malformed response from LNBits', 'LNBITS_ERROR');
      }
      paymentHash = data.payment_hash;
      paymentRequest = data.payment_request;
    } else {
      paymentHash = 'demo_' + crypto.randomBytes(8).toString('hex');
      paymentRequest = `lnbc${amount_sats}n1demo_invoice_generated_by_aipp_backend_for_testing_purposes`;
    }
  }

  // Perform DB insertion atomically with idempotency
  try {
    await db.run('BEGIN EXCLUSIVE TRANSACTION');
    
    if (options.idempotencyKey && options.idempotencyFingerprint) {
      // Check existing
      const existingIdem = await db.get(
        'SELECT request_fingerprint, invoice_id FROM invoice_idempotency WHERE merchant_id = ? AND idempotency_key = ?',
        merchant.api_key, options.idempotencyKey
      );
      
      if (existingIdem) {
        if (existingIdem.request_fingerprint !== options.idempotencyFingerprint) {
          await db.run('ROLLBACK');
          throw new InvoiceDomainError('Idempotency key already used with different request parameters', 'CONFLICT');
        }
        
        // Return existing invoice
        const existingInv = await db.get('SELECT * FROM invoices WHERE payment_hash = ?', existingIdem.invoice_id);
        await db.run('ROLLBACK'); // Rollback the write lock since we just read
        if (!existingInv) {
          throw new InvoiceDomainError('Invoice linked to idempotency key not found', 'DB_ERROR');
        }
        return formatResponse(existingInv, existingInv.usdc_amount, options.protocol, merchant.usdc_address);
      }
      
    }
    
    // Insert actual invoice
    await db.run(
      `INSERT INTO invoices (
        payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, 
        status, callback_url, protocol, usdc_amount, 
        usdc_amount_units, service_fee_usdc_units, net_usdc_units, tag_id, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
      paymentHash, 
      options.apiKey, 
      amount_sats || 0, 
      finalCommissionSats, 
      finalForwardedSats,
      options.callbackUrl || null,
      protocolLower,
      amount_usd,
      grossUnits.toString(),
      feeUnits.toString(),
      netUnits.toString(),
      options.tagId || null,
      new Date().toISOString()
    );
    
    if (options.idempotencyKey && options.idempotencyFingerprint) {
      // Reserve it
      await db.run(
        'INSERT INTO invoice_idempotency (merchant_id, idempotency_key, request_fingerprint, invoice_id, created_at) VALUES (?, ?, ?, ?, ?)',
        merchant.api_key, options.idempotencyKey, options.idempotencyFingerprint, paymentHash, new Date().toISOString()
      );
    }
    
    await db.run('COMMIT');
  } catch (err: any) {
    await db.run('ROLLBACK').catch(() => {});
    if (err instanceof InvoiceDomainError) throw err;
    console.error('[InvoiceService] DB Insert failed:', err);
    throw new InvoiceDomainError('Invoice generated but failed to save in database', 'DB_ERROR');
  }
  return formatResponse({
    payment_hash: paymentHash,
    payment_request: paymentRequest,
    amount_sats: amount_sats!,
    commission_sats: finalCommissionSats,
    forwarded_amount_sats: finalForwardedSats,
    amount_usd,
    protocol: protocolLower
    ,tag_id: options.tagId || undefined
  }, amount_usd, options.protocol, merchant.usdc_address);
}

// Helpers
async function insertInvoice(db: any, paymentHash: string, apiKey: string, amountSats: number, commissionSats: number, forwarded: number, callbackUrl: string | null | undefined, protocol: string, usdcAmount: number) {
  await db.run(
    'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, callback_url, protocol, usdc_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    paymentHash,
    apiKey,
    amountSats,
    commissionSats,
    forwarded,
    'pending',
    callbackUrl || null,
    protocol,
    usdcAmount,
    new Date().toISOString()
  );
}

function formatResponse(dbRecord: any, amountUsd: number, originalProtocol: string, receiver?: string): InvoiceResult {
  const isX402 = originalProtocol === 'X402';
  const isDual = originalProtocol === 'DUAL';
  const isL402 = originalProtocol === 'L402';

  const result: InvoiceResult = {
    payment_hash: dbRecord.payment_hash,
    protocol: dbRecord.protocol,
    status: 'pending',
    expires_in: 3600
  };
  if (dbRecord.tag_id) result.tag_id = dbRecord.tag_id;

  if (isL402) {
    result.payment_request = dbRecord.payment_request;
    result.amount_sats = dbRecord.amount_sats;
    result.commission_sats = dbRecord.commission_sats;
    result.merchant_amount_sats = dbRecord.forwarded_amount_sats;
  }

  if (isDual) {
    result.payment_request = dbRecord.payment_request;
    result.amount_sats = dbRecord.amount_sats;
    result.commission_sats = dbRecord.commission_sats;
    result.merchant_amount_sats = dbRecord.forwarded_amount_sats;
    result.amount_usd = amountUsd;
  }

  if (isX402) {
    result.amount_usd = amountUsd;
  }

  if (isX402 || isDual) {
    const challengeObj = {
      scheme: 'exact',
      network: BASE_NETWORK_NAME,
      payTo: getGatewayAddress(),
      price: amountUsd.toFixed(2),
      token: USDC_ADDRESS,
      payment_hash: dbRecord.payment_hash
      ,resource: dbRecord.tag_id ? `/t/${dbRecord.tag_id}` : undefined
    };
    result.challengeBase64 = Buffer.from(JSON.stringify(challengeObj), 'utf8').toString('base64');
    result.pay_to = challengeObj.payTo;
    result.network = challengeObj.network;
    result.token = challengeObj.token;
    if (receiver) result.receiver = receiver;
  }

  return result;
}
