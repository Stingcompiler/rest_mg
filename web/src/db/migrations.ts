/**
 * The migration ladder.
 *
 * Customers run this offline, on a tablet, with no one to call when it fails.
 * That single fact shapes everything here:
 *
 *   - **Forward only.** There is no down-migration; a released version is a rung
 *     that stays. The runner replays every rung above the installed version, in
 *     order, inside one `versionchange` transaction.
 *   - **Each rung is a pure function of (db, tx).** It performs its structural
 *     change and any data backfill against the transaction it is handed, and
 *     touches nothing else. That is what makes a rung testable in isolation
 *     against a fixture database left at the previous version.
 *   - **Never edit a shipped rung.** Once a version has reached a device, its
 *     migration is history. A change goes in as a new rung with a new number.
 *
 * `db/__tests__/migrations.test.ts` opens a database at version N-1, writes real
 * data, then reopens at N and asserts the data survived — the only proof that
 * matters when there is no manual fallback.
 */
import { STORES } from './stores';
import type { OrderRecord } from './records';

export interface Migration {
  version: number;
  description: string;
  migrate(db: IDBDatabase, tx: IDBTransaction): void;
}

const createInitialStores: Migration = {
  version: 1,
  description: 'Create every store the offline device needs.',
  migrate(db) {
    // The working set: every order the device has ever taken, open or closed.
    const orders = db.createObjectStore(STORES.orders, { keyPath: 'id' });
    orders.createIndex('status', 'status');
    orders.createIndex('shiftRef', 'shiftRef');
    orders.createIndex('openedAt', 'openedAt');
    // syncedAt is null until acknowledged; null keys are skipped, so this index
    // lists only synced orders — which is exactly what a "what's confirmed" view
    // wants. Unsynced work is found through the outbox, not here.
    orders.createIndex('syncedAt', 'syncedAt');

    const categories = db.createObjectStore(STORES.categories, { keyPath: 'id' });
    categories.createIndex('sort', 'sort');

    // isAvailable is deliberately not indexed: IndexedDB rejects boolean keys.
    // A menu is small enough to filter availability in memory, and categoryId
    // narrows it first.
    const menuItems = db.createObjectStore(STORES.menuItems, { keyPath: 'id' });
    menuItems.createIndex('categoryId', 'categoryId');

    const priceChanges = db.createObjectStore(STORES.priceChanges, { keyPath: 'id' });
    priceChanges.createIndex('itemId', 'itemId');
    priceChanges.createIndex('syncedAt', 'syncedAt');

    const shifts = db.createObjectStore(STORES.shifts, { keyPath: 'id' });
    shifts.createIndex('status', 'status');
    shifts.createIndex('openedAt', 'openedAt');
    shifts.createIndex('syncedAt', 'syncedAt');

    const users = db.createObjectStore(STORES.users, { keyPath: 'id' });
    users.createIndex('role', 'role');

    db.createObjectStore(STORES.settings, { keyPath: 'key' });
    db.createObjectStore(STORES.syncState, { keyPath: 'key' });

    // The upload queue. Drained oldest-ready-first, so nextAttemptAt is indexed.
    const outbox = db.createObjectStore(STORES.outbox, { keyPath: 'id' });
    outbox.createIndex('type', 'type');
    outbox.createIndex('nextAttemptAt', 'nextAttemptAt');
  },
};

const addOrderItemCount: Migration = {
  version: 2,
  description: 'Denormalise line count onto orders for the open-orders list.',
  migrate(_db, tx) {
    // A real forward migration: new index plus a backfill of existing rows, so
    // the open-orders screen can show "٣ أصناف" without deserialising lines.
    const orders = tx.objectStore(STORES.orders);
    orders.createIndex('itemCount', 'itemCount');

    const cursorRequest = orders.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const record = cursor.value as OrderRecord & { itemCount?: number };
      if (record.itemCount === undefined) {
        const liveLines = (record.lines ?? []).filter((line) => !line.isVoid);
        record.itemCount = liveLines.reduce((sum, line) => sum + line.qty, 0);
        cursor.update(record);
      }
      cursor.continue();
    };
  },
};

const addPrintJobsStore: Migration = {
  version: 3,
  description: 'Create the persisted print queue.',
  migrate(db) {
    // Print jobs are persisted before they are sent, so a job survives a crash
    // between "order closed" and "receipt printed". Drained oldest-ready-first.
    const printJobs = db.createObjectStore(STORES.printJobs, { keyPath: 'id' });
    printJobs.createIndex('nextAttemptAt', 'nextAttemptAt');
    printJobs.createIndex('orderId', 'orderId');
  },
};

/** Ordered by version. New rungs are appended, never inserted or edited. */
const addCustomersStore: Migration = {
  version: 4,
  description: 'Hold the customers a credit sale can be booked against.',
  migrate(db) {
    // Credit must name who owes it, and the till gives credit with the line
    // down as readily as with it up — so the names have to live on the device.
    // They arrive with the same pull that brings the menu.
    const customers = db.createObjectStore(STORES.customers, { keyPath: 'id' });
    customers.createIndex('name', 'name');
  },
};

export const MIGRATIONS: Migration[] = [
  createInitialStores,
  addOrderItemCount,
  addPrintJobsStore,
  addCustomersStore,
];
