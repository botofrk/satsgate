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

export interface DualOptions {
  client: Aipp;
  jwtSecret: string;
  resourceId: string;
  amountSats?: number;
  amountUsd?: number;
  expiresInSeconds?: number;
}

export function dualPaywall(options: DualOptions) {
  if (!options.amountSats && !options.amountUsd) {
    throw new Error('Either amountSats or amountUsd must be provided for dualPaywall');
  }

  return async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let txHash = (req.query.tx_hash || req.headers['payment-signature'] || req.headers['x-payment-signature']) as string;
    let paymentHash = (req.query.payment_hash || req.headers['x-payment-hash']) as string;
    let valid = false;

    // 1. Try to verify L402 Header first
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('L402 ')) {
      const parts = authHeader.substring(5).split(':');
      if (parts.length === 2) {
        const [macaroonStr, preimage] = parts;
        try {
          const payload = verifyJwt(macaroonStr, options.jwtSecret);
          if (payload.resource_id === options.resourceId) {
            const preimageHash = crypto.createHash('sha256').update(Buffer.from(preimage, 'hex')).digest('hex');
            const expectedHash = payload.payment_hash;
            
            if (
              typeof expectedHash === 'string' &&
              expectedHash.length === preimageHash.length &&
              crypto.timingSafeEqual(Buffer.from(preimageHash, 'hex'), Buffer.from(expectedHash, 'hex'))
            ) {
              valid = true;
            }
          }
        } catch (e) {
          // Fall through to check x402 or re-issue
        }
      }
    }

    // 2. Try to verify Bearer/x402 or query tx_hash next
    if (!valid) {
      if (!txHash && authHeader && typeof authHeader === 'string') {
        if (authHeader.startsWith('Bearer ')) {
          txHash = authHeader.substring(7).trim();
        } else if (authHeader.startsWith('x402 ')) {
          txHash = authHeader.substring(5).trim();
        }
      }

      if (txHash) {
        // If they sent tx_hash, we need the payment_hash to check status.
        // We can extract payment_hash from the L402 header's macaroon if present,
        // or check if it was passed via query/header.
        if (!paymentHash && authHeader && typeof authHeader === 'string' && authHeader.startsWith('L402 ')) {
          const parts = authHeader.substring(5).split(':');
          try {
            const payload = verifyJwt(parts[0], options.jwtSecret);
            paymentHash = payload.payment_hash;
          } catch (e) {}
        }

        if (paymentHash && txHash) {
          try {
            const chargeStatus = await options.client.getCharge(paymentHash, txHash);
            if (chargeStatus.status === 'settled') {
              valid = true;
            }
          } catch (e) {
            // Ignore verification error, will generate new challenge below
          }
        }
      }
    }

    if (valid) {
      return next();
    }

    // 3. Not paid or invalid -> Issue new DUAL challenge
    try {
      const charge = await options.client.createCharge({
        amountSats: options.amountSats,
        amountUsd: options.amountUsd,
        protocol: 'dual',
        memo: `Dual-Rail Payment for ${options.resourceId}`
      });

      // Generate L402 Macaroon
      const expiresIn = options.expiresInSeconds || 3600;
      const payload = {
        payment_hash: charge.payment_hash,
        resource_id: options.resourceId,
        exp: Math.floor(Date.now() / 1000) + expiresIn
      };
      const jwtToken = signJwt(payload, options.jwtSecret);

      // Generate x402 challenge
      const challengeObj = {
        scheme: 'exact',
        network: charge.network || 'base',
        payTo: charge.pay_to || '',
        price: (charge.amount_usd || options.amountUsd || 0.01).toFixed(2),
        token: charge.token || '',
        payment_hash: charge.payment_hash
      };
      const challengeBase64 = Buffer.from(JSON.stringify(challengeObj), 'utf8').toString('base64');

      res.setHeader('Www-Authenticate', `L402 macaroon="${jwtToken}" invoice="${charge.payment_request || ''}"`);
      res.setHeader('PAYMENT-REQUIRED', challengeBase64);
      res.status(402);
      
      res.json({
        error: "Payment Required",
        code: "402",
        payment_hash: charge.payment_hash,
        pricing: {
          usd: charge.amount_usd || options.amountUsd || null,
          sats: charge.amount_sats || options.amountSats || null
        },
        payment_methods: {
          lightning: {
            protocol: "L402",
            payment_request: charge.payment_request || null,
            macaroon: jwtToken
          },
          usdc_base: {
            protocol: "x402",
            pay_to: challengeObj.payTo,
            token: challengeObj.token,
            network: challengeObj.network,
            amount_usd: parseFloat(challengeObj.price)
          }
        },
        instructions: "Pay the Lightning invoice and supply the preimage in 'Authorization: L402 macaroon:preimage' OR transfer the USDC amount to 'pay_to' and supply the transaction hash in 'Authorization: Bearer tx_hash' or 'payment-signature' header."
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to generate Dual-Rail challenge", details: err.message || err });
    }
  };
}

