/**
 * Listing the queue, and forcing it to be tried again now.
 *
 * The backoff is right for an outage and wrong for a cashier standing at the
 * till who has just fixed the problem: without a way to clear it, a record that
 * had failed a few times sat for minutes while the screen said only "not
 * synced".
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { OrderRepository } from '../repositories/orderRepository';
import { allEntries, backoff, dueEntries, retryNow } from '../outbox';
import { openDatabase, resetConnectionsForTests } from '../open';
import { freshDbName, anOrder } from './fixtures';

beforeEach(() => resetConnectionsForTests());

async function queueOrders(name: string, count: number) {
  const repo = new OrderRepository(name);
  for (let index = 0; index < count; index += 1) {
    await repo.save(anOrder({ id: `order-${index}`, status: 'closed' }));
  }
  return openDatabase(name);
}

describe('allEntries', () => {
  it('lists everything queued, oldest first', async () => {
    const name = freshDbName();
    const db = await queueOrders(name, 3);

    const all = await allEntries(db);

    expect(all).toHaveLength(3);
    const times = all.map((entry) => entry.createdAt);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('includes records that are waiting out a backoff', async () => {
    // These are exactly the ones `dueEntries` hides, and exactly the ones a
    // cashier is asking about when nothing seems to be syncing.
    const name = freshDbName();
    const db = await queueOrders(name, 2);
    const [first] = await allEntries(db);
    await backoff(db, first.id, 'rejected');

    expect(await dueEntries(db)).toHaveLength(1);
    expect(await allEntries(db)).toHaveLength(2);
  });
});

describe('retryNow', () => {
  it('makes a backed-off record due again', async () => {
    const name = freshDbName();
    const db = await queueOrders(name, 1);
    const [entry] = await allEntries(db);
    await backoff(db, entry.id, 'rejected');
    expect(await dueEntries(db)).toHaveLength(0);

    const rescheduled = await retryNow(db);

    expect(rescheduled).toBe(1);
    expect(await dueEntries(db)).toHaveLength(1);
  });

  it('clears the stale error so a fresh verdict replaces it', async () => {
    const name = freshDbName();
    const db = await queueOrders(name, 1);
    const [entry] = await allEntries(db);
    await backoff(db, entry.id, 'the old reason');

    await retryNow(db);

    const [after] = await allEntries(db);
    expect(after.lastError).toBeNull();
  });

  it('can reschedule one record without touching the rest', async () => {
    const name = freshDbName();
    const db = await queueOrders(name, 3);
    const all = await allEntries(db);
    for (const entry of all) await backoff(db, entry.id, 'rejected');

    const rescheduled = await retryNow(db, [all[1].id]);

    expect(rescheduled).toBe(1);
    const due = await dueEntries(db);
    expect(due.map((entry) => entry.id)).toEqual([all[1].id]);
  });

  it('keeps the attempt count, which is the record of what happened', async () => {
    const name = freshDbName();
    const db = await queueOrders(name, 1);
    const [entry] = await allEntries(db);
    await backoff(db, entry.id, 'rejected');
    await backoff(db, entry.id, 'rejected again');

    await retryNow(db);

    const [after] = await allEntries(db);
    expect(after.attempts).toBe(2);
  });
});
