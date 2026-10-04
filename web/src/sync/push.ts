/**
 * Draining the outbox up to the server.
 *
 * The idempotency guarantee lives in the interplay between this and the server:
 * a record is only removed from the outbox once the server has *acknowledged*
 * it — accepted or duplicate, both mean "it's on the server now". If the
 * connection drops before the response arrives, nothing is removed; the next run
 * re-sends the whole batch, the server recognises what it already has by uuid
 * and answers `duplicate`, and those are cleared. A dropped connection mid-batch
 * therefore produces zero duplicate rows on the server.
 *
 * A rejected record (a validation failure) is backed off and kept, so a bad row
 * cannot silently vanish, but it also never blocks the rows behind it.
 *
 * Every answer acts on the snapshot that was sent, not on whatever row now has
 * its id: a bill saved again while the push was out keeps its newer row queued
 * (see `db/outbox.ts`).
 */
import {
  acknowledgeOutboxEntry,
  backoffOutboxEntry,
  discardOutboxEntry,
  dueEntries,
  openDatabase,
  type OutboxRecord,
  type PriceChangeRecord,
} from '@/db';
import { newId } from '@/domain';
import { recordToServerPayload } from './serialize';
import type { PushEnvelope, SyncTransport } from './transport';

export interface PushOutcome {
  pushed: number;
  failed: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Can this record never be accepted, no matter how often it is retried?
 *
 * A price change names a menu item the server must already know. An item id
 * that is not even a UUID cannot exist there, so the record is undeliverable by
 * construction — unlike an order line, where the reference is optional and can
 * simply be dropped. Nothing of value is lost: the price it describes is
 * already applied to a local-only item.
 */
function isUnsendable(entry: OutboxRecord): boolean {
  if (entry.type !== 'price_change' && entry.type !== 'availability') return false;
  const { itemId } = entry.payload as PriceChangeRecord;
  return !itemId || !UUID_PATTERN.test(itemId);
}

export async function pushOutbox(
  transport: SyncTransport,
  token: string,
  dbName?: string,
): Promise<PushOutcome> {
  const db = await openDatabase(dbName);
  const entries = await dueEntries(db);
  if (entries.length === 0) return { pushed: 0, failed: 0 };

  const envelope: PushEnvelope = {
    batch_id: newId(),
    records: entries.map((entry) => ({
      type: entry.type,
      id: entry.recordId,
      updated_at: entry.payload.updatedAt,
      payload: recordToServerPayload(entry.type, entry.payload),
    })),
  };

  // A network failure here throws and is caught by the caller: nothing has been
  // removed, so every record is retried next run.
  const response = await transport.push(token, envelope);

  const byRecordId = new Map(entries.map((entry) => [entry.recordId, entry]));
  const now = response.server_time;

  let pushed = 0;
  let failed = 0;
  let discarded = 0;
  for (const result of response.results) {
    const entry = byRecordId.get(result.id);
    if (!entry) continue;

    if (result.status === 'accepted' || result.status === 'duplicate') {
      // Removes the row and marks the record synced (the per-order badge flips
      // to مُزامن) — unless a newer snapshot replaced it, which stays queued.
      if (await acknowledgeOutboxEntry(db, entry, now)) pushed += 1;
    } else if (isUnsendable(entry)) {
      // A record the server can never accept, however many times it is offered.
      // The clearest case: a price change for a menu item that only ever existed
      // on this device (an early build seeded readable ids, and the server
      // requires a real menu item). Retrying it forever achieves nothing except
      // an ever-growing pile of "rejected" that buries anything real.
      if (await discardOutboxEntry(db, entry)) discarded += 1;
    } else {
      await backoffOutboxEntry(db, entry, JSON.stringify(result.reason ?? 'rejected'));
      failed += 1;
    }
  }

  if (discarded > 0) {
    console.info(`[sync] discarded ${discarded} record(s) the server can never accept`);
  }
  return { pushed, failed };
}
