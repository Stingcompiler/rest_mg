/**
 * A second send prints what changed, not the whole order again.
 *
 * Each tap on "send to kitchen" used to print the full ticket, so an added
 * juice arrived as a second copy of the whole order and the kitchen cooked it
 * twice. An amendment ticket says it is one, and lists the additions and the
 * cancellations. Found in the user-experience review (batch 11).
 */
import { describe, expect, it } from 'vitest';

import { Order } from '@/domain';
import { buildKitchenTicket, buildPrintContext } from '../index';

function texts(order: Order, sent?: ReturnType<Order['send']>) {
  const ctx = buildPrintContext('ar', 'western');
  const doc = buildKitchenTicket(order, ctx, sent);
  return {
    ctx,
    lines: doc.blocks.flatMap((block) => (block.kind === 'text' ? [block.text] : [])),
  };
}

describe('the kitchen ticket', () => {
  it('lists every line on the first send', () => {
    const order = Order.create({ number: 'K7-3001' });
    order.addLine({ nameAr: 'كباب', unitPriceMinor: 22_000n, qty: 2 });
    const { ctx, lines } = texts(order, order.send());
    expect(lines).toContain('2× كباب');
    expect(lines).not.toContain(ctx.labels.kitchenAmend);
  });

  it('lists only the changes on a later send, and says it is an amendment', () => {
    const order = Order.create({ number: 'K7-3002' });
    order.addLine({ nameAr: 'كباب', unitPriceMinor: 22_000n, qty: 2 });
    const tea = order.addLine({ nameAr: 'شاي', unitPriceMinor: 2_000n, qty: 1 });
    order.send();
    order.addLine({ nameAr: 'عصير مانجو', unitPriceMinor: 8_000n, qty: 1 });
    order.voidLine(tea.id, 'نفد الصنف');

    const { ctx, lines } = texts(order, order.send());
    expect(lines).toContain(ctx.labels.kitchenAmend);
    expect(lines).toContain('1× عصير مانجو');
    expect(lines).toContain(`${ctx.labels.kitchenCancelled}: 1× شاي`);
    expect(lines.some((line) => line.includes('كباب'))).toBe(false);
  });
});
