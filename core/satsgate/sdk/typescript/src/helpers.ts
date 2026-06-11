import { createHash } from 'node:crypto';
import { SatsgateError } from './errors.js';

/**
 * Parse an L402 Authorization header into its macaroon (base64url) and
 * preimage (hex) components.
 *
 * Expected format: `L402 <macaroon_b64>:<preimage_hex>`
 */
export function parseL402Authorization(auth: string): [string, string] {
  if (!auth) throw new SatsgateError('missing Authorization credentials');

  const spaceIdx = auth.indexOf(' ');
  if (spaceIdx === -1) throw new SatsgateError('malformed Authorization header');

  const scheme = auth.slice(0, spaceIdx);
  const token = auth.slice(spaceIdx + 1);

  if (scheme.toLowerCase() !== 'l402') throw new SatsgateError('scheme is not L402');

  const colonIdx = token.indexOf(':');
  if (colonIdx === -1) throw new SatsgateError('malformed L402 token');

  const macaroonB64 = token.slice(0, colonIdx);
  const preimageHex = token.slice(colonIdx + 1);

  // Validate hex
  if (!/^[0-9a-fA-F]*$/.test(preimageHex)) throw new SatsgateError('preimage is not hex');

  return [macaroonB64, preimageHex];
}

/**
 * Decode the JSON payload embedded in a macaroon's base64url representation.
 *
 * The macaroon binary format is: `<json_payload>.<signature>`.
 * We split on the last dot and return the parsed JSON from the left side.
 */
export function decodeMacaroonPayload(macaroonB64: string): Record<string, unknown> {
  // Add padding if needed
  const pad = '='.repeat((4 - (macaroonB64.length % 4)) % 4);
  const decoded = Buffer.from(macaroonB64 + pad, 'base64url');
  const dotIdx = decoded.lastIndexOf('.');
  const payloadBytes = decoded.subarray(0, dotIdx);
  return JSON.parse(payloadBytes.toString('utf-8')) as Record<string, unknown>;
}

/**
 * Compute the SHA-256 hex digest of a hex-encoded preimage.
 */
export function sha256Hex(preimageHex: string): string {
  return createHash('sha256').update(Buffer.from(preimageHex, 'hex')).digest('hex');
}
