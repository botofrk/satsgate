/** Canonical AIPP fee policy. Keep every API, worker and UI calculation here. */
export function calculateLightningFeeSats(grossSats: number): number {
  if (!Number.isInteger(grossSats) || grossSats <= 0) {
    throw new Error('grossSats must be a positive integer');
  }
  return Math.ceil(grossSats * 0.01) + 5;
}

export function calculateLightningCheckout(merchantPriceSats: number) {
  const feeSats = calculateLightningFeeSats(merchantPriceSats);
  return {
    merchantPriceSats,
    feeSats,
    customerTotalSats: merchantPriceSats + feeSats,
  };
}
