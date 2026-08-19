import { describe, expect, it } from 'vitest';
import {
  AIPP_FEE_BPS,
  LIGHTNING_FIXED_FEE_SATS,
  BASE_USDC_MINIMUM_FEE_UNITS,
  CURRENT_FEE_POLICY_VERSION,
  LEGACY_FEE_POLICY_VERSION,
  calculateLightningFee,
  calculateLightningFeeSats,
  calculateLightningCheckout,
  calculateBaseUsdcFee,
  calculateLegacyBaseUsdcFee,
  calculateLegacyLightningFee
} from '../src/services/fees';

describe('Canonical AIPP V1 Fee Policy (3% Success Fee)', () => {
  describe('Constants & Configuration', () => {
    it('has authoritative single-source constants and policy versions', () => {
      expect(AIPP_FEE_BPS).toBe(300);
      expect(LIGHTNING_FIXED_FEE_SATS).toBe(5);
      expect(BASE_USDC_MINIMUM_FEE_UNITS).toBe(1000n);
      expect(CURRENT_FEE_POLICY_VERSION).toBe('v1_3pct_2026_08');
      expect(LEGACY_FEE_POLICY_VERSION).toBe('legacy_v1_1pct');
    });
  });

  describe('Lightning Fee Calculation', () => {
    it('calculates 22 sats gross → fee 6 sats, merchant net 16 sats exactly', () => {
      const res = calculateLightningFee(22);
      expect(res.grossSats).toBe(22);
      expect(res.percentageFeeSats).toBe(1); // ceil(22 * 300 / 10,000) = ceil(0.66) = 1
      expect(res.fixedFeeSats).toBe(5);
      expect(res.aippFeeSats).toBe(6);
      expect(res.merchantNetSats).toBe(16);
      // Invariant: gross = merchant_net + aipp_fee
      expect(res.grossSats).toBe(res.merchantNetSats + res.aippFeeSats);
    });

    it('always uses ceiling for percentage component rounding', () => {
      // 7 sats (percentage component rounds up to 1 sat)
      expect(calculateLightningFee(7).percentageFeeSats).toBe(1);
      // 33 sats: ceil(33 * 300 / 10000) = ceil(0.99) = 1
      expect(calculateLightningFee(33).percentageFeeSats).toBe(1);
      // 34 sats: ceil(34 * 300 / 10000) = ceil(1.02) = 2
      expect(calculateLightningFee(34).percentageFeeSats).toBe(2);
      // 100 sats: ceil(100 * 300 / 10000) = 3
      expect(calculateLightningFee(100).percentageFeeSats).toBe(3);
      // 101 sats: ceil(101 * 300 / 10000) = ceil(3.03) = 4
      expect(calculateLightningFee(101).percentageFeeSats).toBe(4);
      // 1000 sats: ceil(1000 * 300 / 10000) = 30
      expect(calculateLightningFee(1000).percentageFeeSats).toBe(30);
      expect(calculateLightningFee(1000).aippFeeSats).toBe(35);
      expect(calculateLightningFee(1000).merchantNetSats).toBe(965);
    });

    it('satisfies invariant gross == merchant_net + aipp_fee for test suite range', () => {
      for (let gross = 7; gross <= 5000; gross += 17) {
        const res = calculateLightningFee(gross);
        expect(res.grossSats).toBe(res.merchantNetSats + res.aippFeeSats);
        expect(res.merchantNetSats).toBeGreaterThan(0);
        expect(res.aippFeeSats).toBeGreaterThanOrEqual(6);
      }
    });

    it('rejects invalid prices that produce non-positive merchant net', () => {
      // 6 sats: fee = ceil(6 * 3%) + 5 = 1 + 5 = 6. net = 6 - 6 = 0 -> rejected
      expect(() => calculateLightningFee(6)).toThrow(/too low/i);
      // 1 sat: fee = 1 + 5 = 6. net = 1 - 6 = -5 -> rejected
      expect(() => calculateLightningFee(1)).toThrow(/too low/i);
      // 0 sat -> rejected
      expect(() => calculateLightningFee(0)).toThrow(/positive integer/i);
      // Negative -> rejected
      expect(() => calculateLightningFee(-10)).toThrow(/positive integer/i);
      // Non-integer -> rejected
      expect(() => calculateLightningFee(22.5)).toThrow(/positive integer/i);
    });

    it('supports calculateLightningFeeSats helper', () => {
      expect(calculateLightningFeeSats(22)).toBe(6);
      expect(calculateLightningFeeSats(100)).toBe(8); // 3 + 5
      expect(calculateLightningFeeSats(1000)).toBe(35); // 30 + 5
    });

    it('supports calculateLightningCheckout helper with gross and merchant net', () => {
      const checkout = calculateLightningCheckout(22);
      expect(checkout.grossSats).toBe(22);
      expect(checkout.feeSats).toBe(6);
      expect(checkout.merchantNetSats).toBe(16);
      expect(checkout.customerTotalSats).toBe(22);
    });
  });

  describe('Base USDC Fee Calculation', () => {
    it('calculates 0.010000 USDC gross (10,000 units) → 0.001000 fee (1,000 units), 0.009000 net (9,000 units)', () => {
      const grossUnits = 10_000n; // $0.010000 USDC
      const res = calculateBaseUsdcFee(grossUnits);
      expect(res.grossUnits).toBe(10_000n);
      expect(res.percentageFeeUnits).toBe(300n); // ceil(10,000 * 300 / 10,000) = 300
      expect(res.minimumFeeUnits).toBe(1000n); // $0.001 USDC
      expect(res.aippFeeUnits).toBe(1000n); // max(300, 1000) = 1000
      expect(res.merchantNetUnits).toBe(9000n); // 10,000 - 1,000 = 9,000
      // Invariant: gross = merchant_net + aipp_fee
      expect(res.grossUnits).toBe(res.merchantNetUnits + res.aippFeeUnits);
    });

    it('correctly calculates amounts where 3% exceeds the minimum fee', () => {
      // 1.000000 USDC = 1,000,000 units
      const grossUnits = 1_000_000n;
      const res = calculateBaseUsdcFee(grossUnits);
      expect(res.grossUnits).toBe(1_000_000n);
      expect(res.percentageFeeUnits).toBe(30_000n); // 3% of 1,000,000 = 30,000 ($0.030000)
      expect(res.aippFeeUnits).toBe(30_000n);
      expect(res.merchantNetUnits).toBe(970_000n); // $0.970000
      expect(res.grossUnits).toBe(res.merchantNetUnits + res.aippFeeUnits);

      // 10.000000 USDC = 10,000,000 units
      const res10 = calculateBaseUsdcFee(10_000_000n);
      expect(res10.percentageFeeUnits).toBe(300_000n); // $0.300000
      expect(res10.aippFeeUnits).toBe(300_000n);
      expect(res10.merchantNetUnits).toBe(9_700_000n); // $9.700000
      expect(res10.grossUnits).toBe(res10.merchantNetUnits + res10.aippFeeUnits);
    });

    it('enforces exact minimum-boundary behavior', () => {
      // Exactly at minimum fee: 1000 units ($0.001 USDC) -> fee is 1000, net is 0 -> rejected!
      expect(() => calculateBaseUsdcFee(1000n)).toThrow(/too low/i);

      // 1001 units ($0.001001 USDC) -> percentage fee = ceil(1001 * 300 / 10000) = 31 units
      // aippFee = max(31, 1000) = 1000 units, merchantNet = 1 unit -> valid!
      const resBoundary = calculateBaseUsdcFee(1001n);
      expect(resBoundary.aippFeeUnits).toBe(1000n);
      expect(resBoundary.merchantNetUnits).toBe(1n);
      expect(resBoundary.grossUnits).toBe(1001n);

      // Sub-minimum amounts (<1000 units) produce non-positive net -> rejected
      expect(() => calculateBaseUsdcFee(500n)).toThrow(/too low/i);
      expect(() => calculateBaseUsdcFee(0n)).toThrow(/positive bigint/i);
    });

    it('preserves native 6-decimal integer precision without JavaScript float errors', () => {
      // 0.333333 USDC = 333,333 units
      // 3% = 333,333 * 300 / 10,000 = 99,999,900 / 10,000 = 9,999.99 -> ceil = 10,000 units
      const res = calculateBaseUsdcFee(333_333n);
      expect(res.percentageFeeUnits).toBe(10_000n);
      expect(res.aippFeeUnits).toBe(10_000n);
      expect(res.merchantNetUnits).toBe(323_333n);
      expect(res.grossUnits).toBe(res.merchantNetUnits + res.aippFeeUnits);
    });

    it('satisfies invariant gross == merchant_net + aipp_fee across USDC unit ranges', () => {
      const testCases = [
        1001n,
        10_000n, // $0.01
        25_000n, // $0.025
        33_334n, // $0.033334
        100_000n, // $0.10
        500_000n, // $0.50
        1_000_000n, // $1.00
        5_000_000n, // $5.00
        100_000_000n // $100.00
      ];

      for (const units of testCases) {
        const res = calculateBaseUsdcFee(units);
        expect(res.grossUnits).toBe(res.merchantNetUnits + res.aippFeeUnits);
        expect(res.merchantNetUnits).toBeGreaterThan(0n);
        expect(res.aippFeeUnits).toBeGreaterThanOrEqual(1000n);
      }
    });
  });

  describe('Legacy Policy Fallbacks', () => {
    it('calculates legacy 1% Base USDC fee correctly for historical records', () => {
      // 10,000 units ($0.010000 USDC) under historical 1% policy -> 100 units fee ($0.000100), 9,900 units net ($0.009900)
      const res = calculateLegacyBaseUsdcFee(10_000n);
      expect(res.grossUnits).toBe(10_000n);
      expect(res.aippFeeUnits).toBe(100n);
      expect(res.merchantNetUnits).toBe(9900n);
      expect(res.grossUnits).toBe(res.merchantNetUnits + res.aippFeeUnits);
    });

    it('calculates legacy V1 Lightning fee (1% + 5 sats) correctly for historical records', () => {
      // 100 sats under legacy 1% + 5 sats: ceil(100 * 1%) = 1 sat + 5 sats = 6 sats fee, 94 sats net
      const res100 = calculateLegacyLightningFee(100);
      expect(res100.grossSats).toBe(100);
      expect(res100.percentageFeeSats).toBe(1);
      expect(res100.fixedFeeSats).toBe(5);
      expect(res100.aippFeeSats).toBe(6);
      expect(res100.merchantNetSats).toBe(94);
      expect(res100.grossSats).toBe(res100.merchantNetSats + res100.aippFeeSats);

      // 22 sats under legacy 1% + 5 sats: ceil(22 * 1%) = 1 sat + 5 sats = 6 sats fee, 16 sats net
      const res22 = calculateLegacyLightningFee(22);
      expect(res22.grossSats).toBe(22);
      expect(res22.percentageFeeSats).toBe(1);
      expect(res22.fixedFeeSats).toBe(5);
      expect(res22.aippFeeSats).toBe(6);
      expect(res22.merchantNetSats).toBe(16);
      expect(res22.grossSats).toBe(res22.merchantNetSats + res22.aippFeeSats);
    });
  });
});
