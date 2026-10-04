/**
 * Menu — categories and items, plus the price-change write path.
 *
 * Two directions meet here. `applyPull` writes what the server sent down, and
 * must never touch an open order (prices apply to the menu, not to a bill in
 * progress — that is a domain rule enforced in phase 5, and the menu store
 * simply has no orders in it to break). `recordPriceEdit` is a device-local
 * change that moves the item *and* queues a `price_change` up the same sync
 * path as orders, in one transaction.
 */
import { STORES } from '../schema';
import { newId } from '@/domain/ids';
import type { AvailabilityChangeRecord, CategoryRecord, MenuItemRecord, PriceChangeRecord } from '../records';
import { getAll, request, txDone } from '../idb';
import { enqueue } from '../outbox';
import { openDatabase } from '../open';

export class MenuRepository {
  constructor(private readonly dbName?: string) {}

  private db(): Promise<IDBDatabase> {
    return openDatabase(this.dbName);
  }

  /** Apply a pull delta: upsert whatever changed, leave everything else alone. */
  async applyPull(categories: CategoryRecord[], items: MenuItemRecord[]): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([STORES.categories, STORES.menuItems], 'readwrite');
    const categoryStore = tx.objectStore(STORES.categories);
    const itemStore = tx.objectStore(STORES.menuItems);
    for (const category of categories) categoryStore.put(category);
    for (const item of items) itemStore.put(item);
    await txDone(tx);
  }

  /**
   * Apply a full snapshot: everything the server has, so anything the device
   * holds that is not in it is retired (deactivated, never deleted — a bill may
   * still name it). This is how a demo menu, or one left from before, stops
   * appearing next to the real menu. Only for a snapshot; a delta must go
   * through `applyPull`, which retires nothing.
   */
  async replaceWithSnapshot(categories: CategoryRecord[], items: MenuItemRecord[]): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([STORES.categories, STORES.menuItems], 'readwrite');
    const categoryStore = tx.objectStore(STORES.categories);
    const itemStore = tx.objectStore(STORES.menuItems);

    const keepCategories = new Set(categories.map((category) => category.id));
    const keepItems = new Set(items.map((item) => item.id));
    for (const local of await getAll<CategoryRecord>(categoryStore)) {
      if (local.isActive && !keepCategories.has(local.id)) categoryStore.put({ ...local, isActive: false });
    }
    for (const local of await getAll<MenuItemRecord>(itemStore)) {
      if (local.isActive && !keepItems.has(local.id)) itemStore.put({ ...local, isActive: false });
    }
    for (const category of categories) categoryStore.put(category);
    for (const item of items) itemStore.put(item);
    await txDone(tx);
  }

  /**
   * Retire bootstrap rows whose ids are not UUIDs.
   *
   * An early build seeded the menu with readable ids (`it-shawarma-beef`). The
   * server stores a menu-item reference as a UUID, so every bill a device with
   * that menu produced was rejected on sync — permanently, and silently. The
   * rows are deactivated rather than deleted so nothing that points at them
   * dangles, and the caller re-seeds a correct menu afterwards.
   *
   * Returns how many rows were retired, so the repair can be reported rather
   * than done behind the user's back.
   */
  async retireNonUuidRows(): Promise<number> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const db = await this.db();
    const tx = db.transaction([STORES.categories, STORES.menuItems], 'readwrite');
    const categoryStore = tx.objectStore(STORES.categories);
    const itemStore = tx.objectStore(STORES.menuItems);

    const categories = await getAll<CategoryRecord>(categoryStore);
    const items = await getAll<MenuItemRecord>(itemStore);
    let retired = 0;
    for (const category of categories) {
      if (!uuid.test(category.id) && category.isActive) {
        categoryStore.put({ ...category, isActive: false });
        retired += 1;
      }
    }
    for (const item of items) {
      if (!uuid.test(item.id) && item.isActive) {
        itemStore.put({ ...item, isActive: false });
        retired += 1;
      }
    }
    await txDone(tx);
    return retired;
  }

  async listCategories(): Promise<CategoryRecord[]> {
    const db = await this.db();
    const tx = db.transaction(STORES.categories, 'readonly');
    const all = await getAll<CategoryRecord>(tx.objectStore(STORES.categories).index('sort'));
    return all.filter((category) => category.isActive);
  }

  async listItemsByCategory(categoryId: string, includeUnavailable = true): Promise<MenuItemRecord[]> {
    const db = await this.db();
    const tx = db.transaction(STORES.menuItems, 'readonly');
    const index = tx.objectStore(STORES.menuItems).index('categoryId');
    const items = await getAll<MenuItemRecord>(index, categoryId);
    return items.filter(
      (item) => item.isActive && (includeUnavailable || item.isAvailable),
    );
  }

  /**
   * A local availability edit ("نفد اليوم"). Persisted to the device now; a
   * later pull may overwrite it, and pushing availability upstream needs a sync
   * record type it does not yet have — tracked with the menu-edit direction
   * decision.
   */
  async setAvailability(itemId: string, isAvailable: boolean): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([STORES.menuItems, STORES.outbox], 'readwrite');
    const store = tx.objectStore(STORES.menuItems);
    const item = (await request(store.get(itemId))) as MenuItemRecord | undefined;
    if (item) {
      const now = new Date().toISOString();
      item.isAvailable = isAvailable;
      item.updatedAt = now;
      store.put(item);
      // Queued in the same transaction, so the website hears about it. It used
      // to stay on the till, and the website kept selling a sold-out dish.
      const change: AvailabilityChangeRecord = {
        id: newId(),
        itemId,
        isAvailable,
        changedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      enqueue(tx, 'availability', change);
    }
    await txDone(tx);
  }

  async getItem(id: string): Promise<MenuItemRecord | undefined> {
    const db = await this.db();
    const tx = db.transaction(STORES.menuItems, 'readonly');
    return request(
      tx.objectStore(STORES.menuItems).get(id) as IDBRequest<MenuItemRecord | undefined>,
    );
  }

  /**
   * A cashier price edit: move the item and queue the change, atomically. The
   * `PriceChange` is append-only history, so even an edit the server later
   * overrules stays visible in the trail.
   */
  async recordPriceEdit(change: PriceChangeRecord): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(
      [STORES.menuItems, STORES.priceChanges, STORES.outbox],
      'readwrite',
    );
    const itemStore = tx.objectStore(STORES.menuItems);
    const item = (await request(itemStore.get(change.itemId))) as MenuItemRecord | undefined;
    if (!item) {
      tx.abort();
      throw new Error(`Cannot record a price change for unknown item ${change.itemId}.`);
    }
    item.priceMinor = change.newPriceMinor;
    item.updatedAt = change.appliedAt;
    itemStore.put(item);
    tx.objectStore(STORES.priceChanges).put(change);
    enqueue(tx, 'price_change', change);
    await txDone(tx);
  }
}

export const menuRepository = new MenuRepository();
