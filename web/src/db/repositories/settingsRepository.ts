/**
 * The two singleton key/value stores: `settings` (locale, numerals, theme,
 * device token, active shift) and `syncState` (pull cursor, last push time).
 *
 * The device token lives here, written once at enrolment. It authenticates the
 * tablet's sync uploads and is the only credential the device holds — the
 * cashier's PIN never becomes one.
 */
import { STORES, SYNC_STATE_KEYS } from '../schema';
import type { KeyValueRecord } from '../records';
import { request, txDone } from '../idb';
import { pendingCount } from '../outbox';
import { openDatabase } from '../open';

type StoreKind = typeof STORES.settings | typeof STORES.syncState;

class KeyValueRepository {
  constructor(
    private readonly store: StoreKind,
    private readonly dbName?: string,
  ) {}

  private db(): Promise<IDBDatabase> {
    return openDatabase(this.dbName);
  }

  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.db();
    const tx = db.transaction(this.store, 'readonly');
    const record = (await request(
      tx.objectStore(this.store).get(key),
    )) as KeyValueRecord<T> | undefined;
    return record?.value;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(this.store, 'readwrite');
    tx.objectStore(this.store).put({ key, value } satisfies KeyValueRecord<T>);
    await txDone(tx);
  }
}

export class SettingsRepository extends KeyValueRepository {
  constructor(dbName?: string) {
    super(STORES.settings, dbName);
  }
}

export class SyncStateRepository extends KeyValueRepository {
  constructor(private readonly name?: string) {
    super(STORES.syncState, name);
  }

  getPullCursor(): Promise<string | undefined> {
    return this.get<string>(SYNC_STATE_KEYS.lastPullCursor);
  }

  setPullCursor(cursor: string): Promise<void> {
    return this.set(SYNC_STATE_KEYS.lastPullCursor, cursor);
  }

  /** The unsynced-record count the cashier header always shows. */
  async pending(): Promise<number> {
    const db = await openDatabase(this.name);
    return pendingCount(db);
  }
}

export const settingsRepository = new SettingsRepository();
export const syncStateRepository = new SyncStateRepository();