// ============================================================================
// Roadmap v2.0 - High-Level Problem-Oriented Middleware ("Set & Forget")
// ============================================================================

export interface BaseProtectOptions {
  /** Price in USD (e.g. 0.01 or "$0.01") or Sats (e.g. "100 sats") */
  price: number | string;
  /** Unique ID for the resource. Defaults to request URL. */
  resourceId?: string;
  /** Optional custom Aipp client instance. Defaults to process.env.AIPP_KEY */
  client?: Aipp;
  /** Optional JWT secret for L402 token signing. Defaults to process.env.AIPP_JWT_SECRET or AIPP_KEY */
  jwtSecret?: string;
  /** Expiration time in seconds for the paid token (Default: 3600s / 1h) */
  expiresInSeconds?: number;
}

export function parsePrice(price: number | string): { amountUsd?: number; amountSats?: number } {
  if (typeof price === 'number') {
    return { amountUsd: price };
  }
  const clean = price.trim().toLowerCase();
  if (clean.endsWith('sats') || clean.endsWith('sat')) {
    const sats = parseInt(clean.replace(/sats?/, '').trim(), 10);
    return { amountSats: isNaN(sats) ? 100 : sats };
  }
  const num = parseFloat(clean.replace('$', '').trim());
  return { amountUsd: isNaN(num) ? 0.01 : num };
}

function getOrCreateClient(customClient?: Aipp): Aipp {
  if (customClient) return customClient;
  const apiKey = process.env.AIPP_KEY || process.env.AIPP_API_KEY;
  if (!apiKey) {
    throw new Error('AIPP Error: AIPP_KEY environment variable is missing. Set AIPP_KEY in .env or pass client instance to protect function.');
  }
  const baseUrl = process.env.AIPP_API_URL || 'https://aipp.dev';
  return new Aipp({ apiKey, baseUrl });
}

function getJwtSecret(customSecret?: string): string {
  return customSecret || process.env.AIPP_JWT_SECRET || process.env.AIPP_KEY || 'aipp_default_secret_key_change_in_prod';
}

/**
 * Protects an API route with micro-payments.
 * Example: app.post('/v1/ai', protectApi({ price: 0.01 }), handler);
 */
export function protectApi(options: BaseProtectOptions) {
  const { amountUsd, amountSats } = parsePrice(options.price);
  return (req: any, res: any, next: any) => {
    const client = getOrCreateClient(options.client);
    const jwtSecret = getJwtSecret(options.jwtSecret);
    const resourceId = options.resourceId || req.originalUrl || req.url || 'api_endpoint';

    return dualPaywall({
      client,
      jwtSecret,
      resourceId,
      amountUsd,
      amountSats,
      expiresInSeconds: options.expiresInSeconds || 3600
    })(req, res, next);
  };
}

/**
 * Protects an AI Agent / MCP Server tool endpoint.
 * Optimized for machine-to-machine HTTP 402 challenges.
 */
export function protectAgent(options: BaseProtectOptions) {
  const { amountUsd, amountSats } = parsePrice(options.price);
  return (req: any, res: any, next: any) => {
    const client = getOrCreateClient(options.client);
    const jwtSecret = getJwtSecret(options.jwtSecret);
    const resourceId = options.resourceId || req.originalUrl || req.url || 'mcp_tool';

    return dualPaywall({
      client,
      jwtSecret,
      resourceId,
      amountUsd,
      amountSats,
      expiresInSeconds: options.expiresInSeconds || 86400
    })(req, res, next);
  };
}

/**
 * Protects premium web content / HTML paywalls.
 */
export function protectContent(options: BaseProtectOptions) {
  const { amountUsd, amountSats } = parsePrice(options.price);
  return (req: any, res: any, next: any) => {
    const client = getOrCreateClient(options.client);
    const jwtSecret = getJwtSecret(options.jwtSecret);
    const resourceId = options.resourceId || req.originalUrl || req.url || 'content_page';

    return dualPaywall({
      client,
      jwtSecret,
      resourceId,
      amountUsd,
      amountSats,
      expiresInSeconds: options.expiresInSeconds || 86400
    })(req, res, next);
  };
}

/**
 * Protects file download endpoints.
 */
export function protectDownload(options: BaseProtectOptions) {
  const { amountUsd, amountSats } = parsePrice(options.price);
  return (req: any, res: any, next: any) => {
    const client = getOrCreateClient(options.client);
    const jwtSecret = getJwtSecret(options.jwtSecret);
    const resourceId = options.resourceId || req.originalUrl || req.url || 'download_asset';

    return dualPaywall({
      client,
      jwtSecret,
      resourceId,
      amountUsd,
      amountSats,
      expiresInSeconds: options.expiresInSeconds || 3600
    })(req, res, next);
  };
}

