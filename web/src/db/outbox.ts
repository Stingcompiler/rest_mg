/**
 * The upload queue.
 *
 * Every terminal record — a closed or void order, a closed shift, a price change
 * — is enqueued in the *same transaction* that writes the record itself. That
 * atomicity is the whole point: the device can crash between the two writes and
 * still never end up with a closed order that was never queued to sync, nor a
 * queue entry for an order that was never saved.
 *
 * The outbox id is `${type}:${recordId}` — deterministic. Saving the same order
 * twice overwrites its one queue row instead of adding a second, so the queue is
 * idempotent by construction, the same way the server is idempotent by uuid.
 */
import { STORES } from './schema';
import type {
  OrderRecord,
  OutboxRecord,
  PriceChangeRecord,
  ShiftRecord,
  SyncableType,
} from './records';
import { getAll, request } from './idb';

type SyncablePayload = OrderRecord | ShiftRecord | PriceChangeRecord;

export function outboxId(type: SyncableType, recordId: string): string {
  return `${type}:${recordId}`;
}

/**
 * Queue a record for upload, using a transaction the caller already opened over
 * (at least) the outbox store. It takes no transaction of its own on purpose:
 * the enqueue must share the record's write so the two commit together.
 */
export function enqueue(tx: IDBTransaction, type: SyncableType, payload: SyncablePayload): void {
  const entry: OutboxRecord = {
    id: outboxId(type, payload.id),
    type,
    recordId: payload.id,
    payload,
    attempts: 0,
    nextAttemptAt: Date.now(),
    createdAt: Date.now(),
    lastError: null,
  };
  tx.objectStore(STORES.outbox).put(entry);
}

/** Rows whose next-attempt time has arrived, oldest first, for the sync engine. */
export async function dueEntries(db: IDBDatabase, now: number = Date.now(), limit = 500): Promise<OutboxRecord[]> {
  const tx = db.transaction(STORES.outbox, 'readonly');
  const index = tx.objectStore(STORES.outbox).index('nextAttemptAt');
  const all = await getAll<OutboxRecord>(index, IDBKeyRange.upperBound(now));
  return all.slice(0, limit);
}

/** Remove an entry once the server has accepted it (or reported a duplicate). */
export async function remove(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction(STORES.outbox, 'readwrite');
  tx.objectStore(STORES.outbox).delete(id);
  await request(tx.objectStore(STORES.outbox).count());
}

/** Record a failed attempt and push the next try out with exponential backoff. */
export async function backoff(db: IDBDatabase, id: string, error: string): Promise<void> {
  const tx = db.transaction(STORES.outbox, 'readwrite');
  const store = tx.objectStore(STORES.outbox);
  const entry = (await request(store.get(id))) as OutboxRecord | undefined;
  if (!entry) return;
  entry.attempts += 1;
  entry.lastError = error;
  // 2^n seconds, capped at five minutes — long enough to ride out an outage,
  // short enough that a reconnect drains quickly.
  const delaySeconds = Math.min(2 ** entry.attempts, 300);
  entry.nextAttemptAt = Date.now() + delaySeconds * 1000;
  store.put(entry);
  await request(store.count());
}

/**
 * Entries the server has actively refused, as opposed to ones simply waiting
 * for a network.
 *
 * The two look identical from outside — both are "not synced yet" — but they
 * need opposite responses: one clears itself when the line comes back, the
 * other never will and someone has to be told. A rejection was recorded in
 * `lastError` and then never surfaced anywhere, which is how a device could
 * fail to sync a single bill for days without a word.
 */
export async function rejectedEntries(db: IDBDatabase): Promise<OutboxRecord[]> {
  const tx = db.transaction(STORES.outbox, 'readonly');
  const all = await getAll<OutboxRecord>(tx.objectStore(STORES.outbox));
  return all.filter((entry) => entry.lastError !== null);
}

/** Everything still queued — due now or waiting out a backoff. */
export async function allEntries(db: IDBDatabase): Promise<OutboxRecord[]> {
  const tx = db.transaction(STORES.outbox, 'readonly');
  const all = await getAll<OutboxRecord>(tx.objectStore(STORES.outbox));
  // Oldest first: the order they were taken in is the order they should land.
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Make queued records due immediately.
 *
 * A record that has failed a few times is pushed minutes into the future by the
 * backoff, which is right for an outage and wrong for someone standing at the
 * till who has just fixed the problem and wants to see it go. Clearing the
 * schedule (and the stale error) is what "try again now" means; the next run
 * picks them up.
 *
 * Returns how many were rescheduled.
 */
export async function retryNow(db: IDBDatabase, ids?: string[]): Promise<number> {
  const tx = db.transaction(STORES.outbox, 'readwrite');
  const store = tx.objectStore(STORES.outbox);
  const all = await getAll<OutboxRecord>(store);
  const wanted = ids ? new Set(ids) : null;
  let rescheduled = 0;
  for (const entry of all) {
    if (wanted && !wanted.has(entry.id)) continue;
    store.put({ ...entry, nextAttemptAt: 0, lastError: null });
    rescheduled += 1;
  }
  await request(store.count());
  return rescheduled;
}

export async function pendingCount(db: IDBDatabase): Promise<number> {
  const tx = db.transaction(STORES.outbox, 'readonly');
  return request(tx.objectStore(STORES.outbox).count());
}
