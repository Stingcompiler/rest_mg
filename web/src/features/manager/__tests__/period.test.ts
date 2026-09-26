/**
 * Period boundaries for the manager's overview.
 *
 * These exist because the overview and the cashier's daily report disagreed,
 * and part of the reason was that the overview had no period at all — it
 * reported every closed order ever while the cashier reported today.
 */
import { describe, expect, it } from 'vitest';

import { periodRange, PERIOD_KEYS } from '../period';

// Mid-afternoon in Khartoum (UTC+2), so the local date is unambiguous.
const NOW = new Date('2026-08-19T12:00:00Z');

describe('periodRange', () => {
  it('asks the server for no range at all when the period is "all"', () => {
    expect(periodRange('all', NOW)).toEqual({});
  });

  it('covers a single day for "today"', () => {
    const { from, to } = periodRange('today', NOW);
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    const days = (Date.parse(to!) - Date.parse(from!)) / 86_400_000;
    expect(days).toBeCloseTo(1, 5);
  });

  it('covers seven days for the week, including today', () => {
    const { from, to } = periodRange('week', NOW);
    const days = (Date.parse(to!) - Date.parse(from!)) / 86_400_000;
    expect(days).toBeCloseTo(7, 5);
  });

  it('covers thirty days for the month, including today', () => {
    const { from, to } = periodRange('month', NOW);
    const days = (Date.parse(to!) - Date.parse(from!)) / 86_400_000;
    expect(days).toBeCloseTo(30, 5);
  });

  it("ends after the current moment, so today's later sales still count", () => {
    const { to } = periodRange('today', NOW);
    expect(Date.parse(to!)).toBeGreaterThan(NOW.getTime());
  });

  it('every period key produces a usable range', () => {
    for (const key of PERIOD_KEYS) {
      const range = periodRange(key, NOW);
      if (key === 'all') expect(range).toEqual({});
      else expect(Date.parse(range.to!)).toBeGreaterThan(Date.parse(range.from!));
    }
  });
});
