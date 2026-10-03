/**
 * Quick-cash buttons follow the bill.
 *
 * They were fixed at 5,000, 10,000 and 20,000, all below a typical bill
 * (22,000), so a tap recorded a partial payment instead of the note the
 * customer handed over. They are now the notes a customer is likely to hand
 * over for this bill: the next round amounts above it. Found in the
 * user-experience review (batch 11).
 */
import { describe, expect, it } from 'vitest';

import { quickCashOptions } from '../quickCash';

describe('quick cash', () => {
  it('offers round amounts above the bill', () => {
    expect(quickCashOptions(22_000n)).toEqual([25_000n, 30_000n, 50_000n]);
  });

  it('never offers the exact amount, which has its own button', () => {
    expect(quickCashOptions(25_000n)).toEqual([30_000n, 50_000n, 100_000n]);
  });

  it('works for small and large bills', () => {
    expect(quickCashOptions(4_500n)).toEqual([5_000n, 10_000n, 50_000n]);
    expect(quickCashOptions(100_000n)).toEqual([105_000n, 110_000n, 150_000n]);
  });

  it('offers nothing when nothing is due', () => {
    expect(quickCashOptions(0n)).toEqual([]);
  });

  it('always offers three distinct, rising amounts', () => {
    for (const due of [1n, 999n, 12_345n, 49_999n, 50_000n, 250_000n, 1_234_567n]) {
      const options = quickCashOptions(due);
      expect(options).toHaveLength(3);
      expect(new Set(options).size).toBe(3);
      expect(options.every((amount, i) => amount > due && (i === 0 || amount > options[i - 1]!))).toBe(true);
    }
  });
});
