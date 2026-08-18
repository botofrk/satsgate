import { describe, expect, it } from 'vitest';
import { calculateLightningCheckout, calculateLightningFeeSats } from '../src/services/fees';

describe('Lightning fee policy', () => {
  it.each([
    [1, 6],
    [20, 6],
    [100, 6],
    [1000, 15],
  ])('charges 1%% + 5 sats for %i sats', (price, expectedFee) => {
    expect(calculateLightningFeeSats(price)).toBe(expectedFee);
  });

  it('adds the fee on top and preserves the merchant price', () => {
    expect(calculateLightningCheckout(1000)).toEqual({
      merchantPriceSats: 1000,
      feeSats: 15,
      customerTotalSats: 1015,
    });
  });
});
