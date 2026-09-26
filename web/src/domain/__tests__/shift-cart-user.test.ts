import { describe, expect, it } from 'vitest';

import { Shift } from '../Shift';
import { CashCount } from '../CashCount';
import { CartSession } from '../CartSession';
import { Order } from '../Order';
import { User } from '../User';
import { DomainError } from '../errors';

function paidOrder(cash: bigint, credit = 0n): Order {
  const order = Order.create({ number: '1048' });
  order.addLine({ nameAr: 'x', unitPriceMinor: cash + credit, qty: 1 });
  if (cash > 0n) order.addPayment({ method: 'cash', amountMinor: cash });
  if (credit > 0n) order.addPayment({ method: 'credit', amountMinor: credit, customerId: 'c-1' });
  order.close();
  return order;
}

describe('Shift', () => {
  it('excludes credit from expected cash', () => {
    const shift = Shift.open({ openingFloatMinor: 0n });
    shift.addOrder(paidOrder(25_000n)); // all cash
    shift.addOrder(paidOrder(0n, 40_000n)); // all credit
    // 65,000 was sold, but only 25,000 in cash is in the drawer.
    expect(shift.expectedCash()).toBe(25_000n);
  });

  it('cannot close while an order is still open', () => {
    const shift = Shift.open();
    const open = Order.create({ number: '1049' });
    open.addLine({ nameAr: 'x', unitPriceMinor: 5_000n });
    shift.addOrder(open);
    shift.setCounts([CashCount.forDenomination(5_000n, 0)]);

    expect(shift.blockingReasons()).toContain('open_orders');
    expect(() => shift.close()).toThrowError(DomainError);
    try {
      shift.close();
    } catch (error) {
      expect((error as DomainError).code).toBe('shift_open_orders');
    }
  });

  it('cannot close on a variance beyond tolerance without a reason', () => {
    const shift = Shift.open({ openingFloatMinor: 0n });
    shift.addOrder(paidOrder(648_000n)); // expected 648,000
    shift.setCounts([CashCount.forDenomination(1_000n, 635)]); // counted 635,000 → −13,000

    expect(shift.needsVarianceReason()).toBe(true);
    expect(() => shift.close()).toThrowError(/written reason/);

    // With a reason, it closes.
    shift.close({ reason: 'نقص، أُبلغ المدير' });
    expect(shift.status).toBe('closed');
    expect(shift.variance()).toBe(-13_000n);
  });

  it('closes cleanly when the count is within tolerance', () => {
    const shift = Shift.open({ openingFloatMinor: 0n });
    shift.addOrder(paidOrder(100_000n));
    shift.setCounts([CashCount.forDenomination(1_000n, 100)]); // exact
    expect(shift.needsVarianceReason()).toBe(false);
    shift.close();
    expect(shift.status).toBe('closed');
  });

  it('counts cash by denomination into the counted total', () => {
    const shift = Shift.open();
    shift.setCounts([
      CashCount.forDenomination(5_000n, 98), // 490,000
      CashCount.forDenomination(2_000n, 45), // 90,000
      CashCount.lump(4_000n), // معدن
    ]);
    expect(shift.countedCash()).toBe(584_000n);
  });
});

describe('Shift — what the closing report has to show', () => {
  // The shift-close screen showed expected cash and nothing else, under a
  // heading promising a breakdown by method. A cashier facing a shortfall could
  // not see that the money had gone to the bank or was owed on credit.
  it('splits the takings by how they were paid', () => {
    const shift = Shift.open({ openingFloatMinor: 0n });
    shift.addOrder(paidOrder(25_000n));
    shift.addOrder(paidOrder(0n, 40_000n));

    const totals = shift.totalsByMethod();

    expect(totals.cash).toBe(25_000n);
    expect(totals.credit).toBe(40_000n);
    expect(totals.bank).toBe(0n);
    expect(totals.wallet).toBe(0n);
  });

  it('adds up one order paid two ways', () => {
    const order = Order.create({ number: '2001' });
    order.addLine({ nameAr: 'x', unitPriceMinor: 30_000n, qty: 1 });
    order.addPayment({ method: 'cash', amountMinor: 10_000n });
    order.addPayment({ method: 'bank', amountMinor: 20_000n, reference: 'REF1' });
    order.close();

    const shift = Shift.open({ openingFloatMinor: 0n });
    shift.addOrder(order);

    const totals = shift.totalsByMethod();
    expect(totals.cash).toBe(10_000n);
    expect(totals.bank).toBe(20_000n);
    // And only the cash half is what the drawer should hold.
    expect(shift.expectedCash()).toBe(10_000n);
  });

  it('keeps the method split apart from the drawer', () => {
    // The whole point: the non-cash rows must never inflate expected cash, or
    // every shift with a bank transfer would close short by that amount.
    const shift = Shift.open({ openingFloatMinor: 5_000n });
    shift.addOrder(paidOrder(0n, 90_000n));

    expect(shift.totalsByMethod().credit).toBe(90_000n);
    expect(shift.expectedCash()).toBe(5_000n); // the float, and nothing else
  });

  it('counts the bills for the report', () => {
    const shift = Shift.open({ openingFloatMinor: 0n });
    shift.addOrder(paidOrder(1_000n));
    shift.addOrder(paidOrder(2_000n));
    expect(shift.orderCount()).toBe(2);
  });

  it('reports an empty shift as zeros rather than nothing', () => {
    const totals = Shift.open({ openingFloatMinor: 0n }).totalsByMethod();
    expect(totals).toEqual({ cash: 0n, bank: 0n, wallet: 0n, credit: 0n });
  });
});

