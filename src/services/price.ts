

let currentBtcRate = 60000;

async function fetchWithTimeout(url: string, timeoutMs: number = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function refreshBtcRate() {
  try {
    const res = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data && data.bitcoin && data.bitcoin.usd) {
        currentBtcRate = data.bitcoin.usd;
        console.log(`[BTC Rate] Updated: $${currentBtcRate.toLocaleString()} USD/BTC`);
      }
    }
  } catch (e) {
    console.error('[BTC Rate] Failed to fetch rate from CoinGecko, using last known rate.');
  }
}

export function getBtcUsdRate(): number {
  return currentBtcRate;
}
