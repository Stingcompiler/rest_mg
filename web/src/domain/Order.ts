/**
 * The order aggregate.
 *
 * It owns its lines and payments and guards every rule about how a bill may
 * change and when it may close:
 *
 *   - it cannot close while any amount is still due;
 *   - once closed or void it is history — every mutation is refused, and a
 *     correction is a *new* reversing order, never an edit;
 *   - a discount can never exceed the subtotal;
 *   - over-tender produces change, and the amount due floors at zero;
 *   - a voided line stays on the order as an audit record.
 *
 * All money is bigint minor units, end to end.
 */
import { assert, DomainError } from './errors';
import { newId } from './ids';
import { maxMoney, sumMoney, ZERO, type Money } from './money';
import { OrderLine, type NewLineInput, type OrderLineSnapshot } from './OrderLine';
import { Payment, type NewPaymentInput, type PaymentSnapshot } from './Payment';
import {
  TERMINAL_STATUSES,
  WORKING_STATUSES,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
} from './types';

/** The server stores up to 240 characters of a line's note (modifiers_text). */
const MAX_NOTE_LENGTH = 240;

export interface OrderSnapshot {
  id: string;
  number: string;
  type: OrderType;
  status: OrderStatus;
  tableId: string | null;
  customerId: string | null;
  discountMinor: Money;
  openedAt: string;
  sentAt: string | null;
  closedAt: string | null;
  cashierId: string | null;
  cashierName: string;
  shiftRef: string | null;
  voidReason: string;
  correctsId: string | null;
  lines: OrderLineSnapshot[];
  payments: PaymentSnapshot[];
}

export interface NewOrderInput {
  id?: string;
  number: string;
  type?: OrderType;
  tableId?: string | null;
  customerId?: string | null;
  cashierId?: string | null;
  cashierName?: string;
  shiftRef?: string | null;
  openedAt?: string;
}

export class Order {
  private constructor(
    private state: Omit<OrderSnapshot, 'lines' | 'payments'>,
    private lines: OrderLine[],
    private payments: Payment[],
  ) {}

  static create(input: NewOrderInput): Order {
    return new Order(
      {
        id: input.id ?? newId(),
        number: input.number,
        type: input.type ?? 'dine_in',
        status: 'open',
        tableId: input.tableId ?? null,
        customerId: input.customerId ?? null,
        discountMinor: ZERO,
        openedAt: input.openedAt ?? new Date().toISOString(),
        sentAt: null,
        closedAt: null,
        cashierId: input.cashierId ?? null,
        cashierName: input.cashierName ?? '',
        shiftRef: input.shiftRef ?? null,
        voidReason: '',
        correctsId: null,
      },
      [],
      [],
    );
  }

  static fromSnapshot(snapshot: OrderSnapshot): Order {
    const { lines, payments, ...rest } = snapshot;
    return new Order(
      { ...rest },
      lines.map(OrderLine.fromSnapshot),
      payments.map(Payment.fromSnapshot),
    );
  }

  // --- identity and state ---------------------------------------------------

  get id(): string {
    return this.state.id;
  }

  get status(): OrderStatus {
    return this.state.status;
  }

  get correctsId(): string | null {
    return this.state.correctsId;
  }

  get type(): OrderType {
    return this.state.type;
  }

  canBeModified(): boolean {
    return !TERMINAL_STATUSES.includes(this.state.status);
  }

  private assertMutable(): void {
    assert(
      this.canBeModified(),
      'order_immutable',
      `Order ${this.state.number} is ${this.state.status} and cannot change. A correction is a new order.`,
    );
  }

  private findLine(lineId: string): OrderLine {
    const line = this.lines.find((candidate) => candidate.id === lineId);
    assert(line, 'line_not_found', `No line ${lineId} on order ${this.state.number}.`);
    return line;
  }

  // --- building the bill ----------------------------------------------------

  addLine(input: NewLineInput): OrderLine {
    this.assertMutable();
    const line = OrderLine.create(input);
    this.lines.push(line);
    return line;
  }

  changeQty(lineId: string, qty: number): void {
    this.assertMutable();
    this.findLine(lineId).changeQty(qty);
  }

  /**
   * Remove a line outright — only allowed before the kitchen has seen the order.
   * Once sent, a line is voided (kept as an audit record), never deleted.
   */
  removeLine(lineId: string): void {
    this.assertMutable();
    assert(
      this.state.status !== 'sent',
      'line_sent_must_void',
      'This order has been sent to the kitchen; void the line instead of removing it.',
    );
    this.findLine(lineId);
    this.lines = this.lines.filter((line) => line.id !== lineId);
  }

  voidLine(lineId: string, reason: string): void {
    this.assertMutable();
    this.findLine(lineId).void(reason);
  }

  /**
   * A cook's note on one line ("بدون شطة"). Editable until the kitchen has the
   * ticket: after that the printed ticket and the bill would disagree.
   */
  noteLine(lineId: string, note: string): void {
    this.assertMutable();
    assert(
      this.state.status !== 'sent',
      'line_note_after_send',
      'The kitchen already has this ticket; a new note would not reach it.',
    );
    const text = note.trim();
    assert(text.length <= MAX_NOTE_LENGTH, 'line_note_too_long', `A note is at most ${MAX_NOTE_LENGTH} characters.`);
    this.findLine(lineId).setModifiers(text);
  }

  /** Dine-in, takeaway or delivery — changeable until the bill is closed. */
  setType(type: OrderType): void {
    this.assertMutable();
    this.state.type = type;
  }