describe('Shift — closing it once, and only once', () => {
  it('refuses a second close', () => {
    // The cashier presses twice, or the button stays live while the write is in
    // flight. The entity is the last line: a shift already handed over must not
    // be closed again with a different count.
    const shift = Shift.open({ openingFloatMinor: 0n });
    shift.close();
    expect(shift.status).toBe('closed');
    expect(() => shift.close()).toThrow(DomainError);
    try {
      shift.close();
    } catch (error) {
      expect((error as DomainError).code).toBe('shift_already_closed');
    }
  });

  it('will not close while an order is still open', () => {
    const shift = Shift.open({ openingFloatMinor: 0n });
    const live = Order.create({ number: '77' });
    live.addLine({ nameAr: 'x', unitPriceMinor: 1_000n, qty: 1 });
    shift.addOrder(live);
    expect(() => shift.close()).toThrow(DomainError);
    expect(shift.status).toBe('open');
  });

  it('keeps its takings after it is closed, so the report still reads', () => {
    const shift = Shift.open({ openingFloatMinor: 0n });
    shift.addOrder(paidOrder(25_000n));
    // Nothing counted against 25,000 expected is a variance past tolerance, so
    // the entity wants a reason — exactly as it should.
    shift.close({ reason: 'تسليم للوردية التالية' });
    expect(shift.expectedCash()).toBe(25_000n);
    expect(shift.totalsByMethod().cash).toBe(25_000n);
  });
});

describe('CartSession — the multi-cart tabs', () => {
  function draft(number: string): Order {
    const order = Order.create({ number });
    order.addLine({ nameAr: 'x', unitPriceMinor: 1_000n });
    return order;
  }

  it('holds several open orders and switches between them', () => {
    const session = new CartSession();
    const a = draft('t4');
    const b = draft('t1');
    const c = draft('to47');
    session.open(a);
    session.open(b);
    session.open(c);

    expect(session.count()).toBe(3);
    expect(session.active()?.id).toBe(c.id);
    session.switchTo(a.id);
    expect(session.active()?.id).toBe(a.id);
  });

  it('parks an order but keeps it on the strip', () => {
    const session = new CartSession();
    const a = draft('t4');
    const b = draft('t1');
    session.open(a);
    session.open(b);
    session.switchTo(a.id);

    session.park(a.id);
    expect(a.status).toBe('parked');
    expect(session.count()).toBe(2);
    expect(session.active()?.id).toBe(b.id);
  });

  it('closes an order off the strip', () => {
    const session = new CartSession();
    const a = draft('t4');
    session.open(a);
    session.close(a.id);
    expect(session.count()).toBe(0);
    expect(session.active()).toBeNull();
  });

  it('refuses to switch to a cart that is not open', () => {
    const session = new CartSession();
    expect(() => session.switchTo('ghost')).toThrowError(DomainError);
  });
});

describe('User permissions', () => {
  const cashier = User.fromSnapshot({ id: 'u1', nameAr: 'سمية', nameEn: 'Sumaya', role: 'cashier' });
  const manager = User.fromSnapshot({ id: 'u2', nameAr: 'مدير', nameEn: 'Manager', role: 'manager' });

  it('lets a cashier run the till but not manage structure or reports', () => {
    expect(cashier.can('take_payment')).toBe(true);
    expect(cashier.can('close_shift')).toBe(true);
    expect(cashier.can('manage_menu_structure')).toBe(false);
    expect(cashier.can('view_reports')).toBe(false);
    expect(cashier.can('enrol_device')).toBe(false);
  });

  it('lets a manager do everything a cashier can, and more', () => {
    expect(manager.can('take_payment')).toBe(true);
    expect(manager.can('manage_menu_structure')).toBe(true);
    expect(manager.can('view_reports')).toBe(true);
    expect(manager.can('enrol_device')).toBe(true);
  });
});
