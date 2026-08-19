import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb, acquireTransactionLock } from '../config/database';
import { AppError } from '../utils/error';
import { renderPaymentPage } from './payLink';
import { accessTokenExpiry, bearerToken, createAccessToken, credentialsMatch, hashAccessCredential } from '../services/contentAccess';

function origin(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

function parseSchema(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

async function loadTag(linkId: string) {
  const db = getDb();
  const tag = await db.get(`
    SELECT p.id, p.title, p.amount_usd, p.capability_type, p.description,
           p.input_schema, p.output_schema, p.created_at,
           m.ln_address, m.usdc_address
    FROM payment_links p
    JOIN merchants m ON m.api_key = p.api_key
    WHERE p.id = ?
  `, linkId);
  if (!tag) throw new AppError('Smart Tag not found', 404, 'NOT_FOUND');
  return tag;
}

function manifestFor(req: Request, tag: any) {
  const base = origin(req);
  const methods = [] as any[];
  if (tag.ln_address) {
    methods.push({
      protocol: 'L402',
      network: 'bitcoin-lightning',
      fee_policy: '3% + 5 sats per successful transaction',
      address: tag.ln_address
    });
  }
  if (tag.usdc_address) {
    methods.push({
      protocol: 'x402',
      network: 'base',
      chain_id: 8453,
      asset: 'USDC',
      contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      receiver: tag.usdc_address,
      fee_policy: '3% per successful transaction ($0.001 minimum fee)'
    });
  }

  return {
    spec: 'https://aipp.dev/spec/open-tag/1.0',
    spec_version: '1.0',
    id: tag.id,
    kind: 'aipp.open-tag',
    capability_type: tag.capability_type || 'link',
    name: tag.title,
    description: tag.description || undefined,
    price: { amount_usd: Number(tag.amount_usd).toFixed(2), currency: 'USD' },
    accepts: methods,
    input_schema: parseSchema(tag.input_schema),
    output_schema: parseSchema(tag.output_schema),
    interfaces: {
      human: `${base}/t/${tag.id}`,
      manifest: `${base}/t/${tag.id}/manifest`,
      content: `${base}/t/${tag.id}/content`,
      create_payment: `${base}/t/${tag.id}/invoice`,
      issue_access_token: `${base}/t/${tag.id}/access-token`,
      receipt: `${base}/t/${tag.id}/receipt/{payment_hash}`
    },
    payment_binding: {
      resource: `/t/${tag.id}`,
      proof_scope: 'exact-tag',
      authorization: 'Bearer access_token',
      token_lifetime: '7 days',
      replay_policy: 'reusable-until-expiry; rotated-on-reissue'
    },
    address_semantics: {
      receiver: 'Merchant settlement destination (where AIPP forwards funds after fee).',
      pay_to: 'Payment destination for this transaction (AIPP gateway). See spec /spec/open-tag/1.0.'
    },
    created_at: tag.created_at
  };
}

export const getOpenTag = async (req: Request, res: Response, next: NextFunction) => {
  const accept = req.accepts(['html', 'json']);
  res.setHeader('Link', `<${origin(req)}/t/${req.params.linkId}/manifest>; rel="describedby"; type="application/json"`);
  if (accept === 'json' || req.query.format === 'json') return getOpenTagManifest(req, res, next);
  return renderPaymentPage(req, res, next);
};

export const getOpenTagManifest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tag = await loadTag(req.params.linkId);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.setHeader('Vary', 'Accept');
    res.setHeader('Link', `<${origin(req)}/t/${tag.id}>; rel="alternate"; type="text/html"`);
    res.json(manifestFor(req, tag));
  } catch (error) { next(error); }
};

export const getOpenTagContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tag = await loadTag(req.params.linkId);
    const token = bearerToken(req);
    if (token) {
      const db = getDb();
      const row = await db.get(
        `SELECT i.status, p.redirect_url
         FROM invoices i JOIN payment_links p ON p.id = i.tag_id
         WHERE i.access_token_hash = ? AND i.tag_id = ? AND i.access_token_expires_at > ?`,
        hashAccessCredential(token), tag.id, new Date().toISOString()
      );
      if (row && row.status === 'settled') {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.json({
          success: true,
          tag_id: tag.id,
          title: tag.title,
          message: 'AIPP autonomous payment completed.',
          content: row.redirect_url ? { type: 'redirect', url: row.redirect_url } : { type: 'data' }
        });
      }
    }

    if (req.query.payment_hash || req.headers['x-payment-hash']) {
      return res.status(410).json({
        error: 'Payment hash authorization has been removed',
        code: 'PAYMENT_HASH_AUTHORIZATION_REMOVED',
        tag_id: tag.id
      });
    }

    // Return 402 Payment Required with HTTP 402 challenge details
    const base = origin(req);
    res.setHeader('WWW-Authenticate', `L402 invoice="lnbc_sample_aipp_${tag.id}", macaroon="ag_sample_aipp_${tag.id}"`);
    res.setHeader('Link', `<${base}/t/${tag.id}/manifest>; rel="describedby"; type="application/json"`);
    return res.status(402).json({
      error: 'Payment Required',
      status: 402,
      tag_id: tag.id,
      title: tag.title,
      price: { amount_usd: Number(tag.amount_usd).toFixed(2), currency: 'USD' },
      manifest_url: `${base}/t/${tag.id}/manifest`,
      create_payment_url: `${base}/t/${tag.id}/invoice`,
      challenge_note: 'The WWW-Authenticate invoice is a sample for discovery. Create a payable invoice via create_payment_url: POST { "mode": "L402" } (or { "mode": "X402" } for USDC).',
      payment_instructions: {
        lightning: 'POST invoice to create_payment_url with { mode: "L402" } or { protocol: "L402" }',
        base_usdc: 'POST invoice to create_payment_url with { mode: "X402" } or { protocol: "x402" }, then transfer USDC to pay_to on Base (Chain ID 8453).'
      }
    });
  } catch (error) { next(error); }
};

