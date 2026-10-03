/**
 * The outbox while a push is in flight.
 *
 * The queue keeps one row per record and overwrites it on every save. An answer
 * for the snapshot that was sent must settle that snapshot only: when the bill
 * changed while the request was out — a `sent` order closed and paid — the newer
 * row has to stay queued, or the payment never reaches the server while the till
 * shows the bill as synced. Found by the review (F01).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { anOrder, freshDbName } from '@/db/__tests__/fixtures';
import { OrderRepository, allOutboxEntries, openDatabase, pendingCount } from '@/db';
import { pushOutbox } from '../push';
import { runSync } from '../engine';
import type { PullResponse, PushEnvelope, PushResponse, SyncTransport } from '../transport';

beforeEach(() => resetConnectionsForTests());

const EMPTY_PULL: PullResponse = {
  cursor: '2026-10-02T12:00:00Z',
  full_snapshot: false,
  categories: [],
  items: [],
  customers: [],
  pending_deliveries: [],
  profile: null,
};

/** A transport that holds every push open until the test answers it. */
class HeldTransport implements SyncTransport {
  readonly batches: PushEnvelope[] = [];
  private readonly waiting: Array<(response: PushResponse) => void> = [];
  private readonly arrivals: Array<() => void> = [];

  async push(_token: string, envelope: PushEnvelope): Promise<PushResponse> {
    this.batches.push(envelope);
    this.arrivals.shift()?.();
    return new Promise<PushResponse>((resolve) => this.waiting.push(resolve));
  }

  async pull(): Promise<PullResponse> {
    return EMPTY_PULL;
  }

  /** Resolves once the next push has been handed to the transport. */
  nextPush(): Promise<void> {
    return new Promise<void>((resolve) => this.arrivals.push(resolve));
  }

  /** Answer the oldest held push, every record with the same status. */
  answer(status: 'accepted' | 'duplicate' | 'rejected'): void {
    const resolve = this.waiting.shift();
    const envelope = this.batches[this.batches.length - this.waiting.length - 1];
    if (!resolve || !envelope) throw new Error('no push is waiting for an answer');
    resolve({
      batch_id: envelope.batch_id,
      server_time: '2026-10-02T12:00:01Z',
      results: envelope.records.map((record) => ({
        id: record.id,
        status,
        ...(status === 'rejected' ? { reason: 'invalid' } : {}),
      })),
    });
  }
}

function sentStatus(envelope: PushEnvelope | undefined): unknown {
  return (envelope?.records[0]?.payload as { status?: unknown } | undefined)?.status;
}

describe('an answer for an older snapshot', () => {
  it('keeps the newer snapshot queued and the order unsynced', async () => {
    const name = freshDbName();
    const orders = new OrderRepository(name);
    const sent = anOrder({ id: 'race-order', status: 'sent', payments: [] });
    await orders.save(sent);

    const transport = new HeldTransport();
    const arrived = transport.nextPush();
    const pushing = pushOutbox(transport, '', name);
    await arrived;

    // The cashier closes the bill while the first push is still out.
    await orders.save({ ...sent, status: 'closed', updatedAt: '2026-10-02T12:00:00Z' });
    transport.answer('accepted');
    await pushing;

    expect(sentStatus(transport.batches[0])).toBe('sent');
    expect(await pendingCount(await openDatabase(name))).toBe(1);
    const stored = await orders.get(sent.id);
    expect(stored?.status).toBe('closed');
    expect(stored?.syncedAt).toBeNull();

    // The next run carries the closed bill, and only its answer settles it.
    const next = transport.nextPush();
    const second = pushOutbox(transport, '', name);
    await next;
    expect(sentStatus(transport.batches[1])).toBe('closed');
    transport.answer('accepted');
    await second;

    expect(await pendingCount(await openDatabase(name))).toBe(0);
    expect((await orders.get(sent.id))?.syncedAt).toBe('2026-10-02T12:00:01Z');
  });

  it('does not back off the newer snapshot when the older one is refused', async () => {
    const name = freshDbName();
    const orders = new OrderRepository(name);
    const sent = anOrder({ id: 'refused-order', status: 'sent', payments: [] });
    await orders.save(sent);

    const transport = new HeldTransport();
    const arrived = transport.nextPush();
    const pushing = pushOutbox(transport, '', name);
    await arrived;

    await orders.save({ ...sent, status: 'closed', updatedAt: '2026-10-02T12:00:00Z' });
    transport.answer('rejected');
    await pushing;

    const [entry] = await allOutboxEntries(await openDatabase(name));
    expect((entry?.payload as { status?: string } | undefined)?.status).toBe('closed');
    // The refusal was about a snapshot that no longer exists: the newer one is
    // due now, with no error and no attempt counted against it.
    expect(entry?.attempts).toBe(0);
    expect(entry?.lastError).toBeNull();
    expect(entry?.nextAttemptAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('sync runs', () => {
  it('never push concurrently', async () => {
    const name = freshDbName();
    await new OrderRepository(name).save(anOrder({ id: 'busy-order', status: 'closed' }));

    let inFlight = 0;
    let maxInFlight = 0;
    let pushes = 0;
    const transport: SyncTransport = {
      async push(_token, envelope) {
        pushes += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight -= 1;
        return {
          batch_id: envelope.batch_id,
          server_time: '2026-10-02T12:00:01Z',
          results: envelope.records.map((record) => ({ id: record.id, status: 'accepted' as const })),
        };
      },
      pull: async () => EMPTY_PULL,
    };

    // The interval, a reconnect and a closed shift can all ask at once.
    await Promise.all([
      runSync({ transport, dbName: name }),
      runSync({ transport, dbName: name }),
      runSync({ transport, dbName: name }),
    ]);

    expect(maxInFlight).toBe(1);
    expect(pushes).toBe(1);
    expect(await pendingCount(await openDatabase(name))).toBe(0);
  });

  // Guards the shape of the fix rather than the bug: a single-flight that just
  // handed back the run already in flight would leave this bill for the next
  // interval, and the test would hang on the second push that never comes.
  it('a run asked for while one is in flight still happens after it', async () => {
    const name = freshDbName();
    const orders = new OrderRepository(name);
    await orders.save(anOrder({ id: 'first-bill', status: 'closed' }));

    const transport = new HeldTransport();
    const arrived = transport.nextPush();
    const first = runSync({ transport, dbName: name });
    await arrived;

    // A bill closed during the first run must not wait for the next interval.
    await orders.save(anOrder({ id: 'second-bill', status: 'closed' }));
    const secondArrived = transport.nextPush();
    const second = runSync({ transport, dbName: name });
    transport.answer('accepted');
    await first;

    await secondArrived;
    expect(transport.batches[1]?.records.map((record) => record.id)).toEqual(['second-bill']);
    transport.answer('accepted');
    await second;

    expect(await pendingCount(await openDatabase(name))).toBe(0);
  });
});
