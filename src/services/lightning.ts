import crypto from 'crypto';
import { LNBITS_ADMIN_KEY, LNBITS_URL, IS_PRODUCTION } from '../config/env';

// Timeout wrapper for fetch to prevent hanging requests
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// [K-10 FIX] Dev bypass is gated behind IS_PRODUCTION check
// [MED-1 FIX] URL parts sanitized before building LNURL-pay URL
export async function verifyLightningAddress(lnAddress: string): Promise<boolean> {
  const cleanAddr = lnAddress.trim();

  // Allow specific test addresses only in development
  if (!IS_PRODUCTION && (cleanAddr === 'devtest@aipp.dev' || cleanAddr.endsWith('@aipp.dev'))) {
    return true;
  }

  try {
    const parts = cleanAddr.split('@');
    if (parts.length !== 2) return false;
    const username = parts[0];
    const domain = parts[1];

    // [MED-1 FIX] Validate domain is a safe hostname before URL construction
    if (!/^[a-zA-Z0-9.\-]+$/.test(domain) || domain.length > 253) return false;
    const usernameEncoded = encodeURIComponent(username);
    const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${usernameEncoded}`;
    
    const res = await fetchWithTimeout(lnurlpUrl, {}, 5000);
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return !!data.callback;
  } catch (e) {
    return false;
  }
}

// Resolve and Pay Lightning Address (LNURL-pay forwarding)
export async function payLightningAddress(lnAddress: string, amountSats: number, isDemo: boolean = false): Promise<string> {
  if (isDemo || (!IS_PRODUCTION && lnAddress.endsWith('@aipp.dev'))) {
    console.log(`[Mock Payout] Successfully forwarded ${amountSats} sats to ${lnAddress}`);
    return 'mock_payout_hash_' + crypto.randomBytes(8).toString('hex');
  }

  const parts = lnAddress.split('@');
  if (parts.length !== 2) {
    throw new Error('Invalid Lightning Address format');
  }

  const username = parts[0];
  const domain = parts[1];

  // [MED-1 FIX] Validate domain before URL construction
  if (!/^[a-zA-Z0-9.\-]+$/.test(domain) || domain.length > 253) {
    throw new Error(`Invalid domain in Lightning address: ${lnAddress}`);
  }
  const usernameEncoded = encodeURIComponent(username);
  const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${usernameEncoded}`;

  // Step 1: Resolve LNURLp endpoint (10s timeout)
  const lnurlpRes = await fetchWithTimeout(lnurlpUrl, {}, 10000);
  if (!lnurlpRes.ok) {
    throw new Error(`Failed to resolve LNURLp for ${lnAddress}`);
  }
  const lnurlpData = (await lnurlpRes.json()) as any;

  // [HIGH-2 FIX] Check LNURL-pay error responses and validate amount range
  if (lnurlpData.status === 'ERROR') {
    throw new Error(`LNURLp error: ${lnurlpData.reason}`);
  }
  const callbackUrl = lnurlpData.callback;
  if (!callbackUrl) {
    throw new Error('LNURLp callback URL not found in response');
  }

  // Step 2: Fetch BOLT11 payment request from callback (10s timeout)
  const amountMsats = amountSats * 1000;

  // [HIGH-2 FIX] Validate amount is within merchant's accepted range
  if (lnurlpData.minSendable && amountMsats < lnurlpData.minSendable) {
    throw new Error(`Amount ${amountMsats} msats is below LNURLp minimum ${lnurlpData.minSendable} msats`);
  }
  if (lnurlpData.maxSendable && amountMsats > lnurlpData.maxSendable) {
    throw new Error(`Amount ${amountMsats} msats exceeds LNURLp maximum ${lnurlpData.maxSendable} msats`);
  }

  const separator = callbackUrl.includes('?') ? '&' : '?';
  const callbackRes = await fetchWithTimeout(`${callbackUrl}${separator}amount=${amountMsats}`, {}, 10000);
  if (!callbackRes.ok) {
    throw new Error(`LNURLp callback request failed: ${callbackRes.statusText}`);
  }
  const callbackData = (await callbackRes.json()) as any;

  // [HIGH-2 FIX] Check callback response for error status
  if (callbackData.status === 'ERROR') {
    throw new Error(`LNURLp callback error: ${callbackData.reason}`);
  }
  const pr = callbackData.pr;
  if (!pr) {
    throw new Error('No BOLT11 payment request returned from callback');
  }

  // Step 3: Pay the invoice via LNBits — [HIGH-1 FIX] use fetchWithTimeout (30s for actual payment)
  if (LNBITS_ADMIN_KEY) {
    const payRes = await fetchWithTimeout(`${LNBITS_URL}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'X-Api-Key': LNBITS_ADMIN_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        out: true,
        bolt11: pr,
      }),
    }, 30000); // 30s timeout for actual Lightning payment

    if (!payRes.ok) {
      const errText = await payRes.text();
      throw new Error(`LNBits payout failed: ${errText}`);
    }

    // [MED-2 FIX] Validate payment_hash exists before returning
    const payData = (await payRes.json()) as any;
    if (!payData.payment_hash) {
      throw new Error(`LNBits did not return a payment_hash. Response: ${JSON.stringify(payData)}`);
    }
    return payData.payment_hash;
  } else {
    console.log(`[Mock Payout] Successfully forwarded ${amountSats} sats to ${lnAddress}`);
    return 'mock_payout_hash_' + crypto.randomBytes(8).toString('hex');
  }
}
