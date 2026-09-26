/**
 * The mapper is the client's money boundary, so it is held to the same bar as
 * the server's: a value survives entity → record → entity unchanged, and it does
 * so past the precision a JSON number can hold.
 */
import { describe, expect, it } from 'vitest';

import { Order, Shift, CashCount } from '@/domain';
import { hydrateOrder, orderToRecord, shiftToRecord, shiftRecordToSnapshot } from '../mappers';

function sampleOrder(): Order {
  const order = Order.create({ number: '1048', cashierName: 'سمية' });
  order.addLine({ nameAr: 'شاورما لحم', unitPriceMinor: 12_500n, qty: 2 });
  order.addLine({ nameAr: 'شاي', unitPriceMinor: 2_000n, qty: 1 });
  order.applyDiscount(2_000n);
  return order;
}

describe('order round-trip', () => {
  it('preserves money, lines and derived totals', () => {
    const order = sampleOrder();
    const record = orderToRecord(order);

    expect(record.subtotalMinor).toBe('27000');
    expect(record.totalMinor).toBe('25000');
    expect(record.itemCount).toBe(3);
    expect(record.lines[0].lineTotalMinor).toBe('25000');

    const rehydrated = hydrateOrder(record);
    expect(rehydrated.subtotal()).toBe(27_000n);
    expect(rehydrated.total()).toBe(25_000n);
    expect(rehydrated.toSnapshot().lines).toHaveLength(2);
  });

  it('carries money beyond Number.MAX_SAFE_INTEGER through the string boundary', () => {
    const order = Order.create({ number: '1' });
    const huge = 2n ** 53n + 1n;
    order.addLine({ nameAr: 'x', unitPriceMinor: huge, qty: 1 });

    const record = orderToRecord(order);
    expect(record.totalMinor).toBe('9007199254740993');
    expect(hydrateOrder(record).total()).toBe(huge);
  });

  it('preserves the original createdAt on re-save and re-unsyncs', () => {
    const order = sampleOrder();
    const first = orderToRecord(order);
    const withSync = { ...first, createdAt: '2026-08-07T08:00:00.000Z', syncedAt: '2026-08-07T09:00:00.000Z' };

    order.addLine({ nameAr: 'ماء', unitPriceMinor: 1_000n, qty: 1 });
    const second = orderToRecord(order, withSync);

    expect(second.createdAt).toBe('2026-08-07T08:00:00.000Z');
    expect(second.syncedAt).toBeNull(); // edited → unsynced
  });
});

describe('shift round-trip', () => {
  it('computes expected/counted/variance into the record and preserves counts', () => {
    const shift = Shift.open({ openingFloatMinor: 0n });
    const paid = Order.create({ number: '1048' });
    paid.addLine({ nameAr: 'x', unitPriceMinor: 100_000n, qty: 1 });
    paid.addPayment({ method: 'cash', amountMinor: 100_000n });
    paid.close();
    shift.addOrder(paid);
    shift.setCounts([CashCount.forDenomination(5_000n, 19), CashCount.lump(5_000n)]);

    const record = shiftToRecord(shift);
    expect(record.expectedCashMinor).toBe('100000');
    expect(record.countedCashMinor).toBe('100000');
    expect(record.varianceMinor).toBe('0');
    expect(record.counts).toHaveLength(2);

    const snapshot = shiftRecordToSnapshot(record);
    expect(snapshot.counts[0].denominationMinor).toBe(5_000n);
    expect(snapshot.counts[1].denominationMinor).toBeNull();
  });
});
