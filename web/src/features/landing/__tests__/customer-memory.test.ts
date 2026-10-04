/**
 * What the public page remembers for the customer (batch 14).
 *
 * - The cart was lost on a reload or a stray back gesture.
 * - After ordering, closing the confirmation lost the order number, and
 *   there was nowhere to see what happened next.
 * Both now live in the browser's storage, and nothing breaks when the storage
 * is unavailable (a private window).
 */
import { describe, expect, it } from 'vitest';

import { loadCart, saveCart, type StoredItem } from '../cartStore';
import { forgetOrder, recallOrder, rememberOrder } from '../lastOrder';

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

class BrokenStorage {
  getItem(): string | null {
    throw new Error('blocked');
  }
  setItem(): void {
    throw new Error('blocked');
  }
  removeItem(): void {
    throw new Error('blocked');
  }
}

const kebab: StoredItem = { id: 'i-1', name_ar: 'كباب', price_minor: '22000', image_url: null, is_available: true };
const tea: StoredItem = { id: 'i-2', name_ar: 'شاي', price_minor: '2000', image_url: null, is_available: true };

describe('the cart', () => {
  it('comes back after a reload, for the same restaurant', () => {
    const storage = new MemoryStorage();
    saveCart(storage, 'wisam', [{ item: kebab, qty: 2 }]);
    expect(loadCart(storage, 'wisam', [kebab, tea])).toEqual([{ item: kebab, qty: 2 }]);
    expect(loadCart(storage, 'other', [kebab, tea])).toEqual([]);
  });

  it('takes the menu as it is now: current prices, and nothing gone or sold out', () => {
    const storage = new MemoryStorage();
    saveCart(storage, 'wisam', [{ item: kebab, qty: 1 }, { item: tea, qty: 3 }]);
    const repriced = { ...kebab, price_minor: '25000' };
    const soldOutTea = { ...tea, is_available: false };
    expect(loadCart(storage, 'wisam', [repriced, soldOutTea])).toEqual([{ item: repriced, qty: 1 }]);
  });

  it('survives storage that is blocked or holds nonsense', () => {
    expect(() => saveCart(new BrokenStorage(), 'wisam', [{ item: kebab, qty: 1 }])).not.toThrow();
    expect(loadCart(new BrokenStorage(), 'wisam', [kebab])).toEqual([]);
    const storage = new MemoryStorage();
    storage.setItem('sp-cart:wisam', '{not json');
    expect(loadCart(storage, 'wisam', [kebab])).toEqual([]);
  });
});

describe('the last order', () => {
  const now = Date.parse('2026-10-04T12:00:00Z');

  it('is remembered for the day it was placed', () => {
    const storage = new MemoryStorage();
    rememberOrder(storage, 'wisam', { id: 'o-1', number: '1001', placedAt: now });
    expect(recallOrder(storage, 'wisam', now + 3 * 3_600_000)).toEqual({ id: 'o-1', number: '1001', placedAt: now });
  });

  it('is forgotten after twelve hours, or when dismissed', () => {
    const storage = new MemoryStorage();
    rememberOrder(storage, 'wisam', { id: 'o-1', number: '1001', placedAt: now });
    expect(recallOrder(storage, 'wisam', now + 13 * 3_600_000)).toBeNull();
    rememberOrder(storage, 'wisam', { id: 'o-2', number: '1002', placedAt: now });
    forgetOrder(storage, 'wisam');
    expect(recallOrder(storage, 'wisam', now)).toBeNull();
  });

  it('survives blocked storage', () => {
    expect(() => rememberOrder(new BrokenStorage(), 'wisam', { id: 'o', number: '1', placedAt: now })).not.toThrow();
    expect(recallOrder(new BrokenStorage(), 'wisam', now)).toBeNull();
  });
});
