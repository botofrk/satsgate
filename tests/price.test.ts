import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { refreshBtcRate, getBtcUsdRate, isBtcRateStale } from '../src/services/price';

describe('Price Service (BTC Rate)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should use default rate initially', () => {
    expect(getBtcUsdRate()).toBe(60000);
    expect(isBtcRateStale()).toBe(true);
  });

  it('should fetch rate from CoinGecko successfully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bitcoin: { usd: 65000 } })
    });
    vi.stubGlobal('fetch', fetchMock);

    await refreshBtcRate();

    expect(getBtcUsdRate()).toBe(65000);
    expect(isBtcRateStale()).toBe(false);
  });

  it('should fallback to Kraken when CoinGecko fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false }) // CoinGecko fails
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { XXBTZUSD: { c: ['64000.000'] } }
        })
      }); // Kraken succeeds
    vi.stubGlobal('fetch', fetchMock);

    await refreshBtcRate();

    expect(getBtcUsdRate()).toBe(64000);
    expect(isBtcRateStale()).toBe(false);
  });

  it('should mark rate as stale after 15 minutes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bitcoin: { usd: 65000 } })
    });
    vi.stubGlobal('fetch', fetchMock);

    await refreshBtcRate();
    expect(isBtcRateStale()).toBe(false);

    // Fast forward time by 16 minutes (16 * 60 * 1000 ms)
    vi.advanceTimersByTime(16 * 60 * 1000);
    expect(isBtcRateStale()).toBe(true);
  });
});
