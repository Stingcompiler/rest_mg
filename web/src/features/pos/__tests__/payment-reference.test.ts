/**
 * A bank transfer or wallet payment is recorded with the reference the cashier
 * reads off the customer's confirmation (review finding F08).
 *
 * The till used to make one up from the clock — four digits of `Date.now()` —
 * so a recorded transfer could never be matched to a real one. Recording stays
 * manual (there is no bank integration), but the reference is now typed, and
 * something too short to identify a transaction is refused.
 */
import { describe, expect, it } from 'vitest';

import { MIN_REFERENCE_LENGTH, cleanReference, isUsableReference } from '../paymentReference';

describe('a payment reference', () => {
  it('is what the cashier typed, without surrounding spaces', () => {
    expect(cleanReference('  TX 99812 ')).toBe('TX 99812');
  });

  it('must be long enough to identify a transaction', () => {
    expect(MIN_REFERENCE_LENGTH).toBe(4);
    expect(isUsableReference('')).toBe(false);
    expect(isUsableReference('   ')).toBe(false);
    expect(isUsableReference('123')).toBe(false);
    expect(isUsableReference(' 1234 ')).toBe(true);
    expect(isUsableReference('بنكك-55120')).toBe(true);
  });

  it('must not be longer than the server stores', () => {
    expect(isUsableReference('9'.repeat(80))).toBe(true);
    expect(isUsableReference('9'.repeat(81))).toBe(false);
  });
});
