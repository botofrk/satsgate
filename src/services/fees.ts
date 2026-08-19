/**
 * Canonical AIPP V1 Fee Policy & Accounting Engine
 * Authoritative source for all fee constants and integer calculations across the AIPP ecosystem.
 *
 * Invariant: gross_amount = merchant_net + aipp_fee
 */

/** Active fee policy version identifier bound to newly generated invoices */
export const CURRENT_FEE_POLICY_VERSION = 'v1_3pct_2026_08';

/** Historical legacy fee policy version identifier */
export const LEGACY_FEE_POLICY_VERSION = 'legacy_v1_1pct';

/** AIPP fee basis points: 300 = 3.00% */
export const AIPP_FEE_BPS = 300;

/** Lightning operational fixed fee component: 5 satoshis */
export const LIGHTNING_FIXED_FEE_SATS = 5;

/** Base USDC minimum fee: 1,000 native integer units ($0.001000 USDC) */
export const BASE_USDC_MINIMUM_FEE_UNITS = 1000n;

export interface LightningFeeBreakdown {
  grossSats: number;
  percentageFeeSats: number;
  fixedFeeSats: number;
  aippFeeSats: number;
  merchantNetSats: number;
}

export interface BaseUsdcFeeBreakdown {
  grossUnits: bigint;
  percentageFeeUnits: bigint;
  minimumFeeUnits: bigint;
  aippFeeUnits: bigint;
  merchantNetUnits: bigint;
}

/**
 * Calculates canonical Lightning fee using integer arithmetic only.
 * percentage_fee_sats = ceil(gross_sats * 300 / 10000)
 * aipp_fee_sats = percentage_fee_sats + 5
 * merchant_net_sats = gross_sats - aipp_fee_sats
 *
 * Rejects prices where resulting merchant_net is zero or negative.
 */
export function calculateLightningFee(grossSats: number): LightningFeeBreakdown {
  if (!Number.isInteger(grossSats) || grossSats <= 0) {
    throw new Error('grossSats must be a positive integer');
  }

  const grossBig = BigInt(grossSats);
  // Integer ceiling division: (gross * 300 + 9999) / 10000
  const percentageFeeSats = Number((grossBig * BigInt(AIPP_FEE_BPS) + 9999n) / 10000n);
  const aippFeeSats = percentageFeeSats + LIGHTNING_FIXED_FEE_SATS;
  const merchantNetSats = grossSats - aippFeeSats;

  if (merchantNetSats <= 0) {
    throw new Error(`Gross amount of ${grossSats} sats is too low to cover AIPP fees (${aippFeeSats} sats)`);
  }

  return {
    grossSats,
    percentageFeeSats,
    fixedFeeSats: LIGHTNING_FIXED_FEE_SATS,
    aippFeeSats,
    merchantNetSats,
  };
}

/**
 * Calculates canonical Base USDC fee using 6-decimal native integer units only.
 * percentage_fee_units = ceil(gross_units * 300 / 10000)
 * aipp_fee_units = max(percentage_fee_units, 1000)
 * merchant_net_units = gross_units - aipp_fee_units
 *
 * Rejects prices where resulting merchant_net is zero or negative.
 */
export function calculateBaseUsdcFee(grossUnits: bigint): BaseUsdcFeeBreakdown {
  if (typeof grossUnits !== 'bigint' || grossUnits <= 0n) {
    throw new Error('grossUnits must be a positive bigint');
  }

  // Integer ceiling division: (grossUnits * 300 + 9999) / 10000
  const percentageFeeUnits = (grossUnits * BigInt(AIPP_FEE_BPS) + 9999n) / 10000n;
  const aippFeeUnits =
    percentageFeeUnits > BASE_USDC_MINIMUM_FEE_UNITS ? percentageFeeUnits : BASE_USDC_MINIMUM_FEE_UNITS;
  const merchantNetUnits = grossUnits - aippFeeUnits;

  if (merchantNetUnits <= 0n) {
    throw new Error(
      `Gross amount of ${grossUnits} USDC units is too low to cover minimum fees (${aippFeeUnits} units)`
    );
  }

  return {
    grossUnits,
    percentageFeeUnits,
    minimumFeeUnits: BASE_USDC_MINIMUM_FEE_UNITS,
    aippFeeUnits,
    merchantNetUnits,
  };
}

/**
 * Version-aware legacy calculation fallback for historical pre-3% records lacking persisted unit fields.
 * Historical Base USDC policy: flat 1% fee with 0 minimum fee.
 * e.g., 10,000 units ($0.010000 USDC) -> 100 units fee ($0.000100 USDC), 9,900 units net ($0.009900 USDC).
 */
export function calculateLegacyBaseUsdcFee(grossUnits: bigint): BaseUsdcFeeBreakdown {
  if (typeof grossUnits !== 'bigint' || grossUnits <= 0n) {
    throw new Error('grossUnits must be a positive bigint');
  }
  const percentageFeeUnits = grossUnits / 100n; // 1%
  const aippFeeUnits = percentageFeeUnits;
  const merchantNetUnits = grossUnits - aippFeeUnits;
  return {
    grossUnits,
    percentageFeeUnits,
    minimumFeeUnits: 0n,
    aippFeeUnits,
    merchantNetUnits
  };
}

/**
 * Version-aware legacy calculation fallback for historical pre-3% Lightning records
 * lacking persisted commission_sats / forwarded_amount_sats fields.
 * Historical V1 Lightning policy: 1% + 5 sats (ceil(gross_sats * 0.01) + 5 sats fixed).
 * e.g., 22 sats -> 6 sats fee (1 + 5), 16 sats net.
 * e.g., 100 sats -> 6 sats fee (1 + 5), 94 sats net.
 */
export function calculateLegacyLightningFee(grossSats: number): LightningFeeBreakdown {
  if (!Number.isInteger(grossSats) || grossSats <= 0) {
    throw new Error('grossSats must be a positive integer');
  }
  const percentageFeeSats = Math.ceil(grossSats * 0.01);
  const fixedFeeSats = 5;
  const aippFeeSats = percentageFeeSats + fixedFeeSats;
  const merchantNetSats = grossSats - aippFeeSats;
  return {
    grossSats,
    percentageFeeSats,
    fixedFeeSats,
    aippFeeSats,
    merchantNetSats
  };
}

/**
 * Convenience helper returning the Lightning AIPP fee in sats.
 */
export function calculateLightningFeeSats(grossSats: number): number {
  return calculateLightningFee(grossSats).aippFeeSats;
}

/**
 * Convenience helper returning checkout details for Lightning.
 */
export function calculateLightningCheckout(grossSats: number) {
  const breakdown = calculateLightningFee(grossSats);
  return {
    grossSats: breakdown.grossSats,
    feeSats: breakdown.aippFeeSats,
    merchantNetSats: breakdown.merchantNetSats,
    merchantPriceSats: breakdown.merchantNetSats,
    customerTotalSats: breakdown.grossSats,
  };
}
