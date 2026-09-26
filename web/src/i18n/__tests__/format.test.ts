/**
 * Formatting is where the two numeral systems and the "clocks are always
 * Western and LTR" rule are actually enforced. These tests pin the exact glyphs
 * and separators the design uses.
 */
import { describe, expect, it } from 'vitest';

import { formatInteger, formatMoney, formatTime, formatDate } from '../format';

describe('formatInteger', () => {
  it('groups Western digits with a comma', () => {
    expect(formatInteger(1_049_000, 'western')).toBe('1,049,000');
    expect(formatInteger(500, 'western')).toBe('500');
  });

  it('groups Arabic-Indic digits with U+066C', () => {
    expect(formatInteger(49_500, 'arabic-indic')).toBe('٤٩٬٥٠٠');
    expect(formatInteger(1_049_000, 'arabic-indic')).toBe('١٬٠٤٩٬٠٠٠');
  });

  it('uses the true minus sign for negatives', () => {
    expect(formatInteger(-5_500, 'western')).toBe('−5,500');
    expect(formatInteger(-5_500, 'arabic-indic')).toBe('−٥٬٥٠٠');
  });

  it('accepts bigint beyond Number range', () => {
    expect(formatInteger(2n ** 53n + 1n, 'western')).toBe('9,007,199,254,740,993');
  });
});

describe('formatMoney', () => {
  it('renders minor units with no currency symbol and no decimals', () => {
    expect(formatMoney(49_500n, 'arabic-indic')).toBe('٤٩٬٥٠٠');
    expect(formatMoney(49_500n, 'western')).toBe('49,500');
  });

  it('renders a shortfall with a leading minus, as the shift screen does', () => {
    expect(formatMoney(-12_500n, 'arabic-indic')).toBe('−١٢٬٥٠٠');
  });
});

describe('clocks and dates', () => {
  it('formats time in Khartoum, 24-hour, Western digits', () => {
    // 12:32 UTC is 14:32 in Africa/Khartoum (UTC+2, no DST).
    expect(formatTime(new Date('2026-08-06T12:32:00Z'))).toBe('14:32');
  });

  it('rolls the date over in Khartoum, not UTC', () => {
    // 22:30 UTC is 00:30 the next day in Khartoum.
    expect(formatDate(new Date('2026-08-06T22:30:00Z'))).toBe('2026-08-07');
  });

  it('keeps dates Western regardless of numeral setting (they are never localised)', () => {
    expect(formatDate(new Date('2026-08-06T09:00:00Z'))).toBe('2026-08-06');
  });
});
