/**
 * Shifts and the denomination cash count.
 *
 * Like orders, a shift queues for upload only when it closes, and does so in the
 * same transaction that writes it. An open shift lives on the device alone.
 */
import { STORES } from '../schema';
import type { ShiftRecord, ShiftStatus } from '../records';
import { getAll, request, txDone } from '../idb';
import { enqueue } from '../outbox';
import { openDatabase } from '../open';

export class ShiftRepository {
  constructor(private readonly dbName?: string) {}

  private db(): Promise<IDBDatabase> {
    return openDatabase(this.dbName);
  }

  async save(shift: ShiftRecord): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([STORES.shifts, STORES.outbox], 'readwrite');
    tx.objectStore(STORES.shifts).put(shift);
    if (shift.status === 'closed') {
      enqueue(tx, 'shift', shift);
    }
    await txDone(tx);
  }

  async get(id: string): Promise<ShiftRecord | undefined> {
    const db = await this.db();
    const tx = db.transaction(STORES.shifts, 'readonly');
    return request(tx.objectStore(STORES.shifts).get(id) as IDBRequest<ShiftRecord | undefined>);
  }

  async listByStatus(status: ShiftStatus): Promise<ShiftRecord[]> {
    const db = await this.db();
    const tx = db.transaction(STORES.shifts, 'readonly');
    return getAll<ShiftRecord>(tx.objectStore(STORES.shifts).index('status'), status);
  }

  /** The one open shift, if any. There is a single till per device. */
  async activeShift(): Promise<ShiftRecord | undefined> {
    const open = await this.listByStatus('open');
    return open.sort((a, b) => b.openedAt.localeCompare(a.openedAt))[0];
  }

  // `syncedAt` is written by the outbox's `acknowledge` (see orderRepository).
}

export const shiftRepository = new ShiftRepository();