export const issueOpenTagAccessToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const paymentHash = typeof req.body?.payment_hash === 'string' ? req.body.payment_hash : '';
    const claimSecret = typeof req.body?.access_claim_secret === 'string' ? req.body.access_claim_secret : '';
    if (!paymentHash || !claimSecret) {
      throw new AppError('Payment hash and access claim secret are required', 400, 'MISSING_ACCESS_CLAIM');
    }

    const db = getDb();
    const invoice = await db.get(
      'SELECT status, access_claim_secret_hash FROM invoices WHERE payment_hash = ? AND tag_id = ?',
      paymentHash, req.params.linkId
    );
    if (!invoice) throw new AppError('Invoice is not bound to this Smart Tag', 404, 'PROOF_NOT_BOUND');
    if (invoice.status !== 'settled') throw new AppError('Payment is not settled', 402, 'NOT_SETTLED');
    if (!invoice.access_claim_secret_hash) {
      throw new AppError('This invoice predates secure content access; create a new checkout', 410, 'LEGACY_INVOICE_REQUIRES_NEW_CHECKOUT');
    }
    if (!credentialsMatch(invoice.access_claim_secret_hash, claimSecret)) {
      throw new AppError('Invalid access claim', 401, 'INVALID_ACCESS_CLAIM');
    }

    const accessToken = createAccessToken();
    const expiresAt = accessTokenExpiry();
    const releaseAccessWrite = await acquireTransactionLock();
    try {
      await db.run(
        'UPDATE invoices SET access_token_hash = ?, access_token_expires_at = ? WHERE payment_hash = ? AND tag_id = ?',
        hashAccessCredential(accessToken), expiresAt, paymentHash, req.params.linkId
      );
    } finally {
      releaseAccessWrite();
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ access_token: accessToken, token_type: 'Bearer', expires_at: expiresAt });
  } catch (error) { next(error); }
};

export const unlockOpenTag = async (req: Request, res: Response, next: NextFunction) => {
  try {
    return res.status(410).json({
      error: 'Payment hash authorization has been removed',
      code: 'PAYMENT_HASH_AUTHORIZATION_REMOVED',
      access_token_url: `${origin(req)}/t/${req.params.linkId}/access-token`
    });
  } catch (error) { next(error); }
};

export const getOpenTagReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const row = await db.get(`
      SELECT i.payment_hash, i.status, i.protocol, i.amount_sats, i.usdc_amount,
             i.commission_sats, i.forwarded_amount_sats, i.preimage, i.created_at,
             i.tag_id, p.title
      FROM invoices i JOIN payment_links p ON p.id = i.tag_id
      WHERE i.payment_hash = ? AND i.tag_id = ?
    `, req.params.hash, req.params.linkId);
    if (!row) throw new AppError('Receipt does not belong to this Smart Tag', 404, 'PROOF_NOT_BOUND');
    if (row.status !== 'settled') throw new AppError('Receipt is only available after settlement', 402, 'NOT_SETTLED');

    const payload = {
      receipt_id: `rec_${crypto.createHash('sha256').update(row.payment_hash).digest('hex').slice(0, 24)}`,
      tag_id: row.tag_id,
      resource: `/t/${row.tag_id}`,
      transaction_id: row.payment_hash,
      status: 'settled',
      protocol: row.protocol,
      proof: row.preimage || null,
      amount: row.protocol === 'x402' ? row.usdc_amount : row.amount_sats,
      currency: row.protocol === 'x402' ? 'USDC' : 'SATS',
      issued_at: row.created_at
    };
    const secret = process.env.AIPP_RECEIPT_SECRET;
    const signature = secret
      ? crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('base64url')
      : null;
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ ...payload, signature: signature ? { algorithm: 'HS256', value: signature } : null });
  } catch (error) { next(error); }
};
