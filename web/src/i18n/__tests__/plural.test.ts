/**
 * Counts read as Arabic (batch 15).
 *
 * Every count used one form: "قبل ٥ دقيقة", "٦ صنف", "وصل ٢ طلب جديد". Arabic
 * has six plural categories (zero, one, two, few, many, other), and a counted
 * noun changes with each. A key with plural forms carries all six, in both
 * catalogues, and `plural` picks by the count.
 */
import { describe, expect, it } from 'vitest';

import ar from '../messages/ar.json';
import en from '../messages/en.json';
import { plural } from '../catalog';

const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

describe('plural', () => {
  it('picks the Arabic form by the count', () => {
    expect(plural('ar', 'pos.orders.age', 0, { count: '٠' })).toBe('الآن');
    expect(plural('ar', 'pos.orders.age', 1, { count: '١' })).toBe('قبل دقيقة');
    expect(plural('ar', 'pos.orders.age', 2, { count: '٢' })).toBe('قبل دقيقتين');
    expect(plural('ar', 'pos.orders.age', 5, { count: '٥' })).toBe('قبل ٥ دقائق');
    expect(plural('ar', 'pos.orders.age', 11, { count: '١١' })).toBe('قبل ١١ دقيقة');
    expect(plural('ar', 'pos.orders.age', 100, { count: '١٠٠' })).toBe('قبل ١٠٠ دقيقة');
  });

  it('picks the English form by the count', () => {
    expect(plural('en', 'pos.orders.age', 1, { count: '1' })).toBe('1 minute ago');
    expect(plural('en', 'pos.orders.age', 5, { count: '5' })).toBe('5 minutes ago');
  });

  it('falls back to the plain key when a message has no plural forms', () => {
    expect(plural('ar', 'pos.sync.title', 3)).toBe(ar['pos.sync.title']);
  });
});

describe('plural catalogues', () => {
  const bases = Object.keys(ar)
    .filter((key) => key.endsWith('.other'))
    .map((key) => key.slice(0, -'.other'.length));

  it('exist for the counts the screens show', () => {
    for (const base of [
      'pos.orders.age',
      'kitchen.minutesAgo',
      'pos.cart.itemCount',
      'pos.menu.applyToItems',
      'pos.menu.bulkTitle',
      'pos.menu.bulkDone',
      'landing.cart.items',
      'alerts.newBanner',
      'alerts.newDeliveryBody',
      'alerts.newTicketBody',
      'manager.money.ordersCount',
      'pos.sync.attempts',
    ]) {
      expect(bases, base).toContain(base);
    }
  });

  it('carry all six forms in both languages', () => {
    for (const base of bases) {
      for (const category of CATEGORIES) {
        expect(ar, `${base}.${category}`).toHaveProperty([`${base}.${category}`]);
        expect(en, `${base}.${category}`).toHaveProperty([`${base}.${category}`]);
      }
    }
  });
});
