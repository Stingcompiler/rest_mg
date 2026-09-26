import { describe, expect, it } from 'vitest';

import { EscPosBuilder } from '../escpos';
import {
  buildKitchenTicket,
  buildReceipt,
  buildShiftReport,
  renderDocument,
  type PrintContext,
} from '../document';
import { Order, Shift } from '@/domain';

const ESC = 0x1b;
const GS = 0x1d;

function ctx(dir: 'rtl' | 'ltr' = 'rtl'): PrintContext {
  return {
    dir,
    width: 32,
    formatMoney: (minor) => minor.toString(),
    formatQty: (qty) => qty.toString(),
    formatTime: () => '14:32',
    formatDate: () => '2026-08-07',
    now: new Date('2026-08-07T12:32:00Z'),
    labels: {
      kitchen: 'KITCHEN',
      receipt: 'WISAM',
      order: 'ORDER',
      table: 'TABLE',
      subtotal: 'SUBTOTAL',
      discount: 'DISCOUNT',
      total: 'TOTAL',
      change: 'CHANGE',
      paid: 'PAID',
      thanks: 'THANKS',
      restaurantName: 'WISAM',
      shiftReport: 'SHIFT REPORT',
      expectedCash: 'EXPECTED',
      countedCash: 'COUNTED',
      shortfall: 'SHORT',
      surplus: 'OVER',
      orderCount: 'BILLS',
      varianceReason: 'REASON',
      notInDrawer: 'not in drawer',
      invoice: 'INVOICE',
      totalSales: 'TOTAL SALES',
      salesSection: 'SALES',
      drawerSection: 'DRAWER',
      cashier: 'CASHIER',
      shift: 'SHIFT',
      signature: 'SIGNATURE',
      orderType: { dine_in: 'DINE', takeaway: 'TAKE', delivery: 'DELIVERY' },
      paymentMethod: { cash: 'CASH', bank: 'BANK', wallet: 'WALLET', credit: 'CREDIT' },
    },
  };
}

describe('EscPosBuilder', () => {
  it('emits an init, text, and a cut', () => {
    const bytes = new EscPosBuilder().init().align('center').text('Hi').cut().build();
    // Starts with ESC @.
    expect(bytes[0]).toBe(ESC);
    expect(bytes[1]).toBe(0x40);
    // Contains a GS V cut command.
    const hasCut = bytes.some((_, i) => bytes[i] === GS && bytes[i + 1] === 0x56);
    expect(hasCut).toBe(true);
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('is deterministic — the same document yields the same bytes', () => {
    const make = () => new EscPosBuilder().init().bold(true).text('x').bold(false).build();
    expect(Array.from(make())).toEqual(Array.from(make()));
  });
});

function sampleOrder(): Order {
  const order = Order.create({ number: '1048' });
  order.addLine({ nameAr: 'شاورما لحم', unitPriceMinor: 12_500n, qty: 2 });
  order.addPayment({ method: 'cash', amountMinor: 25_000n, tenderedMinor: 30_000n });
  return order;
}

describe('kitchen ticket', () => {
  it('lists quantities and names but never a price', () => {
    const doc = buildKitchenTicket(sampleOrder(), ctx());
    const texts = doc.blocks.flatMap((block) => (block.kind === 'text' ? [block.text] : []));
    expect(texts).toContain('KITCHEN');
    expect(texts.some((t) => t.includes('شاورما لحم'))).toBe(true);
    // No row blocks (rows carry prices); the kitchen sees none.
    expect(doc.blocks.some((block) => block.kind === 'row')).toBe(false);
    expect(doc.blocks.at(-1)).toEqual({ kind: 'cut' });
  });
});

describe('receipt', () => {
  it('carries lines, totals, payments and change', () => {
    const doc = buildReceipt(sampleOrder(), ctx());
    const rows = doc.blocks.flatMap((block) => (block.kind === 'row' ? [block] : []));
    const find = (primary: string) => rows.find((row) => row.primary === primary);

    expect(find('TOTAL')?.secondary).toBe('25000');
    expect(find('CASH')?.secondary).toBe('25000');
    expect(find('CHANGE')?.secondary).toBe('5000'); // over-tendered 30,000
  });

  it('justifies a row to the paper width, mirrored by direction', () => {
    const rtl = renderDocument(buildReceipt(sampleOrder(), ctx('rtl')));
    const ltr = renderDocument(buildReceipt(sampleOrder(), ctx('ltr')));
    // Both render; the ordering of primary/secondary differs by direction, so
    // the byte streams are not identical.
    expect(Array.from(rtl)).not.toEqual(Array.from(ltr));
  });
});


describe('the printed documents carry what a paper record needs', () => {
  const rows = (doc: ReturnType<typeof buildReceipt>) =>
    doc.blocks.flatMap((block) => (block.kind === 'row' ? [block] : []));
  const texts = (doc: ReturnType<typeof buildReceipt>) =>
    doc.blocks.flatMap((block) => (block.kind === 'text' ? [block.text] : []));

  it('stamps the invoice with a date, not only a time', () => {
    // A receipt carrying "15:49" and nothing else cannot be filed against a day
    // or argued about a week later.
    const doc = buildReceipt(sampleOrder(), ctx());
    const stamped = rows(doc).some((row) => row.secondary.includes('2026-08-07'));
    expect(stamped).toBe(true);
  });

  it('names the order and its kind on the invoice', () => {
    const doc = buildReceipt(sampleOrder(), ctx());
    expect(rows(doc).find((row) => row.primary === 'ORDER')?.secondary).toBe('1048');
    expect(texts(doc)).toContain('INVOICE');
  });

  it('states the total takings on the shift report', () => {
    // The report used to show each method and then expected cash. A day paid
    // entirely by bank transfer read as a column of numbers ending in zero,
    // and nowhere did the paper say what had been sold.
    const order = Order.create({ number: '5001' });
    order.addLine({ nameAr: 'x', unitPriceMinor: 31_000n, qty: 1 });
    order.addPayment({ method: 'bank', amountMinor: 31_000n, reference: 'REF' });
    order.close();

    const shift = Shift.open({ openingFloatMinor: 0n, cashierName: 'عمر' });
    shift.addOrder(order);

    const doc = buildShiftReport(shift, ctx());
    const find = (primary: string) => rows(doc).find((row) => row.primary === primary);

    expect(find('TOTAL SALES')?.secondary).toBe('31000');
    // And the drawer is still honestly zero — bank money was never in it.
    expect(find('EXPECTED')?.secondary).toBe('0');
    expect(find('CASHIER')?.secondary).toBe('عمر');
  });

  it('marks every non-cash row as not being in the drawer', () => {
    const order = Order.create({ number: '5002' });
    order.addLine({ nameAr: 'x', unitPriceMinor: 10_000n, qty: 1 });
    order.addPayment({ method: 'wallet', amountMinor: 10_000n, reference: 'W1' });
    order.close();
    const shift = Shift.open({ openingFloatMinor: 0n });
    shift.addOrder(order);

    const doc = buildShiftReport(shift, ctx());
    const wallet = rows(doc).find((row) => row.primary.startsWith('WALLET'));
    expect(wallet?.primary).toContain('not in drawer');
  });
});
