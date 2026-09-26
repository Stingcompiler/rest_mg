/**
 * The multi-cart tabs — the "طاولة ٤ · سفري ١٠٤٧ · طاولة ١ · +" strip.
 *
 * One device holds several open orders at once and switches between them. This
 * is a thin coordinator over `Order`: it owns which orders are on the tab strip
 * and which one is active. It enforces nothing about the orders themselves —
 * each order guards its own rules.
 */
import { assert } from './errors';
import type { Order } from './Order';

export class CartSession {
  private readonly orders = new Map<string, Order>();
  private activeId: string | null = null;

  /** Put a new order on the strip and make it active. */
  open(order: Order): void {
    this.orders.set(order.id, order);
    this.activeId = order.id;
  }

  list(): Order[] {
    return [...this.orders.values()];
  }

  count(): number {
    return this.orders.size;
  }

  active(): Order | null {
    return this.activeId ? (this.orders.get(this.activeId) ?? null) : null;
  }

  switchTo(orderId: string): void {
    assert(this.orders.has(orderId), 'cart_not_found', `No open cart ${orderId}.`);
    this.activeId = orderId;
  }

  /** Park an order — it stays on the strip but is no longer the active one. */
  park(orderId: string): void {
    const order = this.orders.get(orderId);
    assert(order, 'cart_not_found', `No open cart ${orderId}.`);
    order.park();
    if (this.activeId === orderId) {
      this.activeId = this.firstOther(orderId);
    }
  }

  /** Take an order off the strip — once it is closed, paid, or voided. */
  close(orderId: string): void {
    assert(this.orders.has(orderId), 'cart_not_found', `No open cart ${orderId}.`);
    this.orders.delete(orderId);
    if (this.activeId === orderId) {
      this.activeId = this.firstOther(orderId);
    }
  }

  private firstOther(excludeId: string): string | null {
    for (const id of this.orders.keys()) {
      if (id !== excludeId) return id;
    }
    return null;
  }
}
