import { fetchWithSession } from '@/lib/http';

/**
 * The network seam for sync.
 *
 * The cashier tablet talks to Django *directly*, with its device token — not
 * through the Next `/api` proxy, which exists for the manager dashboard. The
 * engine codes against this interface so it can be tested against a fake server
 * that simulates idempotency and a dropped connection.
 */
export interface PushRecord {
  type: string;
  id: string;
  updated_at?: string;
  payload: Record<string, unknown>;
}

export interface PushEnvelope {
  batch_id: string;
  records: PushRecord[];
}

export interface PushResult {
  id: string;
  status: 'accepted' | 'duplicate' | 'rejected';
  reason?: unknown;
}

export interface PushResponse {
  batch_id: string;
  server_time: string;
  results: PushResult[];
}

export interface PullResponse {
  cursor: string;
  full_snapshot: boolean;
  categories: unknown[];
  items: unknown[];
  /** Optional so an older server that does not send them still works. */
  customers?: unknown[];
  pending_deliveries?: unknown[];
  profile: unknown;
}

export interface SyncTransport {
  push(token: string, envelope: PushEnvelope): Promise<PushResponse>;
  pull(token: string, since: string | null): Promise<PullResponse>;
}

// Same origin by default — Django serves the app and the API together. A remote
// override (NEXT_PUBLIC_API_URL) is for a device shell pointed at a hosted server.
const SYNC_BASE_URL = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || '';

/**
 * The real transport. A network failure rejects — the engine treats that as
 * "offline, try again later", never as data loss.
 *
 * Requests go through `fetchWithSession`, which renews an expired access token
 * once and retries. Background sync is exactly the thing still running when a
 * token quietly expires mid-shift, and a 401 there would look like "offline"
 * forever while the till kept taking orders.
 */
export class HttpSyncTransport implements SyncTransport {
  constructor(private readonly baseUrl: string = SYNC_BASE_URL) {}

  /**
   * A device token when the tablet has one; otherwise nothing, and the
   * signed-in cashier's cookies authenticate the sync instead. Either is a
   * valid principal on the server.
   */
  private headers(token: string): HeadersInit {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Device ${token}`;
    return headers;
  }

  async push(token: string, envelope: PushEnvelope): Promise<PushResponse> {
    const response = await fetchWithSession(`${this.baseUrl}/api/v1/sync/push/`, {
      method: 'POST',
      headers: this.headers(token),
      body: JSON.stringify(envelope),
    });
    if (!response.ok) throw new Error(`push failed: ${response.status}`);
    return response.json();
  }

  async pull(token: string, since: string | null): Promise<PullResponse> {
    // Built as a plain string, not through `new URL()`.
    //
    // In the monolith `baseUrl` is empty — the API is same-origin — so the path
    // is relative, and `new URL('/api/v1/sync/pull/')` throws for want of a
    // base. That threw on *every* run, after the push had already succeeded, so
    // the till synced its orders and then reported itself offline anyway. The
    // badge said "no connection" on a perfect line, for the life of the app.
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    const response = await fetchWithSession(`${this.baseUrl}/api/v1/sync/pull/${query}`, {
      method: 'GET',
      headers: this.headers(token),
    });
    if (!response.ok) throw new Error(`pull failed: ${response.status}`);
    return response.json();
  }
}
