/**
 * Customers on the device.
 *
 * Read-only as far as the till is concerned: the server owns the list and it
 * arrives with the menu pull. The till only needs to *name* who owes a credit
 * sale, which it must be able to do with the line down.
 */
import { STORES } from '../schema';
import type { CustomerRecord } from '../records';
import { getAll, txDone } from '../idb';
import { openDatabase } from '../open';

export class CustomerRepository {
  constructor(private readonly dbName?: string) {}

  private db() {
    return openDatabase(this.dbName);
  }

  /** Replace what the pull sent, leaving anything it did not mention alone. */
  async applyPull(customers: CustomerRecord[]): Promise<void> {
    if (customers.length === 0) return;
    const db = await this.db();
    const tx = db.transaction(STORES.customers, 'readwrite');
    const store = tx.objectStore(STORES.customers);
    for (const customer of customers) store.put(customer);
    await txDone(tx);
  }

  /** Active customers, by name. The picker shows these. */
  async list(): Promise<CustomerRecord[]> {
    const db = await this.db();
    const tx = db.transaction(STORES.customers, 'readonly');
    const all = await getAll<CustomerRecord>(tx.objectStore(STORES.customers).index('name'));
    return all.filter((customer) => customer.isActive);
  }
}

export const customerRepository = new CustomerRepository();
