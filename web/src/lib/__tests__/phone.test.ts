/**
 * A customer's phone number is one the restaurant can call.
 *
 * Every website order is confirmed by phone before the kitchen sees it
 * (decision D1). The form accepted anything that was not empty, so "123" made
 * an order nobody could confirm. Found in the user-experience review (batch 11).
 * The server applies the same rule (apps/orders/phone.py).
 */
import { describe, expect, it } from 'vitest';

import { normalizeSudanPhone } from '../phone';

describe('normalizeSudanPhone', () => {
  it.each([
    ['0912345678', '0912345678'],
    ['0912 345 678', '0912345678'],
    ['091-234-5678', '0912345678'],
    ['+249912345678', '0912345678'],
    ['00249 912 345 678', '0912345678'],
    ['249912345678', '0912345678'],
    ['912345678', '0912345678'],
    ['٠٩١٢٣٤٥٦٧٨', '0912345678'],
    ['0123456789', '0123456789'],
  ])('accepts %s as %s', (raw, normalized) => {
    expect(normalizeSudanPhone(raw)).toBe(normalized);
  });

  it.each(['', '123', '09123', '091234567890', '0812345678', 'abc', '+20 100 123 4567'])('refuses %s', (raw) => {
    expect(normalizeSudanPhone(raw)).toBeNull();
  });
});
