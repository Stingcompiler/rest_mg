/**
 * Repositories are the persistence boundary and the keepers of the outbox
 * invariant. These tests hold them to the two things the offline contract can't
 * survive without: an order and its upload queue entry are written together or
 * not at all, and money survives a round trip past the precision a JSON number
 * can hold.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { OrderRepository } from '../repositories/orderRepository';
import { MenuRepository } from '../repositories/menuRepository';
import { ShiftRepository } from '../repositories/shiftRepository';
import { SettingsRepository, SyncStateRepository } from '../repositories/settingsRepository';
import { UserRepository } from '../repositories/userRepository';
import { dueEntries, pendingCount, outboxId } from '../outbox';
import { openDatabase, resetConnectionsForTests } from '../open';
import { hashPin } from '../pin';
import { toMinor } from '../money';
import type { UserRecord } from '../records';
import { aCategory, anItem, anOrder, aPriceChange, aShift, freshDbName } from './fixtures';

beforeEach(() => resetConnectionsForTests());

describe('orders and the outbox', () => {
  it('queues a closed order in the same write', async () => {
    const name = freshDbName();
    const repo = new OrderRepository(name);
    const order = anOrder({ status: 'closed' });

    await repo.save(order);

    const db = await openDatabase(name);
    expect(await pendingCount(db)).toBe(1);
    const due = await dueEntries(db);
    expect(due[0].id).toBe(outboxId('order', order.id));
    expect(due[0].payload.id).toBe(order.id);
  });

  it('does not queue an order that is still open', async () => {
    const name = freshDbName();
    const repo = new OrderRepository(name);

    await repo.save(anOrder({ status: 'open' }));

    const db = await openDatabase(name);
    expect(await pendingCount(db)).toBe(0);
  });

  it('re-saving the same order never queues it twice', async () => {
    const name = freshDbName();
    const repo = new OrderRepository(name);
    const order = anOrder({ status: 'closed' });

    await repo.save(order);
    await repo.save({ ...order, totalMinor: '25000' });

    const db = await openDatabase(name);
    expect(await pendingCount(db)).toBe(1);
  });

  it('backfills item count on every save', async () => {
    const name = freshDbName();
    const repo = new OrderRepository(name);
    const order = anOrder({
      lines: [
        { ...anOrder().lines[0], id: 'a', qty: 2, isVoid: false },
        { ...anOrder().lines[0], id: 'b', qty: 5, isVoid: true },
      ],
    });

    await repo.save(order);
    const stored = await repo.get(order.id);
    expect(stored?.itemCount).toBe(2);
  });

  it('lists open orders across open, parked and sent', async () => {
    const name = freshDbName();
    const repo = new OrderRepository(name);
    await repo.save(anOrder({ id: 'o1', status: 'open' }));
    await repo.save(anOrder({ id: 'o2', status: 'parked' }));
    await repo.save(anOrder({ id: 'o3', status: 'sent' }));
    await repo.save(anOrder({ id: 'o4', status: 'closed' }));

    const open = await repo.listOpen();
    expect(open.map((o) => o.id).sort()).toEqual(['o1', 'o2', 'o3']);
  });

  it('carries money beyond Number.MAX_SAFE_INTEGER without loss', async () => {
    const name = freshDbName();
    const repo = new OrderRepository(name);
    const huge = (2n ** 53n + 1n).toString();
    await repo.save(anOrder({ totalMinor: huge, subtotalMinor: huge }));

    const stored = await repo.get(anOrder({ id: 'x' }).id) ?? (await repo.listByStatus('closed'))[0];
    expect(toMinor(stored.totalMinor)).toBe(2n ** 53n + 1n);
  });
});

describe('menu and price edits', () => {
  it('moves the item, records history, and queues the change in one write', async () => {
    const name = freshDbName();
    const menu = new MenuRepository(name);
    await menu.applyPull([aCategory({ id: 'c1' })], [anItem({ id: 'it1', categoryId: 'c1', priceMinor: '12500' })]);

    await menu.recordPriceEdit(aPriceChange({ itemId: 'it1', oldPriceMinor: '12500', newPriceMinor: '15000' }));

    const item = await menu.getItem('it1');
    expect(item?.priceMinor).toBe('15000');

    const db = await openDatabase(name);
    expect(await pendingCount(db)).toBe(1);
    expect((await dueEntries(db))[0].type).toBe('price_change');
  });

  it('refuses a price change for an unknown item and queues nothing', async () => {
    const name = freshDbName();
    const menu = new MenuRepository(name);

    await expect(menu.recordPriceEdit(aPriceChange({ itemId: 'ghost' }))).rejects.toThrow();

    const db = await openDatabase(name);
    expect(await pendingCount(db)).toBe(0);
  });

  it('filters unavailable items when asked', async () => {
    const name = freshDbName();
    const menu = new MenuRepository(name);
    await menu.applyPull(
      [aCategory({ id: 'c1' })],
      [
        anItem({ id: 'a', categoryId: 'c1', isAvailable: true }),
        anItem({ id: 'b', categoryId: 'c1', isAvailable: false }),
      ],
    );

    expect((await menu.listItemsByCategory('c1', true)).map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect((await menu.listItemsByCategory('c1', false)).map((i) => i.id)).toEqual(['a']);
  });
});

describe('shifts', () => {
  it('queues a closed shift and finds the active one', async () => {
    const name = freshDbName();
    const repo = new ShiftRepository(name);
    await repo.save(aShift({ id: 's-open', status: 'open', openedAt: '2026-08-07T08:00:00.000Z' }));
    await repo.save(aShift({ id: 's-closed', status: 'closed' }));

    const db = await openDatabase(name);
    expect(await pendingCount(db)).toBe(1); // only the closed one

    const active = await repo.activeShift();
    expect(active?.id).toBe('s-open');
  });
});

describe('settings and sync state', () => {
  it('round-trips a value', async () => {
    const name = freshDbName();
    const settings = new SettingsRepository(name);
    await settings.set('locale', 'ar');
    expect(await settings.get<string>('locale')).toBe('ar');
  });

  it('reports the pending count and remembers the pull cursor', async () => {
    const name = freshDbName();
    const orders = new OrderRepository(name);
    await orders.save(anOrder({ status: 'closed' }));

    const syncState = new SyncStateRepository(name);
    await syncState.setPullCursor('2026-08-07T14:32:00.000Z');

    expect(await syncState.getPullCursor()).toBe('2026-08-07T14:32:00.000Z');
    expect(await syncState.pending()).toBe(1);
  });
});

describe('cashier PIN', () => {
  // PBKDF2 at 150k iterations is slow on purpose — that is the point of it —
  // and this exercise runs it three times. The cost is the feature, so the test
  // gets headroom rather than the hash getting weakened for the suite's sake.
  it('verifies against the stored hash and rejects the wrong PIN', { timeout: 30_000 }, async () => {
    const name = freshDbName();
    const users = new UserRepository(name);
    const hashed = await hashPin('1379');
    const user: UserRecord = {
      id: 'u1',
      nameAr: 'سمية',
      nameEn: 'Sumaya',
      role: 'cashier',
      isActive: true,
      ...hashed,
    };
    await users.upsertMany([user]);

    expect(await users.verify('u1', '1379')).not.toBeNull();
    expect(await users.verify('u1', '0000')).toBeNull();
  });

  it('never stores the raw PIN', async () => {
    const hashed = await hashPin('1379');
    expect(hashed.pinHash).not.toContain('1379');
    expect(hashed.pinSalt).toMatch(/^[0-9a-f]{32}$/);
  });
});
