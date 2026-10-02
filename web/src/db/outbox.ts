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
 *
 * Because the row is overwritten, a row can change while a push of it is still
 * out: a `sent` order is closed and paid before the server answers. Each enqueue
 * therefore stamps a fresh `version`, and everything that acts on an answer —
 * acknowledge, discard, backoff — touches the row only if it is still the
 * snapshot that was sent. A newer one stays queued, due now.
 */
import { newId } from '@/domain';
import { STORES } from './schema';
import type {
  OrderRecord,
  OutboxRecord,
  PriceChangeRecord,
  ShiftRecord,
  SyncableType,
} from './records';
import { getAll, request, txDone } from './idb';

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
    version: newId(),
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

/** Is the queued row still the snapshot that was sent? */
function isSentSnapshot(current: OutboxRecord | undefined, sent: OutboxRecord): current is OutboxRecord {
  return current !== undefined && current.version === sent.version;
}

/** The store holding the record an entry was queued for, when it tracks `syncedAt`. */
const SOURCE_STORES: Partial<Record<SyncableType, string>> = {
  order: STORES.orders,
  shift: STORES.shifts,
};

/**
 * Settle an entry the server has accepted (or reported a duplicate): remove it
 * and mark its record synced, in one transaction — but only if the row is still
 * the snapshot that was sent.
 *
 * Returns false when a newer snapshot replaced it while the push was out. That
 * one stays queued, due now, and its record stays unsynced until its own answer.
 */
export async function acknowledge(db: IDBDatabase, sent: OutboxRecord, syncedAt: string): Promise<boolean> {
  const source = SOURCE_STORES[sent.type];
  const tx = db.transaction(source ? [STORES.outbox, source] : [STORES.outbox], 'readwrite');
  const outbox = tx.objectStore(STORES.outbox);
  const current = (await request(outbox.get(sent.id))) as OutboxRecord | undefined;
  const settled = isSentSnapshot(current, sent);
  if (settled) {
    outbox.delete(sent.id);
    if (source) {
      const store = tx.objectStore(source);
      const record = (await request(store.get(sent.recordId))) as { syncedAt: string | null } | undefined;
      if (record) {
        record.syncedAt = syncedAt;
        store.put(record);
      }
    }
  }
  await txDone(tx);
  return settled;
}

/** Drop an entry the server can never accept — unless a newer snapshot replaced it. */
export async function discard(db: IDBDatabase, sent: OutboxRecord): Promise<boolean> {
  const tx = db.transaction(STORES.outbox, 'readwrite');
  const store = tx.objectStore(STORES.outbox);
  const current = (await request(store.get(sent.id))) as OutboxRecord | undefined;
  const dropped = isSentSnapshot(current, sent);
  if (dropped) store.delete(sent.id);
  await txDone(tx);
  return dropped;
}

/**
 * Record a failed attempt and push the next try out with exponential backoff.
 *
 * A refusal of a snapshot that has since been replaced says nothing about the
 * replacement, so that row is left as it is: due now, with no error against it.
 */
export async function backoff(db: IDBDatabase, sent: OutboxRecord, error: string): Promise<void> {
  const tx = db.transaction(STORES.outbox, 'readwrite');
  const store = tx.objectStore(STORES.outbox);
  const entry = (await request(store.get(sent.id))) as OutboxRecord | undefined;
  if (!isSentSnapshot(entry, sent)) return;
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
