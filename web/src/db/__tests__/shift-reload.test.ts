/**
 * Does a shift still know what it took, after the till is reloaded?
 *
 * `expectedCash` is the number the whole close is judged against, and it is not
 * stored — it is the opening float plus the cash of every order the shift is
 * holding. A shift object rebuilt from storage holds nothing until its orders
 * are handed back to it, so if that hand-back is broken the drawer reads zero
 * and every cashier is accused of a shortfall equal to the day's takings.
 *
 * This walks the real path: save, reload, re-attach.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { Order, Shift } from '@/domain';
import { OrderRepository } from '../repositories/orderRepository';
import { ShiftRepository } from '../repositories/shiftRepository';
import { openDatabase, resetConnectionsForTests } from '../open';
import { orderToRecord, shiftToRecord, shiftRecordToSnapshot, hydrateOrder } from '../mappers';
import { freshDbName } from './fixtures';

beforeEach(() => resetConnectionsForTests());

function cashOrder(shiftId: string | null, number: string, amount: bigint): Order {
  const order = Order.create({ number, shiftRef: shiftId, cashierName: 'عمر' });
  order.addLine({ nameAr: 'سمك مقلي', unitPriceMinor: amount, qty: 1 });
  order.addPayment({ method: 'cash', amountMinor: amount });
  order.close();
  return order;
}

/** Exactly what PosProvider does when the till loads. */
async function reload(dbName: string): Promise<Shift | null> {
  const shifts = new ShiftRepository(dbName);
  const orders = new OrderRepository(dbName);
  const record = await shifts.activeShift();
  if (!record) return null;
  const shift = Shift.fromSnapshot(shiftRecordToSnapshot(record));
  for (const closed of await orders.listByStatus('closed')) {
    if (closed.shiftRef === shift.id) shift.addOrder(hydrateOrder(closed));
  }
  return shift;
}

describe('expected cash survives a reload', () => {
  it('remembers the cash taken before the page was refreshed', async () => {
    const dbName = freshDbName();
    await openDatabase(dbName);
    const shifts = new ShiftRepository(dbName);
    const orders = new OrderRepository(dbName);

    const shift = Shift.open({ openingFloatMinor: 0n, cashierName: 'عمر' });
    await shifts.save(shiftToRecord(shift));

    const order = cashOrder(shift.id, '1049', 25_000n);
    shift.addOrder(order);
    await orders.save(orderToRecord(order));
    await shifts.save(shiftToRecord(shift, undefined));

    expect(shift.expectedCash()).toBe(25_000n);

    const reloaded = await reload(dbName);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.id).toBe(shift.id);
    expect(reloaded?.expectedCash()).toBe(25_000n);
  });

  it('keeps the float when there are no sales yet', async () => {
    const dbName = freshDbName();
    await openDatabase(dbName);
    const shifts = new ShiftRepository(dbName);

    const shift = Shift.open({ openingFloatMinor: 5_000n, cashierName: 'عمر' });
    await shifts.save(shiftToRecord(shift));

    expect((await reload(dbName))?.expectedCash()).toBe(5_000n);
  });

  it('does not take another shift\'s orders', async () => {
    const dbName = freshDbName();
    await openDatabase(dbName);
    const shifts = new ShiftRepository(dbName);
    const orders = new OrderRepository(dbName);

    const mine = Shift.open({ openingFloatMinor: 0n, cashierName: 'عمر' });
    await shifts.save(shiftToRecord(mine));
    await orders.save(orderToRecord(cashOrder('some-other-shift', '900', 90_000n)));

    expect((await reload(dbName))?.expectedCash()).toBe(0n);
  });

  it('an order left with no shift is stranded, which is why it is bound at close', async () => {
    // The failure this exists to prevent: an order created while the till was
    // still loading carries no shift, and one with no shift can never be
    // re-attached to any drawer. Its cash disappears from every close.
    const dbName = freshDbName();
    await openDatabase(dbName);
    const shifts = new ShiftRepository(dbName);
    const orders = new OrderRepository(dbName);

    const shift = Shift.open({ openingFloatMinor: 0n, cashierName: 'عمر' });
    await shifts.save(shiftToRecord(shift));

    const stranded = Order.create({ number: '901', shiftRef: null, cashierName: 'عمر' });
    stranded.addLine({ nameAr: 'x', unitPriceMinor: 40_000n, qty: 1 });
    stranded.addPayment({ method: 'cash', amountMinor: 40_000n });
    stranded.close();
    await orders.save(orderToRecord(stranded));
    expect((await reload(dbName))?.expectedCash()).toBe(0n);

    // Bound before closing — as the till now does — the same money counts.
    const bound = Order.create({ number: '902', shiftRef: null, cashierName: 'عمر' });
    bound.addLine({ nameAr: 'x', unitPriceMinor: 40_000n, qty: 1 });
    bound.addPayment({ method: 'cash', amountMinor: 40_000n });
    bound.attachToShift(shift.id);
    bound.close();
    await orders.save(orderToRecord(bound));

    expect((await reload(dbName))?.expectedCash()).toBe(40_000n);
  });
});
