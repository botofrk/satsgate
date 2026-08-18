import crypto from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { getDb } from '../config/database';
import { RP_ID, EXPECTED_ORIGIN } from '../config/env';
import { AppError } from '../utils/error';

function hashChallenge(challenge: string): string {
  return crypto.createHash('sha256').update(challenge).digest('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Step 1: Generate Registration Options for WebAuthn Registration
 */
export async function getRegistrationOptions(
  userIdentifier: string,
  apiKey?: string,
  tempRegistrationId?: string,
  ceremonyType: 'register' | 'add_passkey' = 'register'
) {
  const db = getDb();
  let existingPasskeys: any[] = [];
  if (apiKey) {
    existingPasskeys = await db.all('SELECT credential_id, transports FROM merchant_passkeys WHERE api_key = ?', apiKey);
  }

  const excludeCredentials = existingPasskeys.map((p) => ({
    id: p.credential_id,
    transports: p.transports ? JSON.parse(p.transports) : undefined,
  }));

  const options = await generateRegistrationOptions({
    rpName: 'AIPP Studio Console',
    rpID: RP_ID,
    userID: Buffer.from(apiKey || tempRegistrationId || userIdentifier),
    userName: userIdentifier,
    userDisplayName: userIdentifier,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      userVerification: 'required',
      residentKey: 'preferred',
    },
  });

  const challengeId = 'wch_' + crypto.randomUUID();
  const challengeHash = hashChallenge(options.challenge);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes TTL

  await db.run(
    'INSERT INTO webauthn_challenges (id, challenge_hash, ceremony_type, api_key, temp_registration_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    challengeId,
    challengeHash,
    ceremonyType,
    apiKey || null,
    tempRegistrationId || null,
    expiresAt,
    new Date().toISOString()
  );

  return {
    challenge_id: challengeId,
    options,
  };
}

/**
 * Step 2: Verify Registration Response and Store Passkey
 */
export async function verifyRegistration(
  challengeId: string,
  response: any,
  deviceName: string,
  apiKey?: string,
  tempRegistrationId?: string
) {
  const db = getDb();
  const challengeRecord = await db.get(
    'SELECT * FROM webauthn_challenges WHERE id = ? AND used_at IS NULL',
    challengeId
  );

  if (!challengeRecord) {
    throw new AppError('WebAuthn challenge not found or already used.', 400, 'INVALID_CHALLENGE');
  }

  if (new Date(challengeRecord.expires_at).getTime() < Date.now()) {
    throw new AppError('WebAuthn challenge has expired.', 400, 'CHALLENGE_EXPIRED');
  }

  // Single-use burn the challenge
  await db.run('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?', new Date().toISOString(), challengeId);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: (challenge: string) => {
        return hashChallenge(challenge) === challengeRecord.challenge_hash;
      },
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });
  } catch (err: any) {
    throw new AppError(`WebAuthn registration verification failed: ${err.message}`, 400, 'WEBAUTHN_VERIFICATION_FAILED');
  }

  const { verified, registrationInfo } = verification;
  if (!verified || !registrationInfo) {
    throw new AppError('WebAuthn registration could not be verified.', 400, 'WEBAUTHN_VERIFICATION_FAILED');
  }

  const { credential } = registrationInfo;

  const passkeyId = 'pk_' + crypto.randomUUID();
  const targetApiKey = apiKey || challengeRecord.api_key;
  if (!targetApiKey) {
    throw new AppError('Merchant API key context is required for passkey registration.', 400, 'MISSING_MERCHANT_KEY');
  }

  const transports = response.response?.transports ? JSON.stringify(response.response.transports) : null;
  const pubKeyBase64 = Buffer.from(credential.publicKey).toString('base64url');

  await db.run(
    'INSERT INTO merchant_passkeys (id, api_key, credential_id, public_key, counter, transports, device_name, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    passkeyId,
    targetApiKey,
    credential.id,
    pubKeyBase64,
    credential.counter,
    transports,
    deviceName || 'Biometric Security Key',
    new Date().toISOString(),
    new Date().toISOString()
  );

  return {
    verified: true,
    passkey_id: passkeyId,
    api_key: targetApiKey,
  };
}

/**
 * Step 3: Generate Authentication Options for WebAuthn Login
 */
