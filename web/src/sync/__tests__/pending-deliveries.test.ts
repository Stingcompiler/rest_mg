/**
 * The till learns that a customer is waiting — without ever fetching an order.
 *
 * `/pos` may not touch the network; that is a lint-enforced rule, and it is what
 * makes the till work with the line down. So the one thing the cashier needs to
 * know about the outside world — that somebody has ordered — rides the sync run
 * that was already happening, as a signal rather than as data.
 *
 * These tests hold the two properties that make it safe: it is never written to
 * the device, and "the server did not answer" never reads as "nobody is
 * waiting".
 */
import { describe, expect, it, beforeEach } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { freshDbName } from '@/db/__tests__/fixtures';
import { pullMenu } from '../pull';
import { runSync } from '../engine';
import { FakeServer } from './fake-server';

beforeEach(() => resetConnectionsForTests());

describe('the waiting-customer signal', () => {
  it('comes back from the pull', async () => {
    const server = new FakeServer();
    server.pendingDeliveries = [
      { id: 'ord-1', number: '5001' },
      { id: 'ord-2', number: '5002' },
    ];

    const outcome = await pullMenu(server, 'tok', freshDbName());

    expect(outcome.pendingDeliveries).toEqual(['ord-1', 'ord-2']);
  });

  it('is empty when nobody is waiting', async () => {
    const outcome = await pullMenu(new FakeServer(), 'tok', freshDbName());
    expect(outcome.pendingDeliveries).toEqual([]);
  });

  it('survives a server that does not send the field at all', async () => {
    // An older server, or one mid-deploy. The till must keep working.
    const server = new FakeServer();
    server.pendingDeliveries = undefined as unknown as unknown[];
    const outcome = await pullMenu(server, 'tok', freshDbName());
    expect(outcome.pendingDeliveries).toEqual([]);
  });

  it('ignores rows that are not shaped like an order', async () => {
    const server = new FakeServer();
    server.pendingDeliveries = [{ id: 'good' }, { number: 'no id' }, null, 'nonsense', { id: 7 }];
    const outcome = await pullMenu(server, 'tok', freshDbName());
    expect(outcome.pendingDeliveries).toEqual(['good']);
  });

  it('reaches the till through a sync run', async () => {
    const server = new FakeServer();
    server.pendingDeliveries = [{ id: 'ord-9', number: '5009' }];

    const result = await runSync({ transport: server, dbName: freshDbName() });

    expect(result.online).toBe(true);
    expect(result.pendingDeliveries).toEqual(['ord-9']);
  });

  it('says nothing rather than "none" when the run never reached the server', async () => {
    // The distinction the badge depends on. An offline run reporting [] would
    // clear a genuine count and tell the cashier nobody is waiting.
    const server = new FakeServer();
    server.pendingDeliveries = [{ id: 'ord-9', number: '5009' }];
    server.pull = async () => {
      throw new Error('connection dropped');
    };

    const result = await runSync({ transport: server, dbName: freshDbName() });

    expect(result.online).toBe(false);
    expect(result.pendingDeliveries).toBeUndefined();
  });
});
