
let currentBtcRate = 60000;
let lastUpdatedAt: number = 0; // Unix ms timestamp of last successful refresh

async function fetchWithTimeout(url: string, timeoutMs: number = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

// [HIGH-6 FIX] Two-source price fetch: CoinGecko primary, Kraken fallback
async function fetchBtcRateFromCoinGecko(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', 5000);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (data?.bitcoin?.usd && typeof data.bitcoin.usd === 'number') return data.bitcoin.usd;
    return null;
  } catch {
    return null;
  }
}

async function fetchBtcRateFromKraken(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout('https://api.kraken.com/0/public/Ticker?pair=XBTUSD', 5000);
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const rate = parseFloat(data?.result?.XXBTZUSD?.c?.[0]);
    if (!isNaN(rate) && rate > 0) return rate;
    return null;
  } catch {
    return null;
  }
}

export async function refreshBtcRate() {
  // Try CoinGecko first, then fall back to Kraken
  let newRate = await fetchBtcRateFromCoinGecko();

  if (!newRate) {
    console.warn('[BTC Rate] CoinGecko failed, trying Kraken fallback...');
    newRate = await fetchBtcRateFromKraken();
  }

  if (newRate) {
    currentBtcRate = newRate;
    lastUpdatedAt = Date.now();
    console.log(`[BTC Rate] Updated: $${currentBtcRate.toLocaleString()} USD/BTC`);
  } else {
    console.error('[BTC Rate] All sources failed. Using last known rate: $' + currentBtcRate.toLocaleString());
  }
}

export function getBtcUsdRate(): number {
  return currentBtcRate;
}

// [HIGH-6 FIX] Staleness detection — returns true if rate is older than 15 minutes
export function isBtcRateStale(): boolean {
  if (lastUpdatedAt === 0) return true; // Never successfully updated
  return Date.now() - lastUpdatedAt > 15 * 60 * 1000;
}