export async function getAuthenticationOptions(apiKey?: string, ceremonyType: 'login' | 'reauth' = 'login') {
  const db = getDb();
  let allowCredentials: any[] | undefined = undefined;

  const passkeys = apiKey
    ? await db.all('SELECT credential_id, transports FROM merchant_passkeys WHERE api_key = ?', apiKey)
    : await db.all('SELECT credential_id, transports FROM merchant_passkeys LIMIT 100');

  if (passkeys.length > 0) {
    allowCredentials = passkeys.map((p) => ({
      id: p.credential_id,
      transports: p.transports ? JSON.parse(p.transports) : undefined,
    }));
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: 'required',
  });

  const challengeId = 'wch_' + crypto.randomUUID();
  const challengeHash = hashChallenge(options.challenge);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes TTL

  await db.run(
    'INSERT INTO webauthn_challenges (id, challenge_hash, ceremony_type, api_key, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    challengeId,
    challengeHash,
    ceremonyType,
    apiKey || null,
    expiresAt,
    new Date().toISOString()
  );

  return {
    challenge_id: challengeId,
    options,
  };
}

/**
 * Step 4: Verify Authentication Response for WebAuthn Login / Re-auth
 */
export async function verifyAuthentication(challengeId: string, response: any) {
  const db = getDb();
  const challengeRecord = await db.get(
    'SELECT * FROM webauthn_challenges WHERE id = ? AND used_at IS NULL',
    challengeId
  );

  const UNIFIED_AUTH_ERROR = new AppError(
    'Passkey authentication failed. Invalid challenge or signature.',
    400,
    'WEBAUTHN_AUTHENTICATION_FAILED'
  );

  if (!challengeRecord) {
    throw UNIFIED_AUTH_ERROR;
  }

  if (new Date(challengeRecord.expires_at).getTime() < Date.now()) {
    throw UNIFIED_AUTH_ERROR;
  }

  // Single-use burn the challenge
  await db.run('UPDATE webauthn_challenges SET used_at = ? WHERE id = ?', new Date().toISOString(), challengeId);

  const credentialId = response.id;
  const passkey = await db.get('SELECT * FROM merchant_passkeys WHERE credential_id = ?', credentialId);

  if (!passkey) {
    throw UNIFIED_AUTH_ERROR;
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (challenge: string) => {
        return hashChallenge(challenge) === challengeRecord.challenge_hash;
      },
      expectedOrigin: EXPECTED_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: passkey.credential_id,
        publicKey: Buffer.from(passkey.public_key, 'base64url'),
        counter: passkey.counter,
        transports: passkey.transports ? JSON.parse(passkey.transports) : undefined,
      },
      requireUserVerification: true,
    });
  } catch (err: any) {
    throw UNIFIED_AUTH_ERROR;
  }

  const { verified, authenticationInfo } = verification;
  if (!verified || !authenticationInfo) {
    throw UNIFIED_AUTH_ERROR;
  }

  // Update sign counter and last used time (Clone detection)
  await db.run(
    'UPDATE merchant_passkeys SET counter = ?, last_used_at = ? WHERE id = ?',
    authenticationInfo.newCounter,
    new Date().toISOString(),
    passkey.id
  );

  return {
    verified: true,
    api_key: passkey.api_key,
    passkey_id: passkey.id,
  };
}

/**
 * Session Management: Create HttpOnly Merchant Session Cookie Token
 */
export async function createMerchantSession(apiKey: string) {
  const db = getDb();
  const sessionToken = 'aipp_sess_' + crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days session

  const sessionId = 'sess_' + crypto.randomUUID();
  await db.run(
    'INSERT INTO merchant_sessions (id, api_key, token_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    sessionId,
    apiKey,
    tokenHash,
    expiresAt,
    new Date().toISOString(),
    new Date().toISOString()
  );

  return {
    sessionId,
    sessionToken,
    expiresAt,
  };
}

/**
 * Session Management: Verify Session Token from Cookie or Bearer Token
 */
export async function verifyMerchantSession(sessionToken: string): Promise<string | null> {
  if (!sessionToken || typeof sessionToken !== 'string') return null;

  const db = getDb();
  const tokenHash = hashToken(sessionToken);

  const session = await db.get(
    'SELECT * FROM merchant_sessions WHERE token_hash = ? AND revoked_at IS NULL',
    tokenHash
  );

  if (!session) return null;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    return null;
  }

  // Rolling update for last_seen_at
  await db.run('UPDATE merchant_sessions SET last_seen_at = ? WHERE id = ?', new Date().toISOString(), session.id);

  return session.api_key;
}

/**
 * Session Management: Revoke Session Token
 */
export async function revokeMerchantSession(sessionToken: string) {
  if (!sessionToken) return;
  const db = getDb();
  const tokenHash = hashToken(sessionToken);
  await db.run('UPDATE merchant_sessions SET revoked_at = ? WHERE token_hash = ?', new Date().toISOString(), tokenHash);
}
