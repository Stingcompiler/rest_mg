/**
 * The persisted print queue — the heart of phase 8.
 *
 * The rule is *persist before print, always*. A job is written to IndexedDB
 * before the first send is even attempted, so the sequence is:
 *
 *   order saved → job enqueued (durable) → send attempted (background)
 *
 * If the printer is unreachable, the job stays in the queue and is retried with
 * exponential backoff. Killing the printer — or the tablet — mid-order loses
 * nothing, because the receipt bytes are already on disk. Draining is background
 * work: it runs on an interval and on reconnect, and a print failure never
 * propagates to the caller, so it can never block a close.
 */
import { STORES, openDatabase } from '@/db';
import type { PrintDestination, PrintJobRecord, PrintKind } from '@/db';
import { getAll, request, txDone } from '@/db/idb';
import { newId } from '@/domain';
import type { PrintService } from './PrintService';

export interface EnqueueInput {
  orderId: string;
  destination: PrintDestination;
  kind: PrintKind;
  bytes: Uint8Array;
}

/** Persist a job. This is the durable step that must precede any send. */
export async function enqueuePrintJob(input: EnqueueInput, dbName?: string): Promise<PrintJobRecord> {
  const db = await openDatabase(dbName);
  const now = Date.now();
  const record: PrintJobRecord = {
    id: newId(),
    orderId: input.orderId,
    destination: input.destination,
    kind: input.kind,
    bytes: input.bytes,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
  };
  const tx = db.transaction(STORES.printJobs, 'readwrite');
  tx.objectStore(STORES.printJobs).put(record);
  await txDone(tx);
  return record;
}

async function dueJobs(db: IDBDatabase, now: number): Promise<PrintJobRecord[]> {
  const tx = db.transaction(STORES.printJobs, 'readonly');
  const index = tx.objectStore(STORES.printJobs).index('nextAttemptAt');
  const jobs = await getAll<PrintJobRecord>(index, IDBKeyRange.upperBound(now));
  // Oldest first: a receipt should not overtake the kitchen ticket before it.
  return jobs.sort((a, b) => a.createdAt - b.createdAt);
}

async function removeJob(db: IDBDatabase, id: string): Promise<void> {
  const tx = db.transaction(STORES.printJobs, 'readwrite');
  tx.objectStore(STORES.printJobs).delete(id);
  await txDone(tx);
}

async function backoffJob(db: IDBDatabase, job: PrintJobRecord, error: string): Promise<void> {
  const tx = db.transaction(STORES.printJobs, 'readwrite');
  const store = tx.objectStore(STORES.printJobs);
  const current = (await request(store.get(job.id))) as PrintJobRecord | undefined;
  if (current) {
    current.attempts += 1;
    current.lastError = error;
    // 2^n seconds, capped at a minute — a printer usually comes back fast.
    const delaySeconds = Math.min(2 ** current.attempts, 60);
    current.nextAttemptAt = Date.now() + delaySeconds * 1000;
    store.put(current);
  }
  await txDone(tx);
}

export async function pendingPrintJobs(dbName?: string): Promise<number> {
  const db = await openDatabase(dbName);
  const tx = db.transaction(STORES.printJobs, 'readonly');
  return request(tx.objectStore(STORES.printJobs).count());
}

export interface DrainResult {
  printed: number;
  failed: number;
}

/**
 * Attempt every job whose time has come. Successes are removed; failures are
 * backed off. Never throws — the worst case is that everything stays queued for
 * the next run.
 */
export async function drainPrintQueue(
  service: PrintService,
  now: number = Date.now(),
  dbName?: string,
): Promise<DrainResult> {
  const db = await openDatabase(dbName);
  const jobs = await dueJobs(db, now);
  let printed = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await service.send(job.destination, job.bytes);
      await removeJob(db, job.id);
      printed += 1;
    } catch (error) {
      await backoffJob(db, job, error instanceof Error ? error.message : String(error));
      failed += 1;
    }
  }

  return { printed, failed };
}

/**
 * Start the background pump: drain on an interval and whenever the device
 * reconnects. Returns a stop function. Only meaningful in a browser; tests drive
 * `drainPrintQueue` directly.
 */
export function startPrintPump(
  service: PrintService,
  options: { intervalMs?: number } = {},
): () => void {
  const intervalMs = options.intervalMs ?? 15_000;
  const run = () => {
    void drainPrintQueue(service).catch((error) => console.error('[print] drain failed', error));
  };

  run();
  const timer = setInterval(run, intervalMs);
  const onOnline = () => run();
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline);

  return () => {
    clearInterval(timer);
    if (typeof window !== 'undefined') window.removeEventListener('online', onOnline);
  };
}
