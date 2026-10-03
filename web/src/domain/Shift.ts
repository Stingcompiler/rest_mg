/**
 * A cashier's shift.
 *
 * Two rules block the close, and the screen has to say which one is biting:
 *   - the shift cannot close while any order is still open, and
 *   - a cash variance beyond tolerance cannot close without a written reason.
 *
 * Expected cash is the opening float plus every cash payment; credit (آجل) is
 * pointedly excluded — a customer's outstanding balance is not money in the
 * drawer, and the shift report says so. The tolerance is expressed in basis
 * points so the whole calculation stays in bigint.
 */
import { assert, DomainError } from './errors';
import { newId } from './ids';
import { absMoney, sumMoney, ZERO, type Money } from './money';
import { CashCount, type CashCountSnapshot } from './CashCount';
import type { Order } from './Order';
import { WORKING_STATUSES, type PaymentMethod, type ShiftStatus } from './types';

export type ShiftBlockingReason = 'open_orders' | 'unexplained_variance';

/** 100 basis points = 1% of expected cash (see docs/PLAN.md phase 0.1). */
const DEFAULT_TOLERANCE_BPS = 100n;

export interface ShiftSnapshot {
  id: string;
  name: string;
  status: ShiftStatus;
  cashierId: string | null;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloatMinor: Money;
  varianceReason: string;
  counts: CashCountSnapshot[];
}

export interface NewShiftInput {
  id?: string;
  name?: string;
  cashierId?: string | null;
  cashierName?: string;
  openingFloatMinor?: Money;
  openedAt?: string;
  toleranceBps?: bigint;
}

export class Shift {
  private readonly orders: Order[] = [];
  private counts: CashCount[] = [];

  private constructor(
    private state: Omit<ShiftSnapshot, 'counts'>,
    private readonly toleranceBps: bigint,
  ) {}

  static open(input: NewShiftInput = {}): Shift {
    return new Shift(
      {
        id: input.id ?? newId(),
        name: input.name ?? '',
        status: 'open',
        cashierId: input.cashierId ?? null,
        cashierName: input.cashierName ?? '',
        openedAt: input.openedAt ?? new Date().toISOString(),
        closedAt: null,
        openingFloatMinor: input.openingFloatMinor ?? ZERO,
        varianceReason: '',
      },
      input.toleranceBps ?? DEFAULT_TOLERANCE_BPS,
    );
  }

  static fromSnapshot(snapshot: ShiftSnapshot, toleranceBps: bigint = DEFAULT_TOLERANCE_BPS): Shift {
    const { counts, ...rest } = snapshot;
    const shift = new Shift({ ...rest }, toleranceBps);
    // Closed orders are re-attached by the caller so expected cash is correct
    // after a reload; the snapshot carries only the counted rows.
    shift.counts = counts.map((count) => CashCount.fromSnapshot(count));
    return shift;
  }

  get id(): string {
    return this.state.id;
  }

  /** Whose shift this is — the name that belongs at the top of the report. */
  get cashierName(): string {
    return this.state.cashierName;
  }

  get status(): ShiftStatus {
    return this.state.status;
  }

  addOrder(order: Order): void {
    this.orders.push(order);
  }

  setCounts(counts: CashCount[]): void {
    this.counts = [...counts];
  }

  /** Record the reason for a variance so the close is no longer blocked. */
  setVarianceReason(reason: string): void {
    this.state.varianceReason = reason;
  }

  get varianceReason(): string {
    return this.state.varianceReason;
  }

  // --- money ----------------------------------------------------------------

  expectedCash(): Money {
    const cashTaken = sumMoney(this.orders.map((order) => order.cashTakenMinor()));
    return this.state.openingFloatMinor + cashTaken;
  }

  /**
   * Everything the shift took, split by how it was paid.
   *
   * Only the cash row belongs in the drawer. The others are here so a cashier
   * facing a shortfall can see where the money actually went — a shift closed
   * against expected cash alone tells you a number is wrong without ever
   * telling you why.
   */
  totalsByMethod(): Record<PaymentMethod, Money> {
    const totals: Record<PaymentMethod, Money> = { cash: 0n, bank: 0n, wallet: 0n, credit: 0n };
    for (const order of this.orders) {
      const each = order.paymentTotals();
      totals.cash += each.cash;
      totals.bank += each.bank;
      totals.wallet += each.wallet;
      totals.credit += each.credit;
    }
    return totals;
  }

  /** How many bills the shift closed — the count on the printed report. */
  orderCount(): number {
    return this.orders.length;
  }

  countedCash(): Money {
    return sumMoney(this.counts.map((count) => count.lineTotal()));
  }

  /** Counted minus expected. Negative is a shortfall, as the mockup shows. */
  variance(): Money {
    return this.countedCash() - this.expectedCash();
  }

  toleranceMinor(): Money {
    return (absMoney(this.expectedCash()) * this.toleranceBps) / 10_000n;
  }

  // --- closing --------------------------------------------------------------

  /**
   * The shift holds the bills it closed; the bills still open live on the till.
   * The caller passes how many there are — the device's storage is the only
   * place that knows — and any one of them blocks the close.
   */
  hasOpenOrders(openOrderCount = 0): boolean {
    return openOrderCount > 0 || this.orders.some((order) => WORKING_STATUSES.includes(order.status));
  }

  needsVarianceReason(): boolean {
    return absMoney(this.variance()) > this.toleranceMinor();
  }

  /** Why this shift cannot close yet. Empty means it can. */
  blockingReasons(openOrderCount = 0): ShiftBlockingReason[] {
    const reasons: ShiftBlockingReason[] = [];
    if (this.hasOpenOrders(openOrderCount)) reasons.push('open_orders');
    if (this.needsVarianceReason() && this.state.varianceReason.trim() === '') {
      reasons.push('unexplained_variance');
    }
    return reasons;
  }

  canClose(openOrderCount = 0): boolean {
    return this.state.status === 'open' && this.blockingReasons(openOrderCount).length === 0;
  }

  close(input: { reason?: string; at?: string; openOrderCount?: number } = {}): void {
    assert(this.state.status === 'open', 'shift_already_closed', 'This shift is already closed.');
    if (input.reason !== undefined) this.state.varianceReason = input.reason;

    const [firstBlock] = this.blockingReasons(input.openOrderCount ?? 0);
    if (firstBlock === 'open_orders') {
      throw new DomainError('shift_open_orders', 'Close every order before closing the shift.');
    }
    if (firstBlock === 'unexplained_variance') {
      throw new DomainError(
        'shift_variance_needs_reason',
        'A cash variance beyond tolerance needs a written reason before the shift can close.',
      );
    }

    this.state.status = 'closed';
    this.state.closedAt = input.at ?? new Date().toISOString();
  }

  toSnapshot(): ShiftSnapshot {
    return { ...this.state, counts: this.counts.map((count) => count.toSnapshot()) };
  }
}
