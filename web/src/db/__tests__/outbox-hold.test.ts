/**
 * A record the server refused waits for a decision (batch 63, Design Reference
 * §8: «a conflict is never resolved in silence — the reason, two choices with
 * what each one costs, and the record stays local until someone decides»).
 *
 * Before, a refused record was tried again every few minutes for ever and the
 * cashier's only button was «try again». Now there are two decisions:
 *   - keep it on this device: it stops being sent by itself, and stays listed;
 *   - discard it: it leaves the queue, and the bill stays in this till's own
 *     records.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { OrderRepository } from '../repositories/orderRepository';
import { allEntries, backoff, discardRefused, dueEntries, holdEntry, isHeld, retryNow } from '../outbox';
import { openDatabase, resetConnectionsForTests } from '../open';
import { freshDbName, anOrder } from './fixtures';

beforeEach(() => resetConnectionsForTests());

async function oneRefused() {
  const name = freshDbName();
  const repo = new OrderRepository(name);
  await repo.save(anOrder({ id: 'order-1', status: 'closed' }));
  const db = await openDatabase(name);
  const [entry] = await allEntries(db);
  await backoff(db, entry!, JSON.stringify({ code: 'already_settled' }));
  const [refused] = await allEntries(db);
  return { name, repo, db, refused: refused! };
}

describe('keeping a refused record on this device', () => {
  it('stops it being sent by itself, and keeps it listed with its reason', async () => {
    const { db, refused } = await oneRefused();
    await holdEntry(db, refused.id);

    expect(await dueEntries(db, Date.now() + 10 * 365 * 24 * 3600 * 1000)).toHaveLength(0);
    const [held] = await allEntries(db);
    expect(isHeld(held!)).toBe(true);
    expect(held!.lastError).toContain('already_settled');
  });

  it('is not undone by «sync everything now»; only its own «try again» releases it', async () => {
    const { db, refused } = await oneRefused();
    await holdEntry(db, refused.id);

    await retryNow(db);
    expect(isHeld((await allEntries(db))[0]!)).toBe(true);

    await retryNow(db, [refused.id]);
    const [released] = await allEntries(db);
    expect(isHeld(released!)).toBe(false);
    expect(released!.lastError).toBeNull();
    expect(await dueEntries(db)).toHaveLength(1);
  });

  it('holds only a record the server refused, not one that is merely waiting', async () => {
    const name = freshDbName();
    await new OrderRepository(name).save(anOrder({ id: 'order-2', status: 'closed' }));
    const db = await openDatabase(name);
    const [waiting] = await allEntries(db);

    expect(await holdEntry(db, waiting!.id)).toBe(false);
    expect(isHeld((await allEntries(db))[0]!)).toBe(false);
  });

  it('is replaced by a newer save of the same record, which is due at once', async () => {
    const { db, repo, refused } = await oneRefused();
    await holdEntry(db, refused.id);

    await repo.save(anOrder({ id: 'order-1', status: 'closed', note: 'changed' } as never));

    const [fresh] = await allEntries(db);
    expect(isHeld(fresh!)).toBe(false);
    expect(fresh!.lastError).toBeNull();
  });
});

describe('discarding a refused record', () => {
  it('removes it from the queue and leaves the bill in this till’s records', async () => {
    const { db, repo, refused } = await oneRefused();

    expect(await discardRefused(db, refused.id)).toBe(true);

    expect(await allEntries(db)).toHaveLength(0);
    expect(await repo.get('order-1')).toBeDefined();
  });

  it('refuses to discard something that is only waiting: that clears itself', async () => {
    const name = freshDbName();
    await new OrderRepository(name).save(anOrder({ id: 'order-3', status: 'closed' }));
    const db = await openDatabase(name);
    const [waiting] = await allEntries(db);

    expect(await discardRefused(db, waiting!.id)).toBe(false);
    expect(await allEntries(db)).toHaveLength(1);
  });

  it('discards a held one too', async () => {
    const { db, refused } = await oneRefused();
    await holdEntry(db, refused.id);
    expect(await discardRefused(db, refused.id)).toBe(true);
    expect(await allEntries(db)).toHaveLength(0);
  });
});
