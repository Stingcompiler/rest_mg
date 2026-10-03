/**
 * Collecting a website order at the till (implementation plan, decision D2).
 *
 * The deliveries screen hands the till a copy of the order — the same lines,
 * prices and number the customer was given — and the cashier takes the money
 * through the ordinary payment screen, inside the shift. The copy is not queued
 * for sync when it is taken: the server already has it, and hears back only
 * once the bill is paid and closed.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { freshDbName } from '@/db/__tests__/fixtures';
import { OrderRepository, openDatabase, pendingCount } from '@/db';
import type { DeliveryOrder } from '../api';
import { canCollect, collectableRecord } from '../collect';

beforeEach(() => resetConnectionsForTests());

function aDelivery(overrides: Partial<DeliveryOrder> = {}): DeliveryOrder {
  return {
    id: '3f0e8a2c-6b7d-4c1e-9a55-0f1d2c3b4a59',
    number: '1001',
    type: 'delivery',
    status: 'sent',
    channel: 'online',
    delivery_status: 'delivered',
    kitchen_status: 'served',
    total_minor: '29000',
    amount_due_minor: '29000',
    created_at: '2026-10-02T10:00:00Z',
    opened_at: '2026-10-02T10:00:00Z',
    sent_at: '2026-10-02T10:00:00Z',
    customer_name: 'أحمد',
    customer_phone: '0912345678',
    customer_address: 'شارع النيل',
    customer_area: '',
    customer_notes: '',
    lines: [
      { id: '0b6f8d0a-1111-4c1e-9a55-0f1d2c3b4a59', item_id: 'a1b2c3d4-0000-4c1e-9a55-0f1d2c3b4a59', name_ar: 'عصيدة', name_en: 'Aseeda', unit_price_minor: '9000', qty: 2, line_total_minor: '18000' },
      { id: '0b6f8d0a-2222-4c1e-9a55-0f1d2c3b4a59', item_id: null, name_ar: 'كركدي', name_en: '', unit_price_minor: '5500', qty: 2, line_total_minor: '11000' },
    ],
    ...overrides,
  };
}

describe('canCollect', () => {
  it('offers collection once the order is confirmed and still unpaid', () => {
    for (const ds of ['confirmed', 'preparing', 'out_for_delivery', 'delivered'] as const) {
      expect(canCollect(aDelivery({ delivery_status: ds }))).toBe(true);
    }
  });

  it('not before it is confirmed, not once cancelled, and not once paid', () => {
    expect(canCollect(aDelivery({ delivery_status: 'pending' }))).toBe(false);
    expect(canCollect(aDelivery({ delivery_status: 'cancelled', status: 'void' }))).toBe(false);
    expect(canCollect(aDelivery({ status: 'closed', amount_due_minor: '0' }))).toBe(false);
  });
});

describe('collectableRecord', () => {
  it('copies what the customer ordered, at the prices they were given', () => {
    const record = collectableRecord(aDelivery(), { shiftRef: 'shift-1', cashierId: null, cashierName: 'سمية' });
    expect(record.id).toBe('3f0e8a2c-6b7d-4c1e-9a55-0f1d2c3b4a59');
    expect(record.number).toBe('1001');
    expect(record.type).toBe('delivery');
    expect(record.status).toBe('sent');
    expect(record.totalMinor).toBe('29000');
    expect(record.payments).toEqual([]);
    expect(record.shiftRef).toBe('shift-1');
    expect(record.cashierName).toBe('سمية');
    expect(record.lines.map((line) => [line.id, line.nameAr, line.unitPriceMinor, line.qty])).toEqual([
      ['0b6f8d0a-1111-4c1e-9a55-0f1d2c3b4a59', 'عصيدة', '9000', 2],
      ['0b6f8d0a-2222-4c1e-9a55-0f1d2c3b4a59', 'كركدي', '5500', 2],
    ]);
  });
});

describe('taking the order into the till', () => {
  it('puts it among the open bills without queueing it for sync', async () => {
    const name = freshDbName();
    const orders = new OrderRepository(name);
    await orders.adopt(collectableRecord(aDelivery(), { shiftRef: null, cashierId: null, cashierName: '' }));

    expect((await orders.listOpen()).map((order) => order.number)).toEqual(['1001']);
    expect(await pendingCount(await openDatabase(name))).toBe(0);
  });

  it('never overwrites a copy the till already holds', async () => {
    const name = freshDbName();
    const orders = new OrderRepository(name);
    const first = collectableRecord(aDelivery(), { shiftRef: null, cashierId: null, cashierName: 'سمية' });
    await orders.adopt(first);
    await orders.adopt(collectableRecord(aDelivery(), { shiftRef: null, cashierId: null, cashierName: 'عمر' }));
    expect((await orders.get(first.id))?.cashierName).toBe('سمية');
  });
});
