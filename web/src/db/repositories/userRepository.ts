/**
 * Cashiers, stored locally with a hashed PIN.
 *
 * These rows are pulled down and refreshed like the menu; the device never
 * uploads them. Authentication is `verify(id, pin)` against the stored hash —
 * offline, no server, no token.
 */
import { STORES } from '../schema';
import type { UserRecord } from '../records';
import { getAll, request, txDone } from '../idb';
import { verifyPin } from '../pin';
import { openDatabase } from '../open';

export class UserRepository {
  constructor(private readonly dbName?: string) {}

  private db(): Promise<IDBDatabase> {
    return openDatabase(this.dbName);
  }

  async upsertMany(users: UserRecord[]): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORES.users, 'readwrite');
    for (const user of users) tx.objectStore(STORES.users).put(user);
    await txDone(tx);
  }

  async get(id: string): Promise<UserRecord | undefined> {
    const db = await this.db();
    const tx = db.transaction(STORES.users, 'readonly');
    return request(tx.objectStore(STORES.users).get(id) as IDBRequest<UserRecord | undefined>);
  }

  async listActive(): Promise<UserRecord[]> {
    const db = await this.db();
    const tx = db.transaction(STORES.users, 'readonly');
    const all = await getAll<UserRecord>(tx.objectStore(STORES.users));
    return all.filter((user) => user.isActive);
  }

  /** Check a PIN against the stored hash. Returns the user only on a match. */
  async verify(id: string, pin: string): Promise<UserRecord | null> {
    const user = await this.get(id);
    if (!user || !user.isActive) return null;
    const ok = await verifyPin(pin, { pinHash: user.pinHash, pinSalt: user.pinSalt });
    return ok ? user : null;
  }
}

export const userRepository = new UserRepository();
