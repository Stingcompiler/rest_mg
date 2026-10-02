/**
 * Closing a shift with bills still open on the till (review finding F09).
 *
 * The shift entity only ever held the orders that had closed, so its "no open
 * orders" rule could not fire: the screen read zero open orders and allowed the
 * close while a bill was still on the floor. The device's open orders live in
 * IndexedDB, so that is what the close now asks — and what these tests hold it
 * to, including after a reload rebuilds everything from storage.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { freshDbName } from '@/db/__tests__/fixtures';
import { OrderRepository, ShiftRepository } from '@/db';
import { orderToRecord, shiftRecordToSnapshot, shiftToRecord } from '@/db/mappers';
import { DomainError, Order, Shift } from '@/domain';
import { closeShiftOnDevice, openOrdersOnDevice } from '../shiftClose';

beforeEach(() => resetConnectionsForTests());

function setUp() {
  const name = freshDbName();
  const orders = new OrderRepository(name);
  const shifts = new ShiftRepository(name);
  const shift = Shift.open({ cashierName: 'سمية' });
  return { orders, shifts, shift };
}

async function ringUp(orders: OrderRepository, shift: Shift, status: 'open' | 'sent' = 'open') {
  const order = Order.create({ number: '1048', shiftRef: shift.id });
  order.addLine({ nameAr: 'شاي', unitPriceMinor: 2_000n, qty: 1 });
  if (status === 'sent') order.send();
  await orders.save(orderToRecord(order));
  return order;
}

const nextCashier = { cashierId: null, cashierName: 'عمر' };

describe('closing a shift', () => {
  it('is refused while a bill is open on the till', async () => {
    const { orders, shifts, shift } = setUp();
    await ringUp(orders, shift);

    await expect(closeShiftOnDevice(shift, nextCashier, { orders, shifts })).rejects.toThrowError(
      expect.objectContaining({ code: 'shift_open_orders' }) as DomainError,
    );
    expect(shift.status).toBe('open');
    expect(await shifts.activeShift()).toBeUndefined();
  });

  it('is refused while a bill sent to the kitchen is unpaid', async () => {
    const { orders, shifts, shift } = setUp();
    await ringUp(orders, shift, 'sent');
    await expect(closeShiftOnDevice(shift, nextCashier, { orders, shifts })).rejects.toThrow();
  });

  it('counts every open bill on the device, whichever shift opened it', async () => {
    const { orders, shift } = setUp();
    await ringUp(orders, Shift.open());
    await ringUp(orders, shift);
    expect(await openOrdersOnDevice(orders)).toHaveLength(2);
  });

  it('goes through once the bill is settled, and opens the next shift', async () => {
    const { orders, shifts, shift } = setUp();
    const order = await ringUp(orders, shift);
    order.addPayment({ method: 'cash', amountMinor: 2_000n, tenderedMinor: 2_000n });
    order.close();
    await orders.save(orderToRecord(order));

    const next = await closeShiftOnDevice(shift, nextCashier, { orders, shifts });

    expect(shift.status).toBe('closed');
    expect(next.status).toBe('open');
    expect(next.cashierName).toBe('عمر');
    expect((await shifts.get(shift.id))?.status).toBe('closed');
    expect((await shifts.activeShift())?.id).toBe(next.id);
  });

  it('is still refused after a reload rebuilds the shift from storage', async () => {
    const { orders, shifts, shift } = setUp();
    await shifts.save(shiftToRecord(shift));
    await ringUp(orders, shift);

    resetConnectionsForTests();
    const stored = await shifts.activeShift();
    const reloaded = Shift.fromSnapshot(shiftRecordToSnapshot(stored!));

    await expect(closeShiftOnDevice(reloaded, nextCashier, { orders, shifts })).rejects.toThrow();
  });
});

describe('the shift entity', () => {
  it('names open orders as the reason it cannot close', () => {
    const shift = Shift.open();
    expect(shift.blockingReasons(1)).toContain('open_orders');
    expect(shift.blockingReasons(0)).not.toContain('open_orders');
    expect(shift.canClose(2)).toBe(false);
  });
});
