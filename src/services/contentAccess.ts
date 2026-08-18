import crypto from 'crypto';
import { Request } from 'express';
import { AIPP_ACCESS_SECRET, CONTENT_ACCESS_TOKEN_TTL_SECONDS } from '../config/env';

export function hashAccessCredential(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function deriveAccessClaimSecret(paymentHash: string, tagId: string): string {
  return crypto.createHmac('sha256', AIPP_ACCESS_SECRET).update(`claim:${paymentHash}:${tagId}`).digest('base64url');
}

export function credentialsMatch(actualHash: string, credential: string): boolean {
  const actual = Buffer.from(actualHash, 'hex');
  const submitted = Buffer.from(hashAccessCredential(credential), 'hex');
  return actual.length === submitted.length && crypto.timingSafeEqual(actual, submitted);
}

export function createAccessToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function accessTokenExpiry(): string {
  return new Date(Date.now() + CONTENT_ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}
