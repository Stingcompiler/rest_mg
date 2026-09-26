/**
 * Opening the database and running the migration ladder.
 *
 * A single connection is shared per database name. `onupgradeneeded` replays
 * every rung above the installed version, in order, inside the one
 * `versionchange` transaction the browser provides — so a partial upgrade can
 * never commit: either the whole ladder to the target version applies, or none
 * of it does and the old database is untouched.
 */
import { MIGRATIONS } from './migrations';
import { DB_NAME, SCHEMA_VERSION } from './schema';

const connections = new Map<string, Promise<IDBDatabase>>();

export function openDatabase(name: string = DB_NAME, version: number = SCHEMA_VERSION): Promise<IDBDatabase> {
  const cacheKey = `${name}@${version}`;
  const existing = connections.get(cacheKey);
  if (existing) return existing;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const openRequest = indexedDB.open(name, version);

    openRequest.onupgradeneeded = (event) => {
      const db = openRequest.result;
      const tx = openRequest.transaction;
      if (!tx) {
        reject(new Error('No versionchange transaction on upgrade.'));
        return;
      }

      const from = event.oldVersion;
      for (const migration of MIGRATIONS) {
        if (migration.version > from && migration.version <= version) {
          migration.migrate(db, tx);
        }
      }
    };

    openRequest.onsuccess = () => {
      const db = openRequest.result;
      // Another tab opening a newer version must not be blocked by this one.
      db.onversionchange = () => db.close();
      resolve(db);
    };

    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onblocked = () =>
      reject(new Error('Database upgrade blocked by another open connection.'));
  });

  connections.set(cacheKey, opening);
  // A failed open must not poison the cache — the next caller should retry.
  opening.catch(() => connections.delete(cacheKey));
  return opening;
}

/** Test-only: drop cached connections so each test opens a clean database. */
export function resetConnectionsForTests(): void {
  connections.clear();
}
