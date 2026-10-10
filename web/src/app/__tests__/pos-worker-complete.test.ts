/**
 * A new till worker takes over only once it has the whole till (batch 44).
 *
 * Review of 10 October, F04: the worker's install step ignored every failed
 * download, then took over and — since batch 38 stamps each build — deleted
 * the previous build's caches. An install on a flaky line left a worker with
 * the order screen and no payment screen or its code, and nothing to go back
 * to. Now a failed download fails the install (the browser keeps the old
 * worker and its caches, and tries again later), and the build before stays
 * cached so a page still running it keeps finding its code.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { stampWorker } from '../../../scripts/stamp-worker.mjs';

const SOURCE = readFileSync(resolve(__dirname, '../../../public/pos-sw.js'), 'utf-8');
const ORIGIN = 'http://localhost:8765';

class FakeCache {
  store = new Map<string, Response>();
  private key(input: unknown) {
    const raw = typeof input === 'string' ? input : (input as { url: string }).url;
    const url = new URL(raw, ORIGIN);
    return url.pathname + url.search;
  }
  async match(input: unknown) {
    return this.store.get(this.key(input))?.clone();
  }
  async put(input: unknown, response: Response) {
    this.store.set(this.key(input), response.clone());
  }
  async add(input: unknown) {
    throw new Error(`add ${String(input)}`);
  }
}

function harness(build: string, failing: (path: string) => boolean, storage = new Map<string, FakeCache>()) {
  const caches = {
    open: async (name: string) => {
      if (!storage.has(name)) storage.set(name, new FakeCache());
      return storage.get(name)!;
    },
    keys: async () => [...storage.keys()],
    delete: async (name: string) => storage.delete(name),
    match: async (input: unknown) => {
      for (const cache of storage.values()) {
        const hit = await cache.match(input);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const fetch = async (input: unknown) => {
    const raw = typeof input === 'string' ? input : (input as { url: string }).url;
    const path = new URL(raw, ORIGIN).pathname;
    if (failing(path)) throw new TypeError('Failed to fetch');
    if (path.endsWith('index.txt')) return new Response(`1:I["static/chunks/app/(pos)${path.replace('index.txt', '')}page-${build}.js"]`);
    if (path.startsWith('/_next/')) return new Response(`asset ${path}`);
    return new Response(`<script src="/_next/static/chunks/main-${build}.js"></script>`);
  };
  const handlers: Record<string, (event: unknown) => void> = {};
  vm.runInNewContext(stampWorker(SOURCE, build), {
    self: { location: new URL(`${ORIGIN}/pos-sw.js`), addEventListener: (t: string, f: (e: unknown) => void) => (handlers[t] = f), skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches, fetch, Response, URL, Promise, Set, Map, JSON, console,
  });
  const run = async (type: string) => {
    let done: Promise<unknown> = Promise.resolve();
    handlers[type]!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    return done;
  };
  const request = async (path: string) => {
    let response: Promise<Response> | null = null;
    handlers.fetch!({ request: { url: `${ORIGIN}${path}`, method: 'GET', mode: 'cors' }, respondWith: (p: Promise<Response>) => (response = p) });
    return response;
  };
  return { storage, run, request };
}

describe('installing a new build', () => {
  it('fails, rather than take over, when a screen or its code did not download', async () => {
    const { run } = harness('b2', (path) => path.startsWith('/pos/payment/') || path.includes('page-b2'));
    await expect(run('install')).rejects.toThrow();
  });

  it('succeeds when everything downloaded (the manifest may be missing)', async () => {
    const { run } = harness('b2', (path) => path === '/manifest.webmanifest');
    await expect(run('install')).resolves.not.toThrow();
  });
});

describe('taking over from the build before', () => {
  it('keeps the previous build’s code, so a page still running it finds it', async () => {
    const old = harness('b1', () => false);
    await old.run('install');
    await old.run('activate');
    const next = harness('b2', () => false, old.storage);
    await next.run('install');
    await next.run('activate');
    const names = [...old.storage.keys()];
    expect(names).toContain('pos-shell-v2-b2-shell');
    expect(names).toContain('pos-shell-v2-b2-assets');
    expect(names).toContain('pos-shell-v2-b1-assets');
    expect(names).not.toContain('pos-shell-v2-b1-shell');
    const offline = harness('b2', () => true, old.storage);
    const response = await offline.request('/_next/static/chunks/main-b1.js');
    expect(await response!.text()).toContain('main-b1');
  });

  it('keeps no more than the build before', async () => {
    const storage = new Map<string, FakeCache>();
    for (const build of ['b1', 'b2', 'b3']) {
      const h = harness(build, () => false, storage);
      await h.run('install');
      await h.run('activate');
    }
    const assets = [...storage.keys()].filter((n) => n.endsWith('-assets')).sort();
    expect(assets).toEqual(['pos-shell-v2-b2-assets', 'pos-shell-v2-b3-assets']);
  });
});
