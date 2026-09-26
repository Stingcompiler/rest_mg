/**
 * The order rules, each as a named test. These are the invariants the whole
 * app leans on; if one breaks here, no screen or endpoint can save it.
 */
import { describe, expect, it } from 'vitest';

import { Order } from '../Order';
import { DomainError } from '../errors';

function orderWith(lineTotal: bigint, qty = 1): Order {
  const order = Order.create({ number: '1048' });
  order.addLine({ nameAr: 'شاورما لحم', unitPriceMinor: lineTotal / BigInt(qty), qty });
  return order;
}

describe('building the bill', () => {
  it('subtotal is the sum of live lines; total subtracts the discount', () => {
    const order = Order.create({ number: '1048' });
    order.addLine({ nameAr: 'شاورما لحم', unitPriceMinor: 12_500n, qty: 2 });
    order.addLine({ nameAr: 'شاي', unitPriceMinor: 2_000n, qty: 1 });
    expect(order.subtotal()).toBe(27_000n);
    order.applyDiscount(2_000n);
    expect(order.total()).toBe(25_000n);
  });

  it('a discount cannot exceed the subtotal', () => {
    const order = orderWith(25_000n);
    expect(() => order.applyDiscount(30_000n)).toThrowError(DomainError);
    try {
      order.applyDiscount(30_000n);
    } catch (error) {
      expect((error as DomainError).code).toBe('discount_exceeds_subtotal');
    }
  });
});

describe('closing', () => {
  it('cannot close while an amount is still due', () => {
    const order = orderWith(25_000n);
    order.addPayment({ method: 'cash', amountMinor: 10_000n });
    expect(order.amountDue()).toBe(15_000n);
    expect(order.canClose()).toBe(false);
    expect(() => order.close()).toThrowError(/still due/);
  });

  it('closes once the balance is covered', () => {
    const order = orderWith(25_000n);
    order.addPayment({ method: 'cash', amountMinor: 25_000n });
    order.close();
    expect(order.status).toBe('closed');
  });

  it('over-tender produces change and never a negative amount due', () => {
    const order = orderWith(25_000n);
    order.addPayment({ method: 'cash', amountMinor: 25_000n, tenderedMinor: 30_000n });
    expect(order.changeDue()).toBe(5_000n);
    expect(order.amountDue()).toBe(0n);
  });

  it('a split payment across methods settles the balance', () => {
    const order = orderWith(25_000n);
    order.addPayment({ method: 'bank', amountMinor: 20_000n, reference: '4482' });
    order.addPayment({ method: 'cash', amountMinor: 5_000n });
    expect(order.amountDue()).toBe(0n);
    expect(order.canClose()).toBe(true);
  });
});

describe('immutability of a closed order', () => {
  it('refuses every mutation once closed', () => {
    const order = orderWith(25_000n);
    order.addPayment({ method: 'cash', amountMinor: 25_000n });
    order.close();

    expect(() => order.addLine({ nameAr: 'x', unitPriceMinor: 1_000n })).toThrowError(DomainError);
    expect(() => order.applyDiscount(1_000n)).toThrowError(DomainError);
    expect(() => order.addPayment({ method: 'cash', amountMinor: 1_000n })).toThrowError(DomainError);
    expect(() => order.void('mistake')).toThrowError(/reverse it/);
  });

  it('is corrected by a new reversing order, not by an edit', () => {
    const original = orderWith(25_000n);
    original.addPayment({ method: 'cash', amountMinor: 25_000n });
    original.close();

    const reversal = Order.reverse(original, { number: '1048-R' });

    expect(reversal.id).not.toBe(original.id);
    expect(reversal.correctsId).toBe(original.id);
    expect(reversal.status).toBe('open');
    // The original is untouched.
    expect(original.status).toBe('closed');
    expect(original.correctsId).toBeNull();
  });
});

describe('voided lines are an audit record', () => {
  it('a voided line stays on the order but stops counting', () => {
    const order = Order.create({ number: '1048' });
    const line = order.addLine({ nameAr: 'شاي', unitPriceMinor: 2_000n, qty: 2 });
    order.addLine({ nameAr: 'شاورما', unitPriceMinor: 12_500n, qty: 1 });

    order.voidLine(line.id, 'العميل ألغى');

    expect(order.subtotal()).toBe(12_500n);
    // Still present in the snapshot — never deleted.
    const snapshot = order.toSnapshot();
    expect(snapshot.lines).toHaveLength(2);
    expect(snapshot.lines.find((l) => l.id === line.id)?.isVoid).toBe(true);
  });

  it('a line that has reached the kitchen must be voided, not removed', () => {
    const order = orderWith(12_500n);
    const line = order.toSnapshot().lines[0];
    order.send();
    expect(() => order.removeLine(line.id)).toThrowError(/void the line/);
    order.voidLine(line.id, 'خطأ');
    expect(order.toSnapshot().lines[0].isVoid).toBe(true);
  });
});

describe('splitting a bill', () => {
  it('moves the chosen lines to a new order and leaves the rest', () => {
    const order = Order.create({ number: '1048' });
    const shawarma = order.addLine({ nameAr: 'شاورما', unitPriceMinor: 12_500n, qty: 1 });
    order.addLine({ nameAr: 'شاي', unitPriceMinor: 2_000n, qty: 2 });

    const child = order.split([shawarma.id], { number: '1048-2' });

    expect(child.subtotal()).toBe(12_500n);
    expect(order.subtotal()).toBe(4_000n);
    expect(child.id).not.toBe(order.id);
  });
});

describe('money stays bigint end to end', () => {
  it('carries values beyond Number.MAX_SAFE_INTEGER exactly', () => {
    const huge = 2n ** 53n + 1n;
    const order = Order.create({ number: '1' });
    order.addLine({ nameAr: 'x', unitPriceMinor: huge, qty: 1 });
    expect(typeof order.total()).toBe('bigint');
    expect(order.total()).toBe(9_007_199_254_740_993n);
  });
});
