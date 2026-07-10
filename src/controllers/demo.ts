import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { LNBITS_INVOICE_KEY, LNBITS_URL, LNBITS_WEBHOOK_SECRET, PORT } from '../config/env';

// A simple mock for L402 Paywall just for the demo
export const premiumArticle = async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || req.headers['Authorization'];
  
  // Check x402 Authorization
  let txHash = (req.query.tx_hash || req.headers['payment-signature'] || req.headers['x-payment-signature']) as string;
  if (!txHash && authHeader && typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      txHash = authHeader.substring(7).trim();
    } else if (authHeader.startsWith('x402 ')) {
      txHash = authHeader.substring(5).trim();
    }
  }

  if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    try {
      const db = getDb();
      const invoice = await db.get("SELECT * FROM invoices WHERE preimage = ? AND status = 'settled'", txHash);
      if (invoice || txHash === '0xmocktxhash') {
        return res.json({
          html: `
            <p>The traditional banking system relies on identity, credit checks, and trusted intermediaries. But an AI agent has no identity, no passport, and no credit score. It exists as a block of code executing in a cloud environment. By utilizing stablecoin networks like Base and the x402 protocol, agents can now stream payments for APIs instantly, with microsecond settlement and zero protocol fees.</p>
            <br>
            <div style="background: rgba(59, 130, 246, 0.1); border-left: 4px solid #3b82f6; padding: 16px; border-radius: 4px;">
              <strong>🎉 Success!</strong> You just unlocked this premium content using x402 USDC on Base. The publisher received the funds instantly, with a flat 1% fee.
            </div>
          `
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('L402 ')) {
    const parts = authHeader.substring(5).split(':');
    if (parts.length === 2) {
      const [macaroon, preimage] = parts;
      
      // In a real scenario, we'd verify the JWT macaroon signature.
      // For this demo, we'll verify if the preimage hashes to a paid invoice.
      try {
        const preimageHash = crypto.createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
        const db = getDb();
        const invoice = await db.get('SELECT * FROM invoices WHERE payment_hash = ? AND status = ?', preimageHash, 'settled');
        
        // Or if it's a demo invoice
        if (invoice || preimage === '0000000000000000000000000000000000000000000000000000000000000000') {
          // Success! Unlock content
          return res.json({
            html: `
              <p>The traditional banking system relies on identity, credit checks, and trusted intermediaries. But an AI agent has no identity, no passport, and no credit score. It exists as a block of code executing in a cloud environment. By utilizing Lightning Network's bearer-token model, agents can now stream payments for APIs without asking for human permission.</p>
              <br>
              <div style="background: rgba(245, 158, 11, 0.1); border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                <strong>🎉 Success!</strong> You just unlocked this premium content using L402 micropayments. The publisher received the funds instantly, with no middlemen and a flat 1% fee.
              </div>
            `
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  // If no auth or invalid auth, return 402 with a new invoice
  try {
    const amount_sats = 21; // 21 sats to unlock
    let paymentHash = '';
    let paymentRequest = '';

    if (LNBITS_INVOICE_KEY) {
      const response = await fetch(`${LNBITS_URL}/api/v1/payments`, {
        method: 'POST',
        headers: { 'X-Api-Key': LNBITS_INVOICE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          out: false,
          amount: amount_sats,
          memo: `AIPP Demo Premium Article`,
          webhook: LNBITS_WEBHOOK_SECRET ? `https://aipp.dev/lnbits-webhook?secret=${LNBITS_WEBHOOK_SECRET}` : undefined
        }),
      });
      const data = (await response.json()) as any;
      paymentHash = data.payment_hash;
      paymentRequest = data.payment_request;
    } else {
      paymentHash = 'demo_' + crypto.randomBytes(8).toString('hex');
      paymentRequest = `lnbc21n1demo_invoice_generated_for_paywall_demo`;
    }

    const db = getDb();
    await db.run(
      'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      paymentHash,
      'demo_api_key',
      amount_sats,
      0,
      amount_sats,
      'pending',
      new Date().toISOString()
    );

    // Mock a JWT since we are bypassing the SDK for this specific internal demo
    const payload = Buffer.from(JSON.stringify({
      payment_hash: paymentHash,
      resource_id: '/api/premium-article-1',
      exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour
    })).toString('base64');
    
    // Fake JWT (not signed securely for this simple demo, but works for the UI)
    const fakeJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${payload}.signature`;

    res.status(402);
    res.setHeader('Www-Authenticate', `L402 macaroon="${fakeJwt}" invoice="${paymentRequest}"`);
    res.json({
      error: "Payment Required",
      code: "L402",
      payment_request: paymentRequest,
      macaroon: fakeJwt
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate demo invoice" });
  }
};
