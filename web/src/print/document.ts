/**
 * Print documents: a small block model, a renderer to ESC/POS, and the two
 * templates (kitchen ticket, receipt).
 *
 * The block model keeps layout separate from encoding, so a template can be
 * tested on its structure while the renderer is tested on its bytes. A `row` is
 * the receipt's workhorse — a name on the start side, an amount on the end side,
 * justified to the paper width. Direction decides which side is which, so the
 * same template prints correctly in Arabic and English.
 */
import { EscPosBuilder, utf8Encoder, type Align, type Encoder } from './escpos';
import type { KitchenSend, Order, Shift } from '@/domain';

export type PrintBlock =
  | { kind: 'text'; text: string; align?: Align; bold?: boolean; size?: number }
  | { kind: 'row'; primary: string; secondary: string; bold?: boolean }
  | { kind: 'divider' }
  | { kind: 'feed'; lines: number }
  | { kind: 'cut' };

export interface PrintDocument {
  codepage?: number;
  /** Character width of the paper. 48 for 80mm Font A. */
  width: number;
  dir: 'rtl' | 'ltr';
  blocks: PrintBlock[];
}

export interface PrintContext {
  dir: 'rtl' | 'ltr';
  width?: number;
  codepage?: number;
  formatMoney(minor: bigint): string;
  formatQty(qty: number): string;
  formatTime(date: Date): string;
  /** A receipt with only a time on it cannot be filed or disputed. */
  formatDate(date: Date): string;
  now?: Date;
  labels: {
    kitchen: string;
    /** Heads a ticket that only carries changes to an order the kitchen has. */
    kitchenAmend: string;
    /** Marks a line the kitchen should no longer make. */
    kitchenCancelled: string;
    receipt: string;
    order: string;
    table: string;
    subtotal: string;
    discount: string;
    total: string;
    change: string;
    paid: string;
    thanks: string;
    restaurantName: string;
    shiftReport: string;
    expectedCash: string;
    countedCash: string;
    shortfall: string;
    surplus: string;
    orderCount: string;
    varianceReason: string;
    notInDrawer: string;
    invoice: string;
    totalSales: string;
    salesSection: string;
    drawerSection: string;
    cashier: string;
    shift: string;
    signature: string;
    orderType: Record<string, string>;
    paymentMethod: Record<string, string>;
  };
}

// --- layout -----------------------------------------------------------------

function justify(primary: string, secondary: string, width: number, dir: 'rtl' | 'ltr'): string {
  const gap = Math.max(1, width - primary.length - secondary.length);
  const spacer = ' '.repeat(gap);
  // In RTL the start edge is the right, so the primary (name) sits at the right
  // and the secondary (amount) at the left; the printer emits bytes left→right.
  return dir === 'rtl' ? secondary + spacer + primary : primary + spacer + secondary;
}

export function renderDocument(doc: PrintDocument, encoder: Encoder = utf8Encoder): Uint8Array {
  const builder = new EscPosBuilder(encoder).init();
  if (doc.codepage !== undefined) builder.codepage(doc.codepage);

  const startAlign: Align = doc.dir === 'rtl' ? 'right' : 'left';

  for (const block of doc.blocks) {
    switch (block.kind) {
      case 'text':
        builder.align(block.align ?? startAlign);
        if (block.bold) builder.bold(true);
        if (block.size && block.size > 1) builder.size(block.size, block.size);
        builder.line(block.text);
        if (block.size && block.size > 1) builder.size(1, 1);
        if (block.bold) builder.bold(false);
        break;
      case 'row':
        builder.align('left');
        if (block.bold) builder.bold(true);
        builder.line(justify(block.primary, block.secondary, doc.width, doc.dir));
        if (block.bold) builder.bold(false);
        break;
      case 'divider':
        builder.align('left').line('-'.repeat(doc.width));
        break;
      case 'feed':
        builder.feed(block.lines);
        break;
      case 'cut':
        builder.cut();
        break;
    }
  }

  return builder.build();
}

// --- templates --------------------------------------------------------------

function liveLines(order: Order) {
  return order.toSnapshot().lines.filter((line) => !line.isVoid);
}

