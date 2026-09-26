/**
 * The sync engine's promises, each pinned — most importantly the one from the
 * plan's "done when": a large outbox pushed over a connection that drops
 * mid-batch produces zero duplicate rows on the server.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { freshDbName, anOrder, aCategory, anItem, aPriceChange } from '@/db/__tests__/fixtures';
import {
  OrderRepository,
  SettingsRepository,
  SETTINGS_KEYS,
  MenuRepository,
  openDatabase,
  pendingCount,
} from '@/db';
import { pushOutbox } from '../push';
import { pullMenu } from '../pull';
import { runSync } from '../engine';
import { FakeServer } from './fake-server';

beforeEach(() => resetConnectionsForTests());

async function enqueueClosedOrders(name: string, count: number): Promise<void> {
  const repo = new OrderRepository(name);
  for (let index = 0; index < count; index += 1) {
    await repo.save(anOrder({ id: `order-${index}`, status: 'closed' }));
  }
}

describe('push idempotency', () => {
  it('drains the outbox and marks records synced', async () => {
    const name = freshDbName();
    await enqueueClosedOrders(name, 3);
    const server = new FakeServer();

    const outcome = await pushOutbox(server, 'tok', name);

    expect(outcome).toEqual({ pushed: 3, failed: 0 });
    expect(server.seen.size).toBe(3);
    expect(await pendingCount(await openDatabase(name))).toBe(0);

    const stored = await new OrderRepository(name).get('order-0');
    expect(stored?.syncedAt).not.toBeNull();
  });

  it('a re-push after everything already landed is all duplicates and still clears', async () => {
    const name = freshDbName();
    await enqueueClosedOrders(name, 2);
    const server = new FakeServer();
    // Pre-seed the server as if a prior push had written these.
    server.seen.add('order-0');
    server.seen.add('order-1');

    const outcome = await pushOutbox(server, 'tok', name);
    expect(outcome.pushed).toBe(2); // duplicate counts as pushed — it's on the server
    expect(await pendingCount(await openDatabase(name))).toBe(0);
  });
});

describe('a connection dropped mid-batch produces zero duplicates', () => {
  // 500 records through fake-indexeddb is genuinely slow, and slower still
  // when the whole suite runs in parallel. The scale is the point of the test,
  // so it gets the headroom rather than being shrunk.
  it('re-sends the whole batch and the server holds each uuid exactly once', { timeout: 30_000 }, async () => {
    const name = freshDbName();
    await enqueueClosedOrders(name, 500);
    const server = new FakeServer();
    server.dropAfter = 250; // the server writes 250, then the connection dies

    // First attempt throws; nothing is removed because no response arrived.
    await expect(pushOutbox(server, 'tok', name)).rejects.toThrow(/dropped/);
    expect(server.seen.size).toBe(250);
    expect(await pendingCount(await openDatabase(name))).toBe(500);

    // Reconnect: the whole batch is re-sent. The 250 already there come back as
    // duplicates, the rest as accepted, and all clear.
    const outcome = await pushOutbox(server, 'tok', name);
    expect(outcome.pushed).toBe(500);
    // The server holds 500 uuids — each exactly once. Zero duplicate rows.
    expect(server.seen.size).toBe(500);
    expect(await pendingCount(await openDatabase(name))).toBe(0);
  });
});

describe('records the server can never accept', () => {
  it('discards a price change for an item the server has never heard of', async () => {
    // An early build seeded readable menu ids. A price change naming one can
    // never be accepted — the server requires a real menu item — so retrying it
    // forever only buries anything genuinely wrong under a growing pile.
    const name = freshDbName();
    const menu = new MenuRepository(name);
    await menu.applyPull([aCategory({ id: 'it-legacy-cat' })], [anItem({ id: 'it-legacy', categoryId: 'it-legacy-cat' })]);
    await menu.recordPriceEdit(
      aPriceChange({ itemId: 'it-legacy', oldPriceMinor: '1000', newPriceMinor: '2000' }),
    );

    const server = new FakeServer();
    server.rejectAll = true;

    const outcome = await pushOutbox(server, 'tok', name);

    // Not counted as a failure to retry: it is gone, and the queue is clear.
    expect(outcome.failed).toBe(0);
    expect(await pendingCount(await openDatabase(name))).toBe(0);
  });

  it('keeps retrying an order the server merely refused this time', async () => {
    // An order is not undeliverable by construction, so a rejection is kept.
    const name = freshDbName();
    await enqueueClosedOrders(name, 1);
    const server = new FakeServer();
    server.rejectIds.add('order-0');

    const outcome = await pushOutbox(server, 'tok', name);

    expect(outcome.failed).toBe(1);
    expect(await pendingCount(await openDatabase(name))).toBe(1);
  });
});

describe('rejected records', () => {
  it('are backed off and kept, without blocking the rest', async () => {
    const name = freshDbName();
    await enqueueClosedOrders(name, 3);
    const server = new FakeServer();
    server.rejectIds.add('order-1');

    const outcome = await pushOutbox(server, 'tok', name);

    expect(outcome.pushed).toBe(2);
    expect(outcome.failed).toBe(1);
    // The rejected one survives for a later attempt; the others are gone.
    expect(await pendingCount(await openDatabase(name))).toBe(1);
  });
});

describe('pull applies menu deltas and never touches orders', () => {
  it('writes categories and items, leaves an open order untouched, and advances the cursor', async () => {
    const name = freshDbName();
    // An open order the pull must not disturb.
    await new OrderRepository(name).save(anOrder({ id: 'open-1', status: 'open' }));

    const server = new FakeServer();
    server.seedCatalog(
      [{ id: 'c1', name_ar: 'مشاوي', name_en: 'Grills', sort: 0, is_active: true, updated_at: '2026-08-07T00:00:00Z' }],
      [
        {
          id: 'i1',
          category_id: 'c1',
          name_ar: 'شاورما',
          name_en: 'Shawarma',
          description_ar: '',
          description_en: '',
          price_minor: '12500',
          is_available: true,
          is_active: true,
          sort: 0,
          updated_at: '2026-08-07T00:00:00Z',
        },
      ],
    );

    const outcome = await pullMenu(server, 'tok', name);

    expect(outcome.applied).toBe(2);
    const items = await new MenuRepository(name).listItemsByCategory('c1');
    expect(items[0].priceMinor).toBe('12500');

    // The open order is exactly as it was.
    const order = await new OrderRepository(name).get('open-1');
    expect(order?.status).toBe('open');

    // A second pull carries the saved cursor forward.
    await pullMenu(server, 'tok', name);
    expect(server.pullCount).toBe(2);
  });
});

describe('runSync orchestration', () => {
  it('syncs without a device token, on the signed-in cashier alone', async () => {
    // A tablet nobody enrolled by hand is the normal case now: the cashier
    // signs in and their cookies authenticate the sync. The token is optional.
    const name = freshDbName();
    await enqueueClosedOrders(name, 1);
    const server = new FakeServer();

    const result = await runSync({ transport: server, dbName: name });

    expect(result.online).toBe(true);
    expect(result.pushed).toBe(1);
    expect(result.pending).toBe(0);
    expect(server.seen.size).toBe(1);
  });

  it('pushes and pulls when enrolled, and reports the queue drained', async () => {
    const name = freshDbName();
    await new SettingsRepository(name).set(SETTINGS_KEYS.deviceToken, 'tok');
    await enqueueClosedOrders(name, 2);
    const server = new FakeServer();

    const result = await runSync({ transport: server, dbName: name });

    expect(result.online).toBe(true);
    expect(result.skipped).toBe(false);
    expect(result.pushed).toBe(2);
    expect(result.pending).toBe(0);
  });

  it('reports offline and keeps the queue when the network fails', async () => {
    const name = freshDbName();
    await new SettingsRepository(name).set(SETTINGS_KEYS.deviceToken, 'tok');
    await enqueueClosedOrders(name, 2);
    const server = new FakeServer();
    server.dropAfter = 0; // fail immediately

    const result = await runSync({ transport: server, dbName: name });

    expect(result.online).toBe(false);
    expect(result.pending).toBe(2);
  });
});
