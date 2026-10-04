/**
 * A line on an order.
 *
 * Name and unit price are **snapshotted at the moment of sale**. Once a line is
 * on an order, a later change to the menu item's price or name never rewrites
 * it — the bill reflects what was agreed when the item was rung up. A voided
 * line is marked, never removed, so the audit trail keeps it.
 */
import { assert, DomainError } from './errors';
import { newId } from './ids';
import type { Money } from './money';

export interface OrderLineSnapshot {
  id: string;
  itemId: string | null;
  nameAr: string;
  nameEn: string;
  unitPriceMinor: Money;
  qty: number;
  modifiersText: string;
  isVoid: boolean;
  voidReason: string;
  /**
   * How many of this line the kitchen has been sent. A voided line counts as
   * zero once its cancellation has gone out. The gap between this and what
   * the bill holds now is the next ticket.
   */
  kitchenQty: number;
}

export interface NewLineInput {
  id?: string;
  itemId?: string | null;
  nameAr: string;
  nameEn?: string;
  unitPriceMinor: Money;
  qty?: number;
  modifiersText?: string;
}

export class OrderLine {
  private constructor(private state: OrderLineSnapshot) {}

  static create(input: NewLineInput): OrderLine {
    const qty = input.qty ?? 1;
    assert(qty >= 1, 'invalid_qty', 'A line needs a quantity of at least one.');
    assert(input.unitPriceMinor >= 0n, 'payment_invalid', 'A line price may not be negative.');
    return new OrderLine({
      id: input.id ?? newId(),
      itemId: input.itemId ?? null,
      nameAr: input.nameAr,
      nameEn: input.nameEn ?? '',
      unitPriceMinor: input.unitPriceMinor,
      qty,
      modifiersText: input.modifiersText ?? '',
      isVoid: false,
      voidReason: '',
      kitchenQty: 0,
    });
  }

  static fromSnapshot(snapshot: OrderLineSnapshot): OrderLine {
    return new OrderLine({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get qty(): number {
    return this.state.qty;
  }

  get isVoid(): boolean {
    return this.state.isVoid;
  }

  get isLive(): boolean {
    return !this.state.isVoid;
  }

  get unitPriceMinor(): Money {
    return this.state.unitPriceMinor;
  }

  get nameAr(): string {
    return this.state.nameAr;
  }

  get modifiersText(): string {
    return this.state.modifiersText;
  }

  /** How many the kitchen has been told about. */
  get kitchenQty(): number {
    return this.state.kitchenQty;
  }

  /** What the next kitchen ticket must say about this line: more (+) or fewer (−). */
  kitchenDelta(): number {
    return (this.state.isVoid ? 0 : this.state.qty) - this.state.kitchenQty;
  }

  /** The kitchen now has this line as it stands. */
  markSentToKitchen(): void {
    this.state.kitchenQty = this.state.isVoid ? 0 : this.state.qty;
  }

  /** A voided line contributes nothing; a live line is price × quantity. */
  lineTotal(): Money {
    if (this.state.isVoid) return 0n;
    return this.state.unitPriceMinor * BigInt(this.state.qty);
  }

  changeQty(qty: number): void {
    assert(qty >= 1, 'invalid_qty', 'A quantity below one is not a quantity — void the line instead.');
    this.state.qty = qty;
  }

  void(reason: string): void {
    this.state.isVoid = true;
    this.state.voidReason = reason;
  }

  setModifiers(text: string): void {
    this.state.modifiersText = text;
  }

  toSnapshot(): OrderLineSnapshot {
    return { ...this.state };
  }
}

export { DomainError };
