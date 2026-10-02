/**
 * The sync orchestrator.
 *
 * One run: push the outbox, then pull menu deltas. It is background work and
 * never throws — being offline is the normal case, not an error. A network
 * failure returns `online: false` and leaves everything queued; a run without a
 * device token (an un-enrolled tablet) is skipped cleanly.
 *
 * Nothing here is ever awaited by the UI before it paints. The provider kicks a
 * run on an interval, on reconnect, and after a shift closes, and reads the
 * result only to update the connection indicator and the unsynced count.
 */
import { DB_NAME, SettingsRepository, SETTINGS_KEYS, openDatabase, pendingCount } from '@/db';
import { pushOutbox } from './push';
import { pullMenu } from './pull';
import { HttpSyncTransport, type SyncTransport } from './transport';

export interface SyncResult {
  online: boolean;
  skipped: boolean;
  pushed: number;
  failed: number;
  pulled: number;
  pending: number;
  /**
   * Customer delivery orders waiting to be confirmed, as of this run.
   *
   * Undefined when the run did not reach the server — which is different from
   * an empty array. The till must be able to tell "nobody is waiting" from "I
   * do not know", and show the second as silence rather than as good news.
   */
  pendingDeliveries?: string[];
  error?: string;
}

export interface SyncDeps {
  transport?: SyncTransport;
  dbName?: string;
}

/**
 * One run at a time per database.
 *
 * The interval, a reconnect and a closed shift can all ask for a run at once.
 * Overlapping runs would push the same rows twice and race on their answers. A
 * request made while a run is in flight is folded into a single follow-up run
 * that starts when the current one ends — not dropped, so a bill closed during
 * a run does not wait for the next interval.
 */
interface RunSlot {
  running: Promise<SyncResult> | null;
  queued: Promise<SyncResult> | null;
}

const slots = new Map<string, RunSlot>();

export function runSync(deps: SyncDeps = {}): Promise<SyncResult> {
  const key = deps.dbName ?? DB_NAME;
  let slot = slots.get(key);
  if (!slot) {
    slot = { running: null, queued: null };
    slots.set(key, slot);
  }
  const { running, queued } = slot;
  if (!running) return startRun(slot, key, deps);
  if (queued) return queued;

  const waiting = slot;
  const next = () => {
    waiting.queued = null;
    return startRun(waiting, key, deps);
  };
  const followUp = running.then(next, next);
  waiting.queued = followUp;
  return followUp;
}

function startRun(slot: RunSlot, key: string, deps: SyncDeps): Promise<SyncResult> {
  const run = withDeviceLock(key, () => syncOnce(deps)).finally(() => {
    if (slot.running === run) slot.running = null;
  });
  slot.running = run;
  return run;
}

/**
 * Hold the device-wide sync lock while `work` runs, where the browser offers
 * one. Two tabs of the till share one IndexedDB and would otherwise push the
 * same queue at once. Correctness does not rest on this — an answer settles only
 * the snapshot it was for — it only saves sending everything twice.
 */
function withDeviceLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks) return work();
  return locks.request(`sudanpos-sync:${key}`, work);
}

async function syncOnce(deps: SyncDeps): Promise<SyncResult> {
  const { transport = new HttpSyncTransport(), dbName } = deps;
  const db = await openDatabase(dbName);
  const settings = new SettingsRepository(dbName);
  const token = await settings.get<string>(SETTINGS_KEYS.deviceToken);

  // No device token is not a reason to skip any more: a signed-in cashier's
  // cookies authenticate the sync just as well, and that is the normal case on
  // a tablet nobody has enrolled by hand. If neither is present the server
  // answers 401 and the run reports itself offline, which is honest.

  let pushed = 0;
  let failed = 0;
  let pulled = 0;
  let pendingDeliveries: string[] | undefined;
  try {
    const pushOutcome = await pushOutbox(transport, token ?? '', dbName);
    pushed = pushOutcome.pushed;
    failed = pushOutcome.failed;

    const pullOutcome = await pullMenu(transport, token ?? '', dbName);
    pulled = pullOutcome.applied;
    pendingDeliveries = pullOutcome.pendingDeliveries;
  } catch (error) {
    return {
      online: false,
      skipped: false,
      pushed,
      failed,
      pulled,
      pending: await pendingCount(db),
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    online: true,
    skipped: false,
    pushed,
    failed,
    pulled,
    pending: await pendingCount(db),
    pendingDeliveries,
  };
}

function navigatorOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * Start the background sync loop: a run now, then on an interval and on every
 * reconnect. `onResult` receives each run's outcome so the provider can update
 * the indicator. Returns a stop function.
 */
export function startSyncPump(
  onResult: (result: SyncResult) => void,
  options: { intervalMs?: number; deps?: SyncDeps } = {},
): () => void {
  // Thirty seconds, not sixty. This loop now carries the till's only word from
  // the outside world — that a customer is waiting — and a minute is a long
  // time to leave somebody standing. The run is a small push and a delta pull,
  // so twice as often is still two requests a minute from one till.
  const intervalMs = options.intervalMs ?? 30_000;
  const run = () => {
    void runSync(options.deps).then(onResult).catch((error) => console.error('[sync] run failed', error));
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
