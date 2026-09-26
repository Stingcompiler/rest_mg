/**
 * Hardening soak tests.
 *
 * The migration ladder must carry data intact from *every* version a device
 * could be sitting at, not just the newest — a tablet that has been offline for
 * months might be two versions behind. And a device that accumulated a session's
 * worth of work offline must reconcile it all on a single reconnect, losing and
 * duplicating nothing.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import '@/db/__tests__/setup';
import { openDatabase, resetConnectionsForTests } from '@/db/open';
import { SCHEMA_VERSION, STORES } from '@/db/schema';
import { MIGRATIONS } from '@/db/migrations';
import { txDone, request } from '@/db/idb';
import { anOrder, freshDbName } from '@/db/__tests__/fixtures';

beforeEach(() => resetConnectionsForTests());

describe('migration ladder — from every released version', () => {
  // Every version the ladder has ever shipped, plus a fresh install (0).
  const startVersions = [0, ...MIGRATIONS.map((m) => m.version).filter((v) => v < SCHEMA_VERSION)];

  it.each(startVersions)('upgrades a device at v%i to the current version with data intact', async (from) => {
    const name = freshDbName();

    // A device sitting at `from`, with an order on it (skip data at v0 — no
    // stores exist yet to write into).
    if (from > 0) {
      const db = await openDatabase(name, from);
      const order = anOrder({ id: `carried-from-v${from}` });
      const tx = db.transaction(STORES.orders, 'readwrite');
      tx.objectStore(STORES.orders).put(order);
      await txDone(tx);
      db.close();
      resetConnectionsForTests();
    }

    // Upgrade all the way to current.
    const upgraded = await openDatabase(name, SCHEMA_VERSION);

    // Every store the current schema promises is present.
    for (const store of Object.values(STORES)) {
      expect(upgraded.objectStoreNames.contains(store)).toBe(true);
    }

    // The order written at the old version survived the whole ladder.
    if (from > 0) {
      const tx = upgraded.transaction(STORES.orders, 'readonly');
      const survived = await request(tx.objectStore(STORES.orders).get(`carried-from-v${from}`));
      expect(survived).toBeDefined();
    }
  });
});

describe('offline soak — a session accumulated offline reconciles on one reconnect', () => {
  it('drains a mixed outbox of orders, a shift, and price changes with zero loss', async () => {
    const { OrderRepository, ShiftRepository, MenuRepository, SettingsRepository, SETTINGS_KEYS, pendingCount } =
      await import('@/db');
    const { runSync } = await import('@/sync');
    const { FakeServer } = await import('@/sync/__tests__/fake-server');
    const { aShift, aPriceChange, anItem } = await import('@/db/__tests__/fixtures');

    const name = freshDbName();
    await new SettingsRepository(name).set(SETTINGS_KEYS.deviceToken, 'tok');

    const orders = new OrderRepository(name);
    const shifts = new ShiftRepository(name);
    const menu = new MenuRepository(name);

    // A whole shift's worth of offline work: 40 closed orders, a menu item to
    // price against, several price edits, and the closed shift itself.
    await menu.applyPull([], [anItem({ id: 'item-1' })]);
    for (let i = 0; i < 40; i += 1) {
      await orders.save(anOrder({ id: `soak-order-${i}`, status: 'closed' }));
    }
    for (let i = 0; i < 5; i += 1) {
      await menu.recordPriceEdit(aPriceChange({ itemId: 'item-1', oldPriceMinor: '12500', newPriceMinor: `${13000 + i}` }));
    }
    await shifts.save(aShift({ id: 'soak-shift', status: 'closed' }));

    const db = await openDatabase(name);
    const queuedBefore = await pendingCount(db);
    expect(queuedBefore).toBe(46); // 40 orders + 5 price changes + 1 shift

    // The tablet reconnects. One sync run reconciles the lot.
    const server = new FakeServer();
    const result = await runSync({ transport: server, dbName: name });

    expect(result.online).toBe(true);
    expect(result.pushed).toBe(46);
    expect(result.pending).toBe(0);
    // The server holds each record exactly once — no duplicates from the soak.
    expect(server.seen.size).toBe(46);
  });
});
