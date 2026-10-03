/**
 * Correcting a mistake on the till without cancelling the whole bill.
 *
 * From the user-experience review (batch 11):
 * - A payment taken on the wrong method, or for the wrong amount, could not be
 *   removed. The only way out was to void the whole bill.
 * - A bill with money on it could be voided. The cash stayed in the drawer and
 *   the shift close showed a surplus nobody could explain.
 * - "Send to kitchen" accepted an order the kitchen already had, and each tap
 *   printed the whole ticket again. The kitchen cooks what it is handed, twice.
 * - Once sent, a line could not be taken off at all: the stepper stopped at one
 *   and nothing on screen voided it.
 */
import { describe, expect, it } from 'vitest';

import { DomainError, Order, Shift } from '@/domain';

function aBill() {
  const order = Order.create({ number: 'K7-2001' });
  const kebab = order.addLine({ nameAr: 'كباب', unitPriceMinor: 22_000n, qty: 2 });
  const tea = order.addLine({ nameAr: 'شاي', unitPriceMinor: 2_000n, qty: 1 });
  return { order, kebab, tea };
}

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : String(error);
  }
}

describe('a recorded payment', () => {
  it('can be taken off an open bill', () => {
    const { order } = aBill();
    const wrong = order.addPayment({ method: 'bank', amountMinor: 46_000n, reference: 'TRX-1' });
    order.removePayment(wrong.id);
    expect(order.amountPaid()).toBe(0n);
    expect(order.amountDue()).toBe(46_000n);
  });

  it('cannot be taken off a closed bill', () => {
    const { order } = aBill();
    const cash = order.addPayment({ method: 'cash', amountMinor: 46_000n });
    order.close();
    expect(codeOf(() => order.removePayment(cash.id))).toBe('order_immutable');
  });

  it('must exist', () => {
    const { order } = aBill();
    expect(codeOf(() => order.removePayment('no-such-payment'))).toBe('payment_not_found');
  });
});

describe('voiding a bill', () => {
  it('is refused while money is recorded on it', () => {
    const { order } = aBill();
    order.addPayment({ method: 'cash', amountMinor: 10_000n });
    expect(codeOf(() => order.void('طلب الزبون'))).toBe('order_has_payments');
    expect(order.status).toBe('open');
  });

  it('is allowed once the payments are taken off', () => {
    const { order } = aBill();
    const cash = order.addPayment({ method: 'cash', amountMinor: 10_000n });
    order.removePayment(cash.id);
    order.void('طلب الزبون');
    expect(order.status).toBe('void');
    expect(order.toSnapshot().voidReason).toBe('طلب الزبون');
  });
});

describe('sending to the kitchen', () => {
  it('sends every line the first time', () => {
    const { order } = aBill();
    const sent = order.send();
    expect(sent.amendment).toBe(false);
    expect(sent.changes.map((c) => [c.nameAr, c.delta])).toEqual([
      ['كباب', 2],
      ['شاي', 1],
    ]);
  });

  it('refuses a second send with nothing new', () => {
    const { order } = aBill();
    order.send();
    expect(order.kitchenChanges()).toEqual([]);
    expect(codeOf(() => order.send())).toBe('nothing_to_send');
  });

  it('sends only what changed since: additions and cancellations', () => {
    const { order, kebab, tea } = aBill();
    const firstSentAt = '2026-10-03T12:00:00.000Z';
    order.send(firstSentAt);
    order.addLine({ nameAr: 'عصير مانجو', unitPriceMinor: 8_000n, qty: 1 });
    order.changeQty(kebab.id, 3);
    order.voidLine(tea.id, 'نفد الصنف');

    const sent = order.send('2026-10-03T12:10:00.000Z');
    expect(sent.amendment).toBe(true);
    expect(sent.changes.map((c) => [c.nameAr, c.delta])).toEqual([
      ['كباب', 1],
      ['شاي', -1],
      ['عصير مانجو', 1],
    ]);
    // The ticket's age on the kitchen board runs from the first send.
    expect(order.toSnapshot().sentAt).toBe(firstSentAt);
  });

  it('remembers what the kitchen has across a reload', () => {
    const { order } = aBill();
    order.send();
    const reloaded = Order.fromSnapshot(order.toSnapshot());
    expect(reloaded.kitchenChanges()).toEqual([]);
  });

  it('treats lines saved before this was tracked as already sent', () => {
    const { order } = aBill();
    order.send();
    const legacy = order.toSnapshot();
    for (const line of legacy.lines) delete (line as { kitchenQty?: number }).kitchenQty;
    expect(Order.fromSnapshot(legacy).kitchenChanges()).toEqual([]);
  });
});

describe('a line after sending', () => {
  it('can be voided with a reason', () => {
    const { order, tea } = aBill();
    order.send();
    order.voidLine(tea.id, 'خطأ في الإدخال');
    expect(order.total()).toBe(44_000n);
  });

  it('cannot be removed outright, because the kitchen has it', () => {
    const { order, tea } = aBill();
    order.send();
    expect(codeOf(() => order.removeLine(tea.id))).toBe('line_sent_must_void');
  });

  it('added after the send can still be removed, because the kitchen has not seen it', () => {
    const { order } = aBill();
    order.send();
    const juice = order.addLine({ nameAr: 'عصير', unitPriceMinor: 8_000n });
    order.removeLine(juice.id);
    expect(order.kitchenChanges()).toEqual([]);
  });
});

describe('the opening float', () => {
  it('is asked for when a shift opens without one', () => {
    const shift = Shift.open({ cashierName: 'سمية' });
    expect(shift.needsOpeningFloat()).toBe(true);
    shift.setOpeningFloat(50_000n);
    expect(shift.needsOpeningFloat()).toBe(false);
    expect(shift.expectedCash()).toBe(50_000n);
  });

  it('may be zero, and is then not asked again', () => {
    const shift = Shift.open();
    shift.setOpeningFloat(0n);
    expect(shift.needsOpeningFloat()).toBe(false);
  });

  it('is never negative', () => {
    const shift = Shift.open();
    expect(codeOf(() => shift.setOpeningFloat(-1n))).toBe('invalid_float');
  });

  it('is not asked again of a shift saved before it was tracked', () => {
    const snapshot = Shift.open().toSnapshot();
    delete (snapshot as { openingFloatConfirmedAt?: string | null }).openingFloatConfirmedAt;
    expect(Shift.fromSnapshot(snapshot).needsOpeningFloat()).toBe(false);
  });
});
