/**
 * The front-of-house steps for a delivery and for a pickup (batch 16).
 *
 * A pickup waits at the counter instead of going out with a rider: the
 * kitchen's "ready" makes it ready for pickup, and front-of-house marks it
 * collected. An order left ready for an hour is flagged, and cancelled as a
 * no-show by the server's expire_pickups.
 */
import { describe, expect, it } from 'vitest';

import { isOverdue, nextStep, waitingOnKitchen } from '../fulfilment';

const delivery = (delivery_status: string, kitchen_status = 'queued') => ({ type: 'delivery', delivery_status, kitchen_status });
const pickup = (delivery_status: string, kitchen_status = 'queued') => ({ type: 'takeaway', delivery_status, kitchen_status });

describe('nextStep', () => {
  it('sends a delivery out, then marks it delivered', () => {
    expect(nextStep(delivery('pending'))).toBe('confirmed');
    expect(nextStep(delivery('confirmed'))).toBe('out_for_delivery');
    expect(nextStep(delivery('out_for_delivery'))).toBe('delivered');
    expect(nextStep(delivery('delivered'))).toBeNull();
  });

  it('keeps a pickup at the counter, then marks it collected', () => {
    expect(nextStep(pickup('pending'))).toBe('confirmed');
    expect(nextStep(pickup('confirmed'))).toBe('ready_for_pickup');
    expect(nextStep(pickup('preparing'))).toBe('ready_for_pickup');
    expect(nextStep(pickup('ready_for_pickup'))).toBe('collected');
    expect(nextStep(pickup('collected'))).toBeNull();
  });
});

describe('waitingOnKitchen', () => {
  it('holds both kinds until the kitchen says ready', () => {
    expect(waitingOnKitchen(delivery('confirmed', 'preparing'))).toBe(true);
    expect(waitingOnKitchen(delivery('confirmed', 'ready'))).toBe(false);
    expect(waitingOnKitchen(pickup('preparing', 'preparing'))).toBe(true);
    expect(waitingOnKitchen(pickup('ready_for_pickup', 'ready'))).toBe(false);
  });
});

describe('isOverdue', () => {
  const now = Date.parse('2026-10-04T20:00:00Z');
  it('flags a pickup left ready for an hour', () => {
    const ready = { ...pickup('ready_for_pickup', 'ready'), kitchen_updated_at: '2026-10-04T18:55:00Z' };
    expect(isOverdue(ready, now)).toBe(true);
    expect(isOverdue({ ...ready, kitchen_updated_at: '2026-10-04T19:30:00Z' }, now)).toBe(false);
    expect(isOverdue({ ...delivery('out_for_delivery', 'ready'), kitchen_updated_at: '2026-10-04T10:00:00Z' }, now)).toBe(false);
  });
});
