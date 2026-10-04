/**
 * Two things the till learns from the sync run (batch 12).
 *
 * - An expired session showed as "offline". The till kept saying it would sync
 *   later, and never would, because what it needed was someone to sign in
 *   again. Now a 401 or 403 is reported as the session, not the line.
 * - The till never heard that the kitchen had finished an order. The kitchen
 *   board knew and the cashier did not. The pull now carries the till orders
 *   the kitchen has marked ready, as a signal like the waiting deliveries.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { anOrder, freshDbName } from '@/db/__tests__/fixtures';
import { OrderRepository } from '@/db';
import { pullMenu } from '../pull';
import { runSync } from '../engine';
import { FakeServer } from './fake-server';

beforeEach(() => resetConnectionsForTests());

describe('an expired session', () => {
  it('is reported as the session, not as offline', async () => {
    const name = freshDbName();
    await new OrderRepository(name).save(anOrder({ id: 'bill-1', status: 'closed' }));
    const server = new FakeServer();
    server.failPushWith = 401;
    const result = await runSync({ transport: server, dbName: name });
    expect(result.online).toBe(false);
    expect(result.sessionExpired).toBe(true);
  });

  it('is not claimed for a dropped line', async () => {
    const name = freshDbName();
    await new OrderRepository(name).save(anOrder({ id: 'bill-2', status: 'closed' }));
    const server = new FakeServer();
    server.dropAfter = 0;
    const result = await runSync({ transport: server, dbName: name });
    expect(result.online).toBe(false);
    expect(result.sessionExpired).toBeFalsy();
  });
});

describe('orders the kitchen has ready', () => {
  it('come back from the pull with their numbers', async () => {
    const server = new FakeServer();
    server.kitchenReady = [{ id: 'o-1', number: 'K7-1001' }, { id: 7 }, null];
    const outcome = await pullMenu(server, 'tok', freshDbName());
    expect(outcome.kitchenReady).toEqual([{ id: 'o-1', number: 'K7-1001' }]);
  });

  it('are an empty list from a server that does not send them', async () => {
    const server = new FakeServer();
    server.kitchenReady = undefined as unknown as unknown[];
    const outcome = await pullMenu(server, 'tok', freshDbName());
    expect(outcome.kitchenReady).toEqual([]);
  });

  it('reach the till through a sync run', async () => {
    const server = new FakeServer();
    server.kitchenReady = [{ id: 'o-2', number: 'K7-1002' }];
    const result = await runSync({ transport: server, dbName: freshDbName() });
    expect(result.kitchenReady).toEqual([{ id: 'o-2', number: 'K7-1002' }]);
  });
});
