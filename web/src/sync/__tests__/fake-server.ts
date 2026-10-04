/**
 * A fake Django, for exercising the sync engine without a network.
 *
 * It enforces the one property the whole design leans on: idempotency by uuid. A
 * record it has already seen returns `duplicate`; a new one returns `accepted`.
 * It can be told to drop the connection after N records — writing those N but
 * never returning a response — to simulate a mid-batch failure.
 */
import { SyncHttpError, type PushEnvelope, type PushResponse, type PullResponse, type SyncTransport } from '../transport';

export class FakeServer implements SyncTransport {
  /** uuids the server has durably written. Each appears once — that is the test. */
  readonly seen = new Set<string>();
  readonly rejectIds = new Set<string>();
  /** Refuse every record, as a server does for a payload it cannot ever accept. */
  rejectAll = false;
  /** When set, throw after writing this many records of the next push. */
  dropAfter: number | null = null;
  pullCount = 0;
  private catalog: { categories: unknown[]; items: unknown[] } = { categories: [], items: [] };
  customers: unknown[] = [];
  /** Customer delivery orders the server says are still waiting. */
  pendingDeliveries: unknown[] = [];
  /** The restaurant profile the pull carries, or null when unchanged. */
  profile: unknown = null;
  /** Till orders the kitchen has marked ready. */
  kitchenReady: unknown[] = [];
  /** Answer the next push with this HTTP status, as an expired session does. */
  failPushWith: number | null = null;

  seedCatalog(categories: unknown[], items: unknown[]): void {
    this.catalog = { categories, items };
  }

  async push(_token: string, envelope: PushEnvelope): Promise<PushResponse> {
    if (this.failPushWith !== null) {
      const status = this.failPushWith;
      this.failPushWith = null;
      throw new SyncHttpError('push', status);
    }
    const results = [];
    for (let index = 0; index < envelope.records.length; index += 1) {
      if (this.dropAfter !== null && index >= this.dropAfter) {
        // The records before this point are written; the client never hears back.
        this.dropAfter = null;
        throw new Error('connection dropped');
      }
      const record = envelope.records[index];
      if (this.rejectAll || this.rejectIds.has(record.id)) {
        results.push({ id: record.id, status: 'rejected' as const, reason: 'invalid' });
        continue;
      }
      const status = this.seen.has(record.id) ? ('duplicate' as const) : ('accepted' as const);
      this.seen.add(record.id);
      results.push({ id: record.id, status });
    }
    return { batch_id: envelope.batch_id, server_time: new Date().toISOString(), results };
  }

  async pull(_token: string, since: string | null): Promise<PullResponse> {
    this.pullCount += 1;
    return {
      cursor: new Date().toISOString(),
      full_snapshot: since === null,
      categories: this.catalog.categories,
      items: this.catalog.items,
      customers: this.customers,
      pending_deliveries: this.pendingDeliveries,
      kitchen_ready: this.kitchenReady,
      profile: this.profile,
    };
  }
}