function orderTypeLabel(order: Order, ctx: PrintContext): string {
  return ctx.labels.orderType[order.type] ?? order.type;
}

/**
 * The kitchen ticket — printed on send, before payment. Quantities and names,
 * no prices. What the kitchen needs and nothing it doesn't.
 */
/** Date and time together — the stamp every printed document needs. */
function printedAt(ctx: PrintContext): string {
  const at = ctx.now ?? new Date();
  return `${ctx.formatDate(at)} ${ctx.formatTime(at)}`;
}

export function buildKitchenTicket(order: Order, ctx: PrintContext, sent?: KitchenSend): PrintDocument {
  const snapshot = order.toSnapshot();
  const amendment = sent?.amendment === true;
  const blocks: PrintBlock[] = [
    { kind: 'text', text: ctx.labels.kitchen, align: 'center', bold: true, size: 2 },
    ...(amendment
      ? [{ kind: 'text', text: ctx.labels.kitchenAmend, align: 'center', bold: true } as PrintBlock]
      : []),
    { kind: 'text', text: `${ctx.labels.order} ${snapshot.number}`, align: 'center' },
    { kind: 'text', text: orderTypeLabel(order, ctx), align: 'center' },
    { kind: 'text', text: ctx.formatTime(ctx.now ?? new Date()), align: 'center' },
    { kind: 'divider' },
  ];

  if (amendment) {
    // Only what changed: a second copy of the whole order is cooked twice.
    for (const change of sent!.changes) {
      const qty = `${ctx.formatQty(Math.abs(change.delta))}× ${change.nameAr}`;
      blocks.push({
        kind: 'text',
        text: change.delta > 0 ? qty : `${ctx.labels.kitchenCancelled}: ${qty}`,
        size: 2,
        bold: change.delta < 0,
      });
      if (change.delta > 0 && change.modifiersText) blocks.push({ kind: 'text', text: `  ${change.modifiersText}` });
    }
  } else {
    for (const line of liveLines(order)) {
      blocks.push({ kind: 'text', text: `${ctx.formatQty(line.qty)}× ${line.nameAr}`, size: 2 });
      if (line.modifiersText) blocks.push({ kind: 'text', text: `  ${line.modifiersText}` });
    }
  }

  // Somewhere for the two people handing over to sign.
  blocks.push({ kind: 'feed', lines: 2 });
  blocks.push({ kind: 'text', text: `${ctx.labels.signature}: ______________________` });
  blocks.push({ kind: 'cut' });
  return { width: ctx.width ?? 48, dir: ctx.dir, codepage: ctx.codepage, blocks };
}

/**
 * The final receipt — printed only once the amount due reaches zero. Full lines
 * with prices, totals, the payments taken, and change due.
 */
export function buildReceipt(order: Order, ctx: PrintContext): PrintDocument {
  const snapshot = order.toSnapshot();
  const blocks: PrintBlock[] = [
    { kind: 'text', text: ctx.labels.restaurantName, align: 'center', bold: true, size: 2 },
    { kind: 'text', text: ctx.labels.invoice, align: 'center' },
    { kind: 'divider' },
    // Number, kind and *when*. The date was missing: a receipt carrying only a
    // time cannot be filed against a day or argued about a week later.
    { kind: 'row', primary: ctx.labels.order, secondary: snapshot.number },
    { kind: 'row', primary: orderTypeLabel(order, ctx), secondary: printedAt(ctx) },
    { kind: 'divider' },
  ];

  for (const line of liveLines(order)) {
    const lineTotal = line.unitPriceMinor * BigInt(line.qty);
    blocks.push({
      kind: 'row',
      primary: `${ctx.formatQty(line.qty)}× ${line.nameAr}`,
      secondary: ctx.formatMoney(lineTotal),
    });
  }

  blocks.push({ kind: 'divider' });
  blocks.push({ kind: 'row', primary: ctx.labels.subtotal, secondary: ctx.formatMoney(order.subtotal()) });
  if (snapshot.discountMinor > 0n) {
    blocks.push({ kind: 'row', primary: ctx.labels.discount, secondary: `-${ctx.formatMoney(snapshot.discountMinor)}` });
  }
  blocks.push({ kind: 'row', primary: ctx.labels.total, secondary: ctx.formatMoney(order.total()), bold: true });

  for (const payment of snapshot.payments) {
    const label = ctx.labels.paymentMethod[payment.method] ?? payment.method;
    blocks.push({ kind: 'row', primary: label, secondary: ctx.formatMoney(payment.amountMinor) });
  }
  if (order.changeDue() > 0n) {
    blocks.push({ kind: 'row', primary: ctx.labels.change, secondary: ctx.formatMoney(order.changeDue()) });
  }

  blocks.push({ kind: 'divider' });
  blocks.push({ kind: 'text', text: ctx.labels.thanks, align: 'center' });
  blocks.push({ kind: 'cut' });

  return { width: ctx.width ?? 48, dir: ctx.dir, codepage: ctx.codepage, blocks };
}


