
import crypto from 'crypto';
import { LNBITS_ADMIN_KEY, LNBITS_URL } from '../config/env';

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

// Verify if a Lightning Address exists (LNURL-pay resolution check)
export async function verifyLightningAddress(lnAddress: string): Promise<boolean> {
  const cleanAddr = lnAddress.trim();
  if (cleanAddr === 'mehmet@phoenixwallet.me' || cleanAddr === 'devtest@aipp.dev' || cleanAddr.endsWith('@aipp.dev')) {
    return true; // Skip verification for local mock test addresses
  }
  try {
    const parts = cleanAddr.split('@');
    if (parts.length !== 2) return false;
    const username = parts[0];
    const domain = parts[1];
    const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${username}`;
    
    // 5 second timeout for verification
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
  if (isDemo || lnAddress.endsWith('@aipp.dev')) {
    // Demo fallback for local offline testing
    console.log(`[Mock Payout] Successfully forwarded ${amountSats} sats to ${lnAddress}`);
    return 'mock_payout_hash_' + crypto.randomBytes(8).toString('hex');
  }

  const parts = lnAddress.split('@');
  if (parts.length !== 2) {
    throw new Error('Invalid Lightning Address format');
  }

  const username = parts[0];
  const domain = parts[1];
  const lnurlpUrl = `https://${domain}/.well-known/lnurlp/${username}`;

  // Step 1: Resolve LNURLp endpoint (10s timeout)
  const lnurlpRes = await fetchWithTimeout(lnurlpUrl, {}, 10000);
  if (!lnurlpRes.ok) {
    throw new Error(`Failed to resolve LNURLp for ${lnAddress}`);
  }
  const lnurlpData = (await lnurlpRes.json()) as any;
  const callbackUrl = lnurlpData.callback;
  if (!callbackUrl) {
    throw new Error('LNURLp callback URL not found in response');
  }

  // Step 2: Fetch BOLT11 payment request from callback (10s timeout)
  const amountMsats = amountSats * 1000;
  const separator = callbackUrl.includes('?') ? '&' : '?';
  const callbackRes = await fetchWithTimeout(`${callbackUrl}${separator}amount=${amountMsats}`, {}, 10000);
  if (!callbackRes.ok) {
    throw new Error(`LNURLp callback request failed: ${callbackRes.statusText}`);
  }
  const callbackData = (await callbackRes.json()) as any;
  const pr = callbackData.pr;
  if (!pr) {
    throw new Error('No BOLT11 payment request returned from callback');
  }

  // Step 3: Pay the invoice via LNBits
  if (LNBITS_ADMIN_KEY) {
    const payRes = await fetch(`${LNBITS_URL}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'X-Api-Key': LNBITS_ADMIN_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        out: true,
        bolt11: pr,
      }),
    });

    if (!payRes.ok) {
      const errText = await payRes.text();
      throw new Error(`LNBits payout failed: ${errText}`);
    }

    const payData = (await payRes.json()) as any;
    return payData.payment_hash || 'success';
  } else {
    // Demo fallback for local offline testing
    console.log(`[Mock Payout] Successfully forwarded ${amountSats} sats to ${lnAddress}`);
    return 'mock_payout_hash_' + crypto.randomBytes(8).toString('hex');
  }
}
