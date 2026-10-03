/**
 * Orders — the device's working set and its most important write path.
 *
 * `save` is the invariant that matters: an order and, when it reaches a terminal
 * state, its outbox entry are written in one transaction. Either both land or
 * neither does. A closed order that was never queued for sync cannot exist.
 */
import { STORES } from '../schema';
import type { OrderRecord, OrderStatus } from '../records';
import { getAll, request, txDone } from '../idb';
import { enqueue } from '../outbox';
import { openDatabase } from '../open';

/**
 * Which orders travel to the server. `sent` is here because the kitchen display
 * runs on its own device and can only show a ticket the server knows about; the
 * order is pushed again when it closes, and the server lets a live order
 * progress. Orders still on the cashier's screen (open, parked) stay local.
 */
const PUSHABLE: ReadonlySet<OrderStatus> = new Set(['sent', 'closed', 'void']);
const WORKING: readonly OrderStatus[] = ['open', 'parked', 'sent'];

function withItemCount(order: OrderRecord): OrderRecord {
  const itemCount = order.lines
    .filter((line) => !line.isVoid)
    .reduce((sum, line) => sum + line.qty, 0);
  return { ...order, itemCount };
}

export class OrderRepository {
  constructor(private readonly dbName?: string) {}

  private db(): Promise<IDBDatabase> {
    return openDatabase(this.dbName);
  }

  /**
   * Persist an order. When it is bound for the server (sent, closed, void), the
   * same transaction queues it for upload — the atomic write the whole offline
   * contract rests on.
   */
  async save(order: OrderRecord): Promise<void> {
    const db = await this.db();
    const record = withItemCount(order);
    const tx = db.transaction([STORES.orders, STORES.outbox], 'readwrite');
    tx.objectStore(STORES.orders).put(record);
    if (PUSHABLE.has(record.status)) {
      enqueue(tx, 'order', record);
    }
    await txDone(tx);
  }

  /**
   * Take a copy of an order the server already has — a website order brought to
   * the till to be paid. Not queued for sync: the server hears back only when the
   * bill closes, through `save`. A copy the till already holds is left alone, so
   * taking it twice never discards a payment in progress.
   */
  async adopt(order: OrderRecord): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORES.orders, 'readwrite');
    const store = tx.objectStore(STORES.orders);
    const held = (await request(store.get(order.id))) as OrderRecord | undefined;
    if (!held) store.put(withItemCount(order));
    await txDone(tx);
  }

  async get(id: string): Promise<OrderRecord | undefined> {
    const db = await this.db();
    const tx = db.transaction(STORES.orders, 'readonly');
    return request(tx.objectStore(STORES.orders).get(id) as IDBRequest<OrderRecord | undefined>);
  }

  async listByStatus(status: OrderStatus): Promise<OrderRecord[]> {
    const db = await this.db();
    const tx = db.transaction(STORES.orders, 'readonly');
    const index = tx.objectStore(STORES.orders).index('status');
    return getAll<OrderRecord>(index, status);
  }

  /** Everything still on the floor: the open-orders screen. */
  async listOpen(): Promise<OrderRecord[]> {
    const byStatus = await Promise.all(WORKING.map((status) => this.listByStatus(status)));
    return byStatus.flat().sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  }

  // `syncedAt` is written by the outbox's `acknowledge`, in the same transaction
  // that removes the queue row and only for the snapshot the server answered.
}

export const orderRepository = new OrderRepository();
