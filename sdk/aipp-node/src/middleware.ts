import crypto from 'crypto';
import { Aipp } from './client';
import { signJwt, verifyJwt } from './jwt';

export interface L402Options {
  client: Aipp;
  jwtSecret: string;
  resourceId: string;
  amountSats?: number;
  amountUsd?: number;
  expiresInSeconds?: number;
}

export function l402Paywall(options: L402Options) {
  if (!options.amountSats && !options.amountUsd) {
    throw new Error('Either amountSats or amountUsd must be provided for l402Paywall');
  }

  return async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let valid = false;

    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('L402 ')) {
      const parts = authHeader.substring(5).split(':');
      if (parts.length === 2) {
        const [macaroonStr, preimage] = parts;
        try {
          // Verify JWT signature and expiration
          const payload = verifyJwt(macaroonStr, options.jwtSecret);
          
          if (payload.resource_id !== options.resourceId) {
            throw new Error('Invalid resource');
          }

          // Verify preimage hash matches payment_hash securely
          const preimageHash = crypto.createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
          const expectedHash = payload.payment_hash;
          
          if (
            typeof expectedHash === 'string' &&
            expectedHash.length === preimageHash.length &&
            crypto.timingSafeEqual(Buffer.from(preimageHash, 'hex'), Buffer.from(expectedHash, 'hex'))
          ) {
            valid = true;
          }
        } catch (e) {
          // Invalid or expired JWT -> Fall through to 402 and issue new invoice
        }
      }
    }

    if (valid) {
      return next();
    }

    try {
      // Create invoice via AIPP
      const charge = await options.client.createCharge({
        amountSats: options.amountSats,
        amountUsd: options.amountUsd,
        memo: `L402 Payment for ${options.resourceId}`
      });

      // Issue JWT
      const expiresIn = options.expiresInSeconds || 3600; // default 1 hour
      const payload = {
        payment_hash: charge.payment_hash,
        resource_id: options.resourceId,
        exp: Math.floor(Date.now() / 1000) + expiresIn
      };
      
      const jwtToken = signJwt(payload, options.jwtSecret);

      res.status(402);
      res.setHeader('Www-Authenticate', `L402 macaroon="${jwtToken}" invoice="${charge.payment_request}"`);
      res.json({
        error: "Payment Required",
        code: "L402",
        payment_request: charge.payment_request,
        macaroon: jwtToken
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate L402 challenge", details: err.message || err });
    }
  };
}

export interface X402Options {
  client: Aipp;
  resourceId: string;
  amountUsd: number;
}

export function x402Paywall(options: X402Options) {
  return async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let txHash = (req.query.tx_hash || req.headers['payment-signature'] || req.headers['x-payment-signature']) as string;
    let paymentHash = (req.query.payment_hash || req.headers['x-payment-hash']) as string;

    if (!txHash && authHeader && typeof authHeader === 'string') {
      if (authHeader.startsWith('Bearer ')) {
        txHash = authHeader.substring(7).trim();
      } else if (authHeader.startsWith('x402 ')) {
        txHash = authHeader.substring(5).trim();
      } else if (authHeader.startsWith('L402 ')) {
        // Fallback or double format check
        const parts = authHeader.substring(5).split(':');
        if (parts.length === 2) {
          paymentHash = parts[0];
          txHash = parts[1];
        }
      }
    }

    if (paymentHash && txHash) {
      try {
        const chargeStatus = await options.client.getCharge(paymentHash, txHash);
        if (chargeStatus.status === 'settled') {
          return next();
        }
      } catch (e) {
        // Validation failed, proceed to challenge
      }
    }

    try {
      const charge = await options.client.createCharge({
        amountUsd: options.amountUsd,
        protocol: 'x402',
        memo: `x402 Payment for ${options.resourceId}`
      });

      const challengeObj = {
        scheme: 'exact',
        network: 'base',
        payTo: charge.pay_to || '',
        price: options.amountUsd.toFixed(2),
        token: charge.token || '',
        payment_hash: charge.payment_hash
      };
      
      const challengeBase64 = Buffer.from(JSON.stringify(challengeObj), 'utf8').toString('base64');
      res.setHeader('PAYMENT-REQUIRED', challengeBase64);

      res.status(402);
      res.json({
        error: "Payment Required",
        code: "x402",
        payment_hash: charge.payment_hash,
        pay_to: challengeObj.payTo,
        price: challengeObj.price,
        token: challengeObj.token,
        network: challengeObj.network
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate x402 challenge", details: err.message || err });
    }
  };
}