  /**
   * Bind this order to the shift whose drawer its money lands in.
   *
   * The shift is stamped when the order is *created*, which is a moment too
   * early: a till still loading has no shift yet, so the first order of the day
   * could be written with none at all — and an order with no shift can never be
   * counted into any drawer. Its cash simply disappears from the close.
   *
   * Closing is when the money actually arrives, so that is when the binding has
   * to be right.
   */
  attachToShift(shiftId: string): void {
    this.assertMutable();
    this.state.shiftRef = shiftId;
  }

  applyDiscount(amountMinor: Money): void {
    this.assertMutable();
    assert(amountMinor >= 0n, 'invalid_discount', 'A discount may not be negative.');
    assert(
      amountMinor <= this.subtotal(),
      'discount_exceeds_subtotal',
      'A discount cannot be larger than the bill it discounts.',
    );
    this.state.discountMinor = amountMinor;
  }

  addPayment(input: NewPaymentInput): Payment {
    this.assertMutable();
    const payment = Payment.create(input);
    this.payments.push(payment);
    return payment;
  }

  // --- money ----------------------------------------------------------------

  subtotal(): Money {
    return sumMoney(this.lines.map((line) => line.lineTotal()));
  }

  total(): Money {
    return maxMoney(this.subtotal() - this.state.discountMinor, ZERO);
  }

  amountPaid(): Money {
    return sumMoney(this.payments.map((payment) => payment.amountMinor));
  }

  amountDue(): Money {
    return maxMoney(this.total() - this.amountPaid(), ZERO);
  }

  /** What goes back to the customer — over-tender across all payments. */
  changeDue(): Money {
    return sumMoney(this.payments.map((payment) => payment.changeMinor));
  }

  /** What this order put in the drawer. Credit contributes nothing. */
  /**
   * What this order took, split by how it was paid.
   *
   * The drawer only ever holds the cash row; the rest is here because a shift
   * cannot be closed honestly without it. A cashier looking at a shortfall has
   * to be able to see that the money went to the bank or is owed on credit,
   * rather than being asked to explain a hole that was never a hole.
   */
  paymentTotals(): Record<PaymentMethod, Money> {
    const totals: Record<PaymentMethod, Money> = { cash: 0n, bank: 0n, wallet: 0n, credit: 0n };
    for (const payment of this.payments) {
      totals[payment.method] += payment.amountMinor;
    }
    return totals;
  }

  cashTakenMinor(): Money {
    return sumMoney(
      this.payments.filter((payment) => payment.countsTowardExpectedCash()).map((p) => p.amountMinor),
    );
  }

  itemCount(): number {
    return this.lines.filter((line) => line.isLive).reduce((sum, line) => sum + line.qty, 0);
  }

  // --- lifecycle ------------------------------------------------------------

  park(): void {
    this.assertMutable();
    this.state.status = 'parked';
  }

  resume(): void {
    assert(this.state.status === 'parked', 'order_immutable', 'Only a parked order can be resumed.');
    this.state.status = 'open';
  }

  send(at: string = new Date().toISOString()): void {
    this.assertMutable();
    assert(this.lines.some((line) => line.isLive), 'empty_order', 'There is nothing to send.');
    this.state.status = 'sent';
    this.state.sentAt = at;
  }

  canClose(): boolean {
    return this.canBeModified() && this.amountDue() === ZERO && this.lines.some((l) => l.isLive);
  }

  close(at: string = new Date().toISOString()): void {
    this.assertMutable();
    assert(this.lines.some((line) => line.isLive), 'empty_order', 'An empty order cannot be closed.');
    assert(
      this.amountDue() === ZERO,
      'amount_due',
      'An order cannot close while an amount is still due.',
    );
    this.state.status = 'closed';
    this.state.closedAt = at;
  }

  void(reason: string, at: string = new Date().toISOString()): void {
    assert(
      this.state.status !== 'closed',
      'order_immutable',
      'A closed order is history; reverse it with a new order rather than voiding it.',
    );
    this.assertMutable();
    this.state.status = 'void';
    this.state.voidReason = reason;
    this.state.closedAt = at;
  }

  /**
   * Split lines off into a new order — the "تقسيم" action. The named lines move
   * to a fresh open order; payments stay with the original.
   */
  split(lineIds: string[], input: { id?: string; number: string }): Order {
    this.assertMutable();
    assert(lineIds.length > 0, 'nothing_to_split', 'Choose at least one line to split off.');
    const moving = lineIds.map((lineId) => this.findLine(lineId));

    const child = Order.create({
      id: input.id,
      number: input.number,
      type: this.state.type,
      tableId: this.state.tableId,
      cashierId: this.state.cashierId,
      cashierName: this.state.cashierName,
      shiftRef: this.state.shiftRef,
    });
    for (const line of moving) child.adopt(line);

    const movedIds = new Set(lineIds);
    this.lines = this.lines.filter((line) => !movedIds.has(line.id));
    return child;
  }

  private adopt(line: OrderLine): void {
    this.lines.push(line);
  }

  /**
   * A reversing correction of a closed order: a brand-new order that points back
   * at the original. The original is never touched — this is how the system
   * corrects history without editing it.
   */
  static reverse(original: Order, input: { id?: string; number: string }): Order {
    assert(
      original.status === 'closed',
      'order_immutable',
      'Only a closed order is corrected by reversal.',
    );
    const reversal = new Order(
      {
        ...original.state,
        id: input.id ?? newId(),
        number: input.number,
        status: 'open',
        sentAt: null,
        closedAt: null,
        voidReason: '',
        correctsId: original.id,
      },
      original.lines.map((line) => OrderLine.fromSnapshot(line.toSnapshot())),
      [],
    );
    return reversal;
  }

  toSnapshot(): OrderSnapshot {
    return {
      ...this.state,
      lines: this.lines.map((line) => line.toSnapshot()),
      payments: this.payments.map((payment) => payment.toSnapshot()),
    };
  }
}

export { DomainError, WORKING_STATUSES };
