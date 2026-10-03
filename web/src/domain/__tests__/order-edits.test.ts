/**
 * Editing a bill on the till: a note on a line, and what kind of order it is.
 *
 * The note button and the order type were missing from the till (review: notes
 * are essential for food orders; every bill was dine-in). The rules: a note can
 * change until the kitchen has the ticket — after that it would no longer match
 * what was printed — and the type can change until the bill is closed.
 */
import { describe, expect, it } from 'vitest';

import { DomainError, Order } from '@/domain';

function aBill() {
  const order = Order.create({ number: 'K7-1048' });
  const line = order.addLine({ nameAr: 'عصيدة', unitPriceMinor: 9_000n, qty: 1 });
  return { order, line };
}

describe('a line note', () => {
  it('is written onto the line, trimmed', () => {
    const { order, line } = aBill();
    order.noteLine(line.id, '  بدون شطة ');
    expect(order.toSnapshot().lines[0].modifiersText).toBe('بدون شطة');
  });

  it('can be cleared', () => {
    const { order, line } = aBill();
    order.noteLine(line.id, 'حار');
    order.noteLine(line.id, '');
    expect(order.toSnapshot().lines[0].modifiersText).toBe('');
  });

  it('is limited to what the server stores', () => {
    const { order, line } = aBill();
    expect(() => order.noteLine(line.id, 'x'.repeat(241))).toThrowError(DomainError);
  });

  it('cannot change once the kitchen has the ticket', () => {
    const { order, line } = aBill();
    order.send();
    expect(() => order.noteLine(line.id, 'حار')).toThrowError(
      expect.objectContaining({ code: 'line_note_after_send' }) as DomainError,
    );
  });
});

describe('the order type', () => {
  it('starts as dine-in and can change while the bill is open', () => {
    const { order } = aBill();
    expect(order.type).toBe('dine_in');
    order.setType('takeaway');
    expect(order.toSnapshot().type).toBe('takeaway');
    order.send();
    order.setType('delivery');
    expect(order.type).toBe('delivery');
  });

  it('cannot change once the bill is closed', () => {
    const { order } = aBill();
    order.addPayment({ method: 'cash', amountMinor: 9_000n, tenderedMinor: 9_000n });
    order.close();
    expect(() => order.setType('takeaway')).toThrowError(DomainError);
  });
});
