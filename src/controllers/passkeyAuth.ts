import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb, acquireTransactionLock } from '../config/database';
import {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  createMerchantSession,
  verifyMerchantSession,
  revokeMerchantSession
} from '../services/passkey';
import { AppError } from '../utils/error';
import { IS_PRODUCTION } from '../config/env';

// Helper to set HttpOnly, Secure, SameSite=Strict cookie
function setSessionCookie(res: Response, sessionToken: string, expiresAt: string) {
  const isProd = IS_PRODUCTION;
  const cookieOptions = [
    `aipp_session=${sessionToken}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Strict`,
    `Expires=${new Date(expiresAt).toUTCString()}`,
    isProd ? 'Secure' : ''
  ].filter(Boolean).join('; ');

  res.setHeader('Set-Cookie', cookieOptions);
}

function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', 'aipp_session=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
}

export function parseSessionCookie(req: Request): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  const match = cookies.split(';').map(c => c.trim()).find(c => c.startsWith('aipp_session='));
  if (!match) return null;
  return match.substring('aipp_session='.length);
}

/**
 * Middleware: Require active merchant session (HttpOnly cookie or Session Bearer)
 */
export async function requireMerchantSession(req: Request, res: Response, next: NextFunction) {
  try {
    let sessionToken = parseSessionCookie(req);
    if (!sessionToken && req.headers.authorization?.startsWith('Bearer aipp_sess_')) {
      sessionToken = req.headers.authorization.substring(7).trim();
    }

    if (!sessionToken) {
      throw new AppError('Merchant session authentication required.', 401, 'UNAUTHORIZED');
    }

    const apiKey = await verifyMerchantSession(sessionToken);
    if (!apiKey) {
      clearSessionCookie(res);
      throw new AppError('Session expired or invalid.', 401, 'SESSION_EXPIRED');
    }

    // Attach verified merchant API key to request
    (req as any).merchantApiKey = apiKey;
    (req as any).sessionToken = sessionToken;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/passkey/register/options
 * Step 1: Request Passkey Registration options
 */
export const registerOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body = req.body || {};
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const ln_address = body.ln_address ? body.ln_address.trim() : '';
    const usdc_address = body.usdc_address ? body.usdc_address.trim() : null;

    if (!ln_address && !usdc_address) {
      throw new AppError('Lightning address or Base USDC address is required to register.', 400, 'INVALID_INPUT');
    }

    const identifier = ln_address || usdc_address || 'Merchant';
    const tempRegId = 'temp_reg_' + crypto.randomUUID();

    const { challenge_id, options } = await getRegistrationOptions(identifier, undefined, tempRegId, 'register');

    res.json({
      status: 'ok',
      challenge_id,
      options,
      temp_registration_id: tempRegId
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/passkey/register/verify
 * Step 2: Verify Passkey Registration, create merchant, and generate 1-time API key
 */
export const registerVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body = req.body || {};
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const { challenge_id, response, device_name, ln_address, usdc_address, payout_mode, payout_threshold_sats } = body;
    if (!challenge_id || !response) {
      throw new AppError('Challenge ID and WebAuthn response are required.', 400, 'INVALID_INPUT');
    }

    const db = getDb();
    let lnAddr = ln_address ? ln_address.trim() : '';
    const usdcAddr = usdc_address ? usdc_address.trim() : null;

    if (!lnAddr && usdcAddr) {
      lnAddr = `${usdcAddr.toLowerCase().slice(0, 16)}@base.aipp.dev`;
    }

    // Check if merchant already exists
    let merchant = await db.get('SELECT api_key FROM merchants WHERE LOWER(ln_address) = LOWER(?)', lnAddr);
    let apiKey: string;

    if (!merchant) {
      apiKey = 'aipp_merch_' + crypto.randomBytes(16).toString('hex');
      await db.run(
        'INSERT INTO merchants (api_key, ln_address, usdc_address, payout_mode, payout_threshold_sats, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        apiKey,
        lnAddr,
        usdcAddr,
        payout_mode || 'instant',
        payout_threshold_sats || 50,
        new Date().toISOString()
      );
    } else {
      apiKey = merchant.api_key;
    }

    // Verify Passkey registration and store passkey
    const result = await verifyRegistration(challenge_id, response, device_name || 'Primary Security Key', apiKey);

    // Establish HttpOnly session
    const session = await createMerchantSession(apiKey);
    setSessionCookie(res, session.sessionToken, session.expiresAt);

    res.json({
      status: 'ok',
      verified: true,
      api_key: apiKey,
      message: 'Passkey registered successfully! Please copy and save your Merchant API Key for programmatic integrations.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/passkey/login/options
 * Step 1: Request Passkey Login options
 */
export const loginOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { challenge_id, options } = await getAuthenticationOptions(undefined, 'login');
    res.json({
      status: 'ok',
      challenge_id,
      options
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/passkey/login/verify
 * Step 2: Verify Passkey Login assertion and set HttpOnly session cookie
 */
export const loginVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body = req.body || {};
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const { challenge_id, response } = body;
    if (!challenge_id || !response) {
      throw new AppError('Challenge ID and WebAuthn response are required.', 400, 'INVALID_INPUT');
    }

    const result = await verifyAuthentication(challenge_id, response);

    // Create session
    const session = await createMerchantSession(result.api_key);
    setSessionCookie(res, session.sessionToken, session.expiresAt);

    res.json({
      status: 'ok',
      verified: true,
      message: 'Passkey authentication successful.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/passkey/add/options
 * Request options to add a new passkey to current session
 */
export const addPasskeyOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (req as any).merchantApiKey;
    const db = getDb();
    const merchant = await db.get('SELECT ln_address FROM merchants WHERE api_key = ?', apiKey);

    const { challenge_id, options } = await getRegistrationOptions(merchant.ln_address, apiKey, undefined, 'add_passkey');

    res.json({
      status: 'ok',
      challenge_id,
      options
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/passkey/add/verify
 * Verify and store additional Passkey for current session
 */
export const addPasskeyVerify = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body = req.body || {};
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const apiKey = (req as any).merchantApiKey;
    const { challenge_id, response, device_name } = body;

    const result = await verifyRegistration(challenge_id, response, device_name || 'Additional Device', apiKey);

    res.json({
      status: 'ok',
      verified: true,
      passkey_id: result.passkey_id,
      message: 'New passkey added successfully.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/passkeys
 * List all registered Passkeys for current merchant session
 */
export const listPasskeys = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (req as any).merchantApiKey;
    const db = getDb();
    const passkeys = await db.all(
      'SELECT id, credential_id, device_name, created_at, last_used_at FROM merchant_passkeys WHERE api_key = ? ORDER BY created_at DESC',
      apiKey
    );

    res.json({
      status: 'ok',
      passkeys
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /auth/passkeys/:id
 * Delete a passkey (Safeguard: Cannot delete the last remaining passkey)
 */
export const deletePasskey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (req as any).merchantApiKey;
    const passkeyId = req.params.id;

    const db = getDb();
    const passkeys = await db.all('SELECT id FROM merchant_passkeys WHERE api_key = ?', apiKey);

    if (passkeys.length <= 1) {
      throw new AppError('Cannot delete your only remaining passkey. Register a new passkey first.', 400, 'LAST_PASSKEY_PROTECTION');
    }

    const result = await db.run('DELETE FROM merchant_passkeys WHERE id = ? AND api_key = ?', passkeyId, apiKey);
    if (result.changes === 0) {
      throw new AppError('Passkey not found.', 404, 'NOT_FOUND');
    }

    res.json({
      status: 'ok',
      message: 'Passkey deleted successfully.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/passkey/migrate/options
 * Onboarding for existing merchants: Verify API key once to generate Passkey registration options
 */
export const migratePasskeyOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body = req.body || {};
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const { api_key } = body;
    if (!api_key) {
      throw new AppError('Merchant API key is required for migration.', 400, 'INVALID_INPUT');
    }

    const db = getDb();
    const merchant = await db.get('SELECT api_key, ln_address FROM merchants WHERE api_key = ?', api_key);
    if (!merchant) {
      throw new AppError('Invalid Merchant API key.', 401, 'UNAUTHORIZED');
    }

    const { challenge_id, options } = await getRegistrationOptions(merchant.ln_address, merchant.api_key, undefined, 'add_passkey');

    res.json({
      status: 'ok',
      challenge_id,
      options
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/passkey/migrate/verify
 * Complete 1-time onboarding migration: Verify Passkey and establish session
 */
export const verifyMigratePasskey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let body = req.body || {};
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = JSON.parse(req.body.toString('utf8'));
    }

    const { challenge_id, response, device_name, api_key } = body;
    if (!challenge_id || !response || !api_key) {
      throw new AppError('Challenge ID, response, and API key are required.', 400, 'INVALID_INPUT');
    }

    const result = await verifyRegistration(challenge_id, response, device_name || 'Primary Security Key', api_key);

    const session = await createMerchantSession(api_key);
    setSessionCookie(res, session.sessionToken, session.expiresAt);

    res.json({
      status: 'ok',
      verified: true,
      message: 'Passkey onboarding completed! You can now log into Studio Console using Passkey.'
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/session
 * Check active merchant session and return profile info
 */
export const getSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = (req as any).merchantApiKey;
    const db = getDb();
    const merchant = await db.get(
      'SELECT ln_address, usdc_address, payout_mode, payout_threshold_sats, created_at FROM merchants WHERE api_key = ?',
      apiKey
    );

    if (!merchant) {
      clearSessionCookie(res);
      throw new AppError('Merchant profile not found.', 404, 'NOT_FOUND');
    }

    const passkeys = await db.all('SELECT id, device_name, created_at, last_used_at FROM merchant_passkeys WHERE api_key = ?', apiKey);

    res.json({
      status: 'ok',
      authenticated: true,
      merchant: {
        ln_address: merchant.ln_address,
        usdc_address: merchant.usdc_address,
        payout_mode: merchant.payout_mode,
        payout_threshold_sats: merchant.payout_threshold_sats,
        created_at: merchant.created_at,
        passkey_count: passkeys.length
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/logout
 * Clear session cookie and revoke session token in database
 */
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessionToken = parseSessionCookie(req) || (req as any).sessionToken;
    if (sessionToken) {
      await revokeMerchantSession(sessionToken);
    }
    clearSessionCookie(res);
    res.json({ status: 'ok', message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
};
