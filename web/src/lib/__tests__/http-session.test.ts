/**
 * The session client: the CSRF header on writes, and renewing a session that
 * another tab has just renewed.
 *
 * Cookie-authenticated writes now need Django's CSRF token, which the client
 * reads from the `csrftoken` cookie and sends as `X-CSRFToken`. And a refresh
 * token is spent once used: when two tabs renew at the same moment, the second
 * presents a token the first just spent and is refused — but the browser
 * already holds the replacement, so one more try succeeds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithSession, refreshSession } from '../http';

type Call = { url: string; init: RequestInit };

function stubFetch(statuses: number[]): Call[] {
  const calls: Call[] = [];
  const queue = [...statuses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return new Response(null, { status: queue.shift() ?? 200 });
    }),
  );
  return calls;
}

function header(call: Call | undefined, name: string): string | null {
  return new Headers(call?.init.headers).get(name);
}

beforeEach(() => {
  vi.stubGlobal('document', { cookie: 'theme=dark; csrftoken=tok%2Fen; other=1' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the CSRF header', () => {
  it('rides on every write', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const calls = stubFetch([200]);
      await fetchWithSession('/api/v1/catalog/items/', { method, headers: { 'Content-Type': 'application/json' } });
      expect(header(calls[0], 'X-CSRFToken')).toBe('tok/en');
      expect(header(calls[0], 'Content-Type')).toBe('application/json');
    }
  });

  it('is not sent on a read', async () => {
    const calls = stubFetch([200]);
    await fetchWithSession('/api/v1/catalog/items/');
    expect(header(calls[0], 'X-CSRFToken')).toBeNull();
  });

  it('rides on a multipart upload too', async () => {
    const calls = stubFetch([200]);
    await fetchWithSession('/api/v1/catalog/items/1/image/', { method: 'POST', body: new FormData() });
    expect(header(calls[0], 'X-CSRFToken')).toBe('tok/en');
  });

  it('is left off when there is no token cookie yet', async () => {
    vi.stubGlobal('document', { cookie: 'theme=dark' });
    const calls = stubFetch([200]);
    await fetchWithSession('/api/v1/auth/login/', { method: 'POST' });
    expect(header(calls[0], 'X-CSRFToken')).toBeNull();
  });
});

describe('refreshSession', () => {
  it('tries once more when another tab spent the refresh token first', async () => {
    const calls = stubFetch([401, 200]);
    expect(await refreshSession()).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('gives up after the second refusal', async () => {
    const calls = stubFetch([401, 401]);
    expect(await refreshSession()).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it('does not retry a refresh that worked', async () => {
    const calls = stubFetch([200]);
    expect(await refreshSession()).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
