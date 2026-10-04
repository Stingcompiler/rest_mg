/**
 * The front-of-house steps for a delivery and for a pickup (batch 16).
 *
 * A pickup waits at the counter instead of going out with a rider: the
 * kitchen's "ready" makes it ready for pickup, and front-of-house marks it
 * collected. An order left ready for an hour is flagged, and cancelled as a
 * no-show by the server's expire_pickups.
 */
import { describe, expect, it } from 'vitest';

import type { DeliveryOrder } from '../api';
import { canCollect, collectableRecord } from '../collect';
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

/**
 * Found while verifying batch 16: a pickup could not be taken to the till
 * once it was ready or collected, so a collected order left the board unpaid.
 */
describe('collecting a pickup at the till', () => {
  const order = (delivery_status: string) => ({
    id: 'o-1', number: '1003', type: 'takeaway', status: 'sent', channel: 'online',
    delivery_status, kitchen_status: 'ready', total_minor: '14375', amount_due_minor: '14375',
    created_at: '2026-10-04T13:52:00Z', customer_name: 'منى', customer_phone: '0991234567',
    customer_address: '', customer_area: '', customer_notes: '',
    lines: [{ id: 'l-1', name_ar: 'شاورما', qty: 1, unit_price_minor: '14375', line_total_minor: '14375' }],
  }) as unknown as DeliveryOrder;

  it('is possible while ready and after it was handed over', () => {
    expect(canCollect(order('ready_for_pickup'))).toBe(true);
    expect(canCollect(order('collected'))).toBe(true);
  });

  it('opens on the till as a takeaway', () => {
    const record = collectableRecord(order('ready_for_pickup'), { shiftRef: null, cashierId: null, cashierName: '' });
    expect(record.type).toBe('takeaway');
  });
});
