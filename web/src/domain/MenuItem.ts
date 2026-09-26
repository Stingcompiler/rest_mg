/**
 * A menu item.
 *
 * Its whole relationship to orders is one-way: an item can be dropped onto an
 * order as a line, and after that a price change here has no reach into that
 * line. That is the guarantee behind "pulled prices apply to the menu, never to
 * an open order" — the order line took a snapshot, and this object cannot touch
 * it.
 */
import { assert } from './errors';
import { newId } from './ids';
import type { Money } from './money';
import { OrderLine, type NewLineInput } from './OrderLine';

export interface MenuItemSnapshot {
  id: string;
  categoryId: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  priceMinor: Money;
  isAvailable: boolean;
  isActive: boolean;
}

export class MenuItem {
  private constructor(private state: MenuItemSnapshot) {}

  static fromSnapshot(snapshot: MenuItemSnapshot): MenuItem {
    return new MenuItem({ ...snapshot });
  }

  get id(): string {
    return this.state.id;
  }

  get priceMinor(): Money {
    return this.state.priceMinor;
  }

  isAvailable(): boolean {
    return this.state.isActive && this.state.isAvailable;
  }

  /** The raw availability flag, independent of active status — for toggling. */
  get availableFlag(): boolean {
    return this.state.isAvailable;
  }

  setAvailable(available: boolean): void {
    this.state.isAvailable = available;
  }

  /** Move to a new absolute price. Returns the previous price for the audit trail. */
  setPrice(newPriceMinor: Money): Money {
    assert(newPriceMinor >= 0n, 'payment_invalid', 'A price may not be negative.');
    const previous = this.state.priceMinor;
    this.state.priceMinor = newPriceMinor;
    return previous;
  }

  /** Raise (or lower) by a percentage, rounded to the nearest minor unit. */
  raisePrice(percent: number): Money {
    const scaled = (this.state.priceMinor * BigInt(Math.round(percent * 100))) / 10_000n;
    return this.setPrice(this.state.priceMinor + scaled);
  }

  /**
   * Snapshot this item onto a new order line. The line copies the name and price
   * as they are now; nothing here can reach back into it afterwards.
   */
  toLine(qty: number, modifiersText = ''): OrderLine {
    const input: NewLineInput = {
      id: newId(),
      itemId: this.state.id,
      nameAr: this.state.nameAr,
      nameEn: this.state.nameEn,
      unitPriceMinor: this.state.priceMinor,
      qty,
      modifiersText,
    };
    return OrderLine.create(input);
  }

  toSnapshot(): MenuItemSnapshot {
    return { ...this.state };
  }
}
