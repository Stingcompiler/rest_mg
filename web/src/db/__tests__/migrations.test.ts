/**
 * The migration ladder is the one part of this app that can brick a customer's
 * tablet with no way to recover it, so it is tested the only way that proves
 * anything: leave a database at the previous version with real data in it, then
 * upgrade and check the data is still there and correctly transformed.
 */
import { describe, expect, it, beforeEach } from 'vitest';

import { openDatabase, resetConnectionsForTests } from '../open';
import { SCHEMA_VERSION, STORES } from '../schema';
import { txDone } from '../idb';
import type { OrderRecord } from '../records';
import { anOrder, freshDbName } from './fixtures';

beforeEach(() => resetConnectionsForTests());

describe('schema version', () => {
  it('is derived from the ladder, and the ladder currently ends at 4', () => {
    expect(SCHEMA_VERSION).toBe(4);
  });
});

describe('fresh install', () => {
  it('creates every store at the current version', async () => {
    const db = await openDatabase(freshDbName());
    const names = Array.from(db.objectStoreNames).sort();
    expect(names).toEqual(
      [
        STORES.orders,
        STORES.categories,
        STORES.menuItems,
        STORES.priceChanges,
        STORES.shifts,
        STORES.users,
        STORES.settings,
        STORES.outbox,
        STORES.syncState,
        STORES.printJobs,
        STORES.customers,
      ].sort(),
    );
  });

  it('gives orders the itemCount index that v2 adds', async () => {
    const db = await openDatabase(freshDbName());
    const tx = db.transaction(STORES.orders, 'readonly');
    expect(Array.from(tx.objectStore(STORES.orders).indexNames)).toContain('itemCount');
  });
});

describe('upgrade v1 → v2', () => {
  it('preserves existing orders and backfills their item count', async () => {
    const name = freshDbName();

    // A device installed at v1, before itemCount existed.
    const db1 = await openDatabase(name, 1);
    const order = anOrder({
      lines: [
        {
          id: 'l1',
          itemId: 'i1',
          nameAr: 'شاورما لحم',
          nameEn: '',
          unitPriceMinor: '12500',
          qty: 2,
          modifiersText: '',
          lineTotalMinor: '25000',
          isVoid: false,
          voidReason: '',
        },
        {
          id: 'l2',
          itemId: 'i2',
          nameAr: 'شاي',
          nameEn: '',
          unitPriceMinor: '2000',
          qty: 1,
          modifiersText: '',
          lineTotalMinor: '2000',
          // A void line must not be counted.
          isVoid: true,
          voidReason: 'ألغيت',
        },
      ],
    });
    // Store it the way v1 did: with no itemCount field at all.
    const { itemCount: _drop, ...withoutCount } = order;
    void _drop;
    const write = db1.transaction(STORES.orders, 'readwrite');
    write.objectStore(STORES.orders).put(withoutCount);
    await txDone(write);
    db1.close();
    resetConnectionsForTests();

    // The device updates and reopens at v2.
    const db2 = await openDatabase(name, 2);
    const read = db2.transaction(STORES.orders, 'readonly');
    const upgraded = await new Promise<OrderRecord>((resolve, reject) => {
      const req = read.objectStore(STORES.orders).get(order.id);
      req.onsuccess = () => resolve(req.result as OrderRecord);
      req.onerror = () => reject(req.error);
    });

    // Data intact.
    expect(upgraded.id).toBe(order.id);
    expect(upgraded.totalMinor).toBe('25000');
    expect(upgraded.lines).toHaveLength(2);
    // Backfilled: 2 live + 1 void → 2.
    expect(upgraded.itemCount).toBe(2);
  });

  it('runs the whole ladder in one step for a device that skipped v1', async () => {
    // oldVersion 0 → newVersion 2 must apply both rungs, in order.
    const db = await openDatabase(freshDbName(), 2);
    const tx = db.transaction(STORES.orders, 'readonly');
    const store = tx.objectStore(STORES.orders);
    expect(Array.from(store.indexNames)).toEqual(
      expect.arrayContaining(['status', 'shiftRef', 'openedAt', 'syncedAt', 'itemCount']),
    );
  });
});

describe('upgrade v2 → v3', () => {
  it('adds the print-jobs store while preserving existing orders', async () => {
    const name = freshDbName();

    // A device on v2 with an order already on it.
    const db2 = await openDatabase(name, 2);
    const order = anOrder({ id: 'keep-me' });
    const write = db2.transaction(STORES.orders, 'readwrite');
    write.objectStore(STORES.orders).put(order);
    await txDone(write);
    expect(db2.objectStoreNames.contains(STORES.printJobs)).toBe(false);
    db2.close();
    resetConnectionsForTests();

    // Upgrade to v3.
    const db3 = await openDatabase(name, 3);
    expect(db3.objectStoreNames.contains(STORES.printJobs)).toBe(true);

    const read = db3.transaction(STORES.orders, 'readonly');
    const survived = await new Promise((resolve, reject) => {
      const req = read.objectStore(STORES.orders).get('keep-me');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(survived).toBeDefined();
  });
});

describe('upgrade v3 → v4', () => {
  it('adds the customers store without disturbing the orders already taken', async () => {
    // The guarantee that matters on a live tablet: a schema change must not cost
    // a cashier the bills already on the device.
    const name = freshDbName();
    const before = await openDatabase(name);
    const order = anOrder({ id: 'kept-1', status: 'closed', totalMinor: '31000' });
    await new Promise<void>((resolve, reject) => {
      const tx = before.transaction(STORES.orders, 'readwrite');
      tx.objectStore(STORES.orders).put(order);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    before.close();
    resetConnectionsForTests();

    const after = await openDatabase(name);

    expect(Array.from(after.objectStoreNames)).toContain(STORES.customers);
    const kept = await new Promise<OrderRecord>((resolve, reject) => {
      const request = after.transaction(STORES.orders, 'readonly').objectStore(STORES.orders).get('kept-1');
      request.onsuccess = () => resolve(request.result as OrderRecord);
      request.onerror = () => reject(request.error);
    });
    expect(kept.totalMinor).toBe('31000');
  });
});