/**
 * The shift's closing report — the Z-report a cashier hands over with the till.
 *
 * It shows every method, not just cash, because that is the difference between
 * a report and an accusation: a drawer short by the exact value of the day's
 * bank transfers is not a missing-money problem, and the person handing over
 * needs the paper to say so.
 */
export function buildShiftReport(shift: Shift, ctx: PrintContext): PrintDocument {
  const totals = shift.totalsByMethod();
  const variance = shift.variance();
  const blocks: PrintBlock[] = [
    { kind: 'text', text: ctx.labels.restaurantName, align: 'center', bold: true, size: 2 },
    { kind: 'text', text: ctx.labels.shiftReport, align: 'center', bold: true },
    { kind: 'text', text: printedAt(ctx), align: 'center' },
    { kind: 'divider' },
    { kind: 'row', primary: ctx.labels.cashier, secondary: shift.cashierName },
    { kind: 'row', primary: ctx.labels.orderCount, secondary: ctx.formatQty(shift.orderCount()) },
    { kind: 'divider' },
    { kind: 'text', text: ctx.labels.salesSection, bold: true },
  ];

  for (const method of ['cash', 'bank', 'wallet', 'credit'] as const) {
    const amount = totals[method];
    if (amount === 0n && method !== 'cash') continue;
    const label = ctx.labels.paymentMethod[method] ?? method;
    blocks.push({
      kind: 'row',
      // Only cash is in the drawer; saying so on the paper stops the other rows
      // being read as money that has gone missing.
      primary: method === 'cash' ? label : `${label} (${ctx.labels.notInDrawer})`,
      secondary: ctx.formatMoney(amount),
    });
  }

  // What the shift actually took, across every method. Without this line the
  // report showed the parts and never the whole: a day paid entirely by bank
  // transfer read as a column of numbers with a zero at the bottom, and nowhere
  // did the paper say what had been sold.
  const takings = totals.cash + totals.bank + totals.wallet + totals.credit;
  blocks.push({ kind: 'divider' });
  blocks.push({ kind: 'row', primary: ctx.labels.totalSales, secondary: ctx.formatMoney(takings), bold: true });

  blocks.push({ kind: 'feed', lines: 1 });
  blocks.push({ kind: 'text', text: ctx.labels.drawerSection, bold: true });
  blocks.push({ kind: 'row', primary: ctx.labels.expectedCash, secondary: ctx.formatMoney(shift.expectedCash()) });
  blocks.push({ kind: 'row', primary: ctx.labels.countedCash, secondary: ctx.formatMoney(shift.countedCash()) });
  if (variance !== 0n) {
    blocks.push({
      kind: 'row',
      primary: variance < 0n ? ctx.labels.shortfall : ctx.labels.surplus,
      secondary: ctx.formatMoney(variance),
      bold: true,
    });
    if (shift.varianceReason.trim() !== '') {
      blocks.push({ kind: 'text', text: `${ctx.labels.varianceReason}: ${shift.varianceReason}` });
    }
  }

  blocks.push({ kind: 'cut' });
  return { width: ctx.width ?? 48, dir: ctx.dir, codepage: ctx.codepage, blocks };
}
