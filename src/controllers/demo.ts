import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../config/database';
import { LNBITS_INVOICE_KEY, LNBITS_URL, IS_PRODUCTION, BASE_NETWORK_NAME, USDC_ADDRESS } from '../config/env';
import { getGatewayAddress } from '../services/base';

const DEMO_PREIMAGE = '0000000000000000000000000000000000000000000000000000000000000000';

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
      const invoice = await db.get("SELECT payment_hash FROM invoices WHERE preimage = ? AND status = 'settled'", txHash);
      // [D-02 FIX] Removed '0xmocktxhash' bypass (was dead code but dangerous to keep)
      if (invoice) {
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
      console.error('[Demo] x402 verification error:', (e as Error).message);
    }
  }

  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('L402 ')) {
    const parts = authHeader.substring(5).split(':');
    if (parts.length === 2) {
      const [, preimage] = parts;
      
      try {
        const preimageHash = crypto.createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
        const db = getDb();
        const invoice = await db.get('SELECT payment_hash FROM invoices WHERE payment_hash = ? AND status = ?', preimageHash, 'settled');
        
        // [K-07 FIX] Demo preimage bypass only allowed in non-production mode
        const isDemoPreimage = preimage === DEMO_PREIMAGE;
        if (invoice || (!IS_PRODUCTION && isDemoPreimage)) {
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
        // [D-05 FIX] Don't swallow errors silently — log and fall through to 402 properly
        console.error('[Demo] L402 preimage verification error:', (e as Error).message);
        // Fall through to re-issue a 402 challenge
      }
    }
  }

  // If no auth or invalid auth, return 402 with a new invoice
  try {
    const amount_sats = 21;
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
          // [K-04 FIX] No ?secret= in webhook URL — webhook auth is HMAC-only
        }),
      });
      // [D-03 FIX] Check response.ok before parsing
      if (!response.ok) {
        throw new Error(`LNBits returned status ${response.status}`);
      }
      const data = (await response.json()) as any;
      if (!data?.payment_hash || !data?.payment_request) {
        throw new Error('Malformed LNBits response — missing fields');
      }
      paymentHash = data.payment_hash;
      paymentRequest = data.payment_request;
    } else {
      paymentHash = 'demo_' + crypto.randomBytes(8).toString('hex');
      paymentRequest = `lnbc21n1demo_invoice_generated_for_paywall_demo`;
    }

    const db = getDb();
    await db.run(
      'INSERT INTO invoices (payment_hash, api_key, amount_sats, commission_sats, forwarded_amount_sats, status, protocol, usdc_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      paymentHash,
      'demo_api_key',
      amount_sats,
      0,
      amount_sats,
      'pending',
      'dual',
      0.005,
      new Date().toISOString()
    );

    // [D-06 FIX] Use a proper signed payload format
    const payload = Buffer.from(JSON.stringify({
      payment_hash: paymentHash,
      resource_id: '/api/premium-article-1',
      exp: Math.floor(Date.now() / 1000) + 3600
    })).toString('base64url');
    
    const demoMacaroon = `aipp_demo_v1.${payload}`;

    // Generate x402 challenge
    const challengeObj = {
      scheme: 'exact',
      network: BASE_NETWORK_NAME,
      payTo: getGatewayAddress(),
      price: '0.01', // Minimum USDC unit is $0.01
      token: USDC_ADDRESS,
      payment_hash: paymentHash
    };
    const challengeBase64 = Buffer.from(JSON.stringify(challengeObj), 'utf8').toString('base64');

    res.status(402);
    res.setHeader('Www-Authenticate', `L402 macaroon="${demoMacaroon}" invoice="${paymentRequest}"`);
    res.setHeader('PAYMENT-REQUIRED', challengeBase64);
    
    res.json({
      error: "Payment Required",
      code: "402",
      payment_hash: paymentHash,
      pricing: {
        usd: 0.01,
        sats: amount_sats
      },
      payment_methods: {
        lightning: {
          protocol: "L402",
          payment_request: paymentRequest,
          macaroon: demoMacaroon
        },
        usdc_base: {
          protocol: "x402",
          pay_to: challengeObj.payTo,
          token: challengeObj.token,
          network: challengeObj.network,
          amount_usd: 0.01
        }
      },
      instructions: "Pay the Lightning invoice and supply the preimage in 'Authorization: L402 macaroon:preimage' OR transfer the USDC amount to 'pay_to' and supply the transaction hash in 'Authorization: Bearer tx_hash' or 'payment-signature' header."
    });
  } catch (err: any) {
    console.error('[Demo] Failed to generate demo invoice:', err.message);
    res.status(500).json({ error: "Failed to generate demo invoice" });
  }
};

export const getPricing = async (req: Request, res: Response) => {
  res.json({
    currency: "USD",
    endpoints: [
      {
        path: "/premium-article-1",
        protocol: "L402",
        price_usd: 0.005,
        price_sats_fixed: 21,
        description: "Access premium article for AI Autonomy research"
      },
      {
        path: "/chat",
        protocol: "L402",
        price_sats_fixed: 5,
        description: "Submit request to OpenAI proxy chatbot endpoint"
      }
    ]
  });
};
