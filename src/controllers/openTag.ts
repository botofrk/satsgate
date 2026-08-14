import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { AppError } from '../utils/error';
import { renderPaymentPage } from './payLink';

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
  if (tag.ln_address) methods.push({ protocol: 'L402', network: 'bitcoin-lightning' });
  if (tag.usdc_address) methods.push({ protocol: 'x402', network: 'base', asset: 'USDC' });

  return {
    spec: 'https://aipp.dev/spec/open-tag/1.0',
    spec_version: '1.0',
    id: tag.id,
    kind: 'aipp.open-tag',
    capability_type: tag.capability_type || 'link',
    name: tag.title,
    description: tag.description || undefined,
    price: { amount: Number(tag.amount_usd).toFixed(2), currency: 'USD' },
    accepts: methods,
    input_schema: parseSchema(tag.input_schema),
    output_schema: parseSchema(tag.output_schema),
    interfaces: {
      human: `${base}/t/${tag.id}`,
      manifest: `${base}/t/${tag.id}/manifest`,
      create_payment: `${base}/t/${tag.id}/invoice`,
      verify_and_unlock: `${base}/t/${tag.id}/unlock/{payment_hash}`,
      receipt: `${base}/t/${tag.id}/receipt/{payment_hash}`
    },
    payment_binding: {
      resource: `/t/${tag.id}`,
      proof_scope: 'exact-tag',
      replay_policy: 'one-proof-one-invoice'
    },
    created_at: tag.created_at
  };
}

export const getOpenTag = async (req: Request, res: Response, next: NextFunction) => {
  const accept = req.accepts(['html', 'json']);
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

export const unlockOpenTag = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const row = await db.get(`
      SELECT i.payment_hash, i.status, i.protocol, i.preimage, i.tag_id,
             p.id, p.title, p.redirect_url
      FROM invoices i
      JOIN payment_links p ON p.id = i.tag_id
      WHERE i.payment_hash = ? AND i.tag_id = ?
    `, req.params.hash, req.params.linkId);
    if (!row) throw new AppError('Payment proof does not belong to this Smart Tag', 404, 'PROOF_NOT_BOUND');
    if (row.status !== 'settled') {
      return res.status(402).json({ error: 'Payment Required', paid: false, tag_id: req.params.linkId });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      unlocked: true,
      tag_id: row.id,
      title: row.title,
      protocol: row.protocol,
      fulfillment: row.redirect_url ? { type: 'redirect', url: row.redirect_url } : { type: 'receipt' },
      receipt_url: `${origin(req)}/t/${row.id}/receipt/${row.payment_hash}`
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
