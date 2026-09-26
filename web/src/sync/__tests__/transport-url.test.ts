/**
 * The sync transport's URLs must work same-origin.
 *
 * In the monolith the API shares the origin, so `baseUrl` is empty and every
 * path is relative. Building that with `new URL(path)` throws for want of a
 * base — which it did, on every pull, after the push had already succeeded. The
 * run was reported as a failure, the till showed "offline" on a working line,
 * and no amount of checking the network explained it.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { HttpSyncTransport } from '../transport';

const okJson = () =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ cursor: '2026-08-19T00:00:00Z', full_snapshot: false, categories: [], items: [], profile: null }),
  } as unknown as Response);

let calls: string[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    calls.push(String(input));
    return okJson();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pull with a same-origin base', () => {
  it('does not throw on a relative path', async () => {
    const transport = new HttpSyncTransport('');
    await expect(transport.pull('', null)).resolves.toBeDefined();
    expect(calls[0]).toBe('/api/v1/sync/pull/');
  });

  it('carries the cursor as a query parameter', async () => {
    const transport = new HttpSyncTransport('');
    await transport.pull('', '2026-08-19T10:00:00Z');
    expect(calls[0]).toBe('/api/v1/sync/pull/?since=2026-08-19T10%3A00%3A00Z');
  });

  it('still works against an absolute base, for a device shell', async () => {
    const transport = new HttpSyncTransport('https://pos.example');
    await transport.pull('', null);
    expect(calls[0]).toBe('https://pos.example/api/v1/sync/pull/');
  });

  it('pushes to a relative path too', async () => {
    const transport = new HttpSyncTransport('');
    await transport.push('', { batch_id: 'b', records: [] });
    expect(calls[0]).toBe('/api/v1/sync/push/');
  });
});
