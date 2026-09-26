import { describe, expect, it } from 'vitest';

import { Payment } from '../Payment';
import { MenuItem } from '../MenuItem';
import { Order } from '../Order';
import { DomainError } from '../errors';

describe('Payment', () => {
  it('requires a reference for bank and wallet', () => {
    expect(() => Payment.create({ method: 'bank', amountMinor: 20_000n })).toThrowError(DomainError);
    expect(() =>
      Payment.create({ method: 'wallet', amountMinor: 2_000n, reference: 'فوري-1' }),
    ).not.toThrow();
  });

  it('requires a customer for credit', () => {
    expect(() => Payment.create({ method: 'credit', amountMinor: 40_000n })).toThrowError(
      /name the customer/,
    );
    expect(() =>
      Payment.create({ method: 'credit', amountMinor: 40_000n, customerId: 'c-1' }),
    ).not.toThrow();
  });

  it('counts only cash toward the drawer', () => {
    const cash = Payment.create({ method: 'cash', amountMinor: 10_000n });
    const credit = Payment.create({ method: 'credit', amountMinor: 40_000n, customerId: 'c-1' });
    expect(cash.countsTowardExpectedCash()).toBe(true);
    expect(credit.countsTowardExpectedCash()).toBe(false);
  });

  it('rejects a non-positive amount', () => {
    expect(() => Payment.create({ method: 'cash', amountMinor: 0n })).toThrowError(DomainError);
  });
});

describe('MenuItem', () => {
  const base = MenuItem.fromSnapshot({
    id: 'it-1',
    categoryId: 'c-1',
    nameAr: 'شاورما لحم',
    nameEn: 'Beef shawarma',
    descriptionAr: '',
    descriptionEn: '',
    priceMinor: 12_500n,
    isAvailable: true,
    isActive: true,
  });

  it('a later price change never touches a line already on an order', () => {
    const item = MenuItem.fromSnapshot(base.toSnapshot());
    const order = Order.create({ number: '1048' });
    order.addLine(item.toLine(2).toSnapshot());

    // The pulled/edited price moves the menu item...
    item.setPrice(15_000n);

    // ...but the sold line kept its snapshot.
    expect(order.subtotal()).toBe(25_000n);
    expect(item.priceMinor).toBe(15_000n);
  });

  it('raisePrice applies a percentage', () => {
    const item = MenuItem.fromSnapshot(base.toSnapshot());
    item.raisePrice(15);
    expect(item.priceMinor).toBe(14_375n);
  });

  it('is unavailable when inactive or flagged out of stock', () => {
    expect(base.isAvailable()).toBe(true);
    const out = MenuItem.fromSnapshot({ ...base.toSnapshot(), isAvailable: false });
    expect(out.isAvailable()).toBe(false);
  });
});
