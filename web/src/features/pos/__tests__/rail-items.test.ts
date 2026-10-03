/**
 * The cashier's navigation on a phone.
 *
 * The rail holds eight destinations. On a 375px phone they shared the bottom
 * bar at about 40px each: labels broke onto two lines and ran into each other,
 * and the delivery badge sat on the neighbouring icon. The phone bar keeps the
 * destinations used during a sale and puts the rest behind "more". Found in the
 * design review (batch 9).
 */
import { describe, expect, it } from 'vitest';

import { PHONE_BAR_MAX, RAIL_TARGETS, phoneBar } from '../railItems';

describe('phone bar', () => {
  it('fits the phone, counting the "more" cell', () => {
    expect(phoneBar('order').primary.length + 1).toBeLessThanOrEqual(PHONE_BAR_MAX);
    expect(PHONE_BAR_MAX).toBeLessThanOrEqual(5);
  });

  it('keeps what a sale needs one tap away', () => {
    expect(phoneBar('order').primary).toEqual(expect.arrayContaining(['order', 'orders', 'deliveries']));
  });

  it('still reaches every destination', () => {
    const { primary, more } = phoneBar('order');
    expect([...primary, ...more].sort()).toEqual([...RAIL_TARGETS].sort());
    expect(new Set([...primary, ...more]).size).toBe(RAIL_TARGETS.length);
  });

  it('marks "more" as current when the screen lives behind it', () => {
    expect(phoneBar('reports').moreActive).toBe(true);
    expect(phoneBar('order').moreActive).toBe(false);
  });
});
