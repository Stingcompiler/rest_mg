/**
 * The offline contract rests on one guarantee the storage layer must make: a
 * closed order and its outbox entry share a transaction, so a crash between the
 * two writes leaves neither. This test forces the crash — an abort partway
 * through — and shows the transaction unwinds both writes together.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { openDatabase, resetConnectionsForTests } from '../open';
import { STORES } from '../schema';
import { txDone, request } from '../idb';
import { enqueue } from '../outbox';
import { anOrder, freshDbName } from './fixtures';

beforeEach(() => resetConnectionsForTests());

describe('order + outbox write is atomic', () => {
  it('an abort after both puts leaves neither the order nor the queue entry', async () => {
    const name = freshDbName();
    const db = await openDatabase(name);
    const order = anOrder({ id: 'atomic-1', status: 'closed' });

    const tx = db.transaction([STORES.orders, STORES.outbox], 'readwrite');
    tx.objectStore(STORES.orders).put(order);
    enqueue(tx, 'order', order);
    // The device loses power between the puts and the commit.
    tx.abort();
    await expect(txDone(tx)).rejects.toBeTruthy();

    const check = db.transaction([STORES.orders, STORES.outbox], 'readonly');
    const storedOrder = await request(check.objectStore(STORES.orders).get('atomic-1'));
    const queued = await request(check.objectStore(STORES.outbox).count());

    expect(storedOrder).toBeUndefined();
    expect(queued).toBe(0);
  });

  it('a committed write leaves both', async () => {
    const name = freshDbName();
    const db = await openDatabase(name);
    const order = anOrder({ id: 'atomic-2', status: 'closed' });

    const tx = db.transaction([STORES.orders, STORES.outbox], 'readwrite');
    tx.objectStore(STORES.orders).put(order);
    enqueue(tx, 'order', order);
    await txDone(tx);

    const check = db.transaction([STORES.orders, STORES.outbox], 'readonly');
    const storedOrder = await request(check.objectStore(STORES.orders).get('atomic-2'));
    const queued = await request(check.objectStore(STORES.outbox).count());

    expect(storedOrder).toBeDefined();
    expect(queued).toBe(1);
  });
});
