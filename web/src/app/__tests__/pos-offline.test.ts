/**
 * The till's screens open without a network (batch 33).
 *
 * Found by the run-and-test pass: with the server stopped, «دفع» did not open
 * the payment screen. Moving between the till's screens makes the Next.js
 * router fetch the next screen's payload (`/pos/payment/index.txt?_rsc=…`)
 * and its page chunk; the service worker cached neither — only the `/pos`
 * page itself — so the fetch failed, Next fell back to a full load of the
 * payload's address, and the worker answered that with the order screen.
 * A cashier offline could take orders but not payment.
 *
 * These run the real worker (public/pos-sw.js) against fake caches and a
 * network that can be cut.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const WORKER = readFileSync(resolve(__dirname, '../../../public/pos-sw.js'), 'utf-8');
const ORIGIN = 'http://localhost:8765';

/** The till's routes, from the pages that exist: /pos/, /pos/payment/, … */
function tillRoutes(): string[] {
  const root = resolve(__dirname, '../(pos)/pos');
  const out: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === 'page.tsx') out.push(`/pos/${relative(root, dir).split('\\').join('/')}/`.replace(/\/+$/, '/').replace('/pos//', '/pos/'));
    }
  })(root);
  return out.sort();
}

class FakeCache {
  store = new Map<string, Response>();
  constructor(private readonly network: { fetch: (input: unknown) => Promise<Response> }) {}
  private key(input: unknown): string {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url: string }).url;
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
    const response = await this.network.fetch(input);
    if (!response.ok) throw new Error('add failed');
    await this.put(input, response);
  }
  async addAll(inputs: unknown[]) {
    for (const input of inputs) await this.add(input);
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  constructor(private readonly network: { fetch: (input: unknown) => Promise<Response> }) {}
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache(this.network));
    return this.caches.get(name)!;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  /** Every cached path, across caches. */
  paths(): string[] {
    return [...this.caches.values()].flatMap((cache) => [...cache.store.keys()]);
  }
}

/** The built pages, as the server would send them. */
function serverResponse(path: string): Response {
  const page = path.replace(/index\.txt$/, '');
  if (path.endsWith('index.txt')) {
    // An RSC payload names its client chunks without the /_next/ prefix.
    return new Response(`1:I["static/chunks/app/(pos)${page}page-abc.js"]\n2:"payload of ${page}"`, {
      headers: { 'content-type': 'text/plain' },
    });
  }
  if (path.startsWith('/_next/static/')) return new Response(`asset ${path}`);
  return new Response(
    `<html><head><link rel="stylesheet" href="/_next/static/css/app.css"/></head>` +
      `<body>page ${page}<script src="/_next/static/chunks/main-1.js"></script>` +
      `<script src="/_next/static/chunks/app/(pos)${page}page-abc.js"></script></body></html>`,
    { headers: { 'content-type': 'text/html' } },
  );
}

function boot() {
  const network = {
    online: true,
    fetch: async (input: unknown): Promise<Response> => {
      if (!network.online) throw new TypeError('Failed to fetch');
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url: string }).url;
      return serverResponse(new URL(raw, ORIGIN).pathname);
    },
  };
  const caches = new FakeCacheStorage(network);
  const handlers: Record<string, (event: unknown) => void> = {};
  const self = {
    location: new URL(`${ORIGIN}/pos-sw.js`),
    addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  vm.runInNewContext(WORKER, {
    self,
    caches,
    fetch: (input: unknown) => network.fetch(input),
    Response,
    URL,
    Promise,
    Set,
    Map,
    location: self.location,
    console,
  });

  const install = async () => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.install!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  const request = async (path: string, mode: 'navigate' | 'cors' = 'cors'): Promise<Response | null> => {
    let response: Promise<Response> | null = null;
    handlers.fetch!({
      request: { url: `${ORIGIN}${path}`, method: 'GET', mode, headers: new Headers() },
      respondWith: (p: Promise<Response>) => (response = p),
    });
    return response;
  };
  return { network, caches, install, request };
}

describe('the till’s routes', () => {
  it('are every page under /pos', () => {
    expect(tillRoutes()).toEqual(['/pos/', '/pos/menu/', '/pos/orders/', '/pos/payment/', '/pos/report/', '/pos/shift-close/', '/pos/sync/']);
  });
});

describe('installing the worker', () => {
  it('caches every till screen and the payload the router fetches to reach it', async () => {
    const { caches, install } = boot();
    await install();
    const cached = caches.paths();
    for (const route of tillRoutes()) {
      expect(cached, route).toContain(route);
      expect(cached, `${route}index.txt`).toContain(`${route}index.txt`);
    }
  });

  it('caches the code and style each screen names, its own page chunk included', async () => {
    const { caches, install } = boot();
    await install();
    const cached = caches.paths();
    expect(cached).toContain('/_next/static/chunks/main-1.js');
    expect(cached).toContain('/_next/static/css/app.css');
    expect(cached).toContain('/_next/static/chunks/app/(pos)/pos/payment/page-abc.js');
    expect(cached).toContain('/_next/static/chunks/app/(pos)/pos/shift-close/page-abc.js');
  });
});

describe('with the network down', () => {
  it('moves to the payment screen: its payload comes from the cache', async () => {
    const { network, install, request } = boot();
    await install();
    network.online = false;
    const response = await request('/pos/payment/index.txt?_rsc=HAtQJHiWnOV8MOhF');
    expect(response).not.toBeNull();
    expect(await response!.text()).toContain('payload of /pos/payment/');
  });

  it('opens a screen loaded by address as that screen, not the order screen', async () => {
    const { network, install, request } = boot();
    await install();
    network.online = false;
    for (const route of ['/pos/payment/', '/pos/orders', '/pos/shift-close/']) {
      const response = await request(route, 'navigate');
      const expected = route.endsWith('/') ? route : `${route}/`;
      expect(await response!.text(), route).toContain(`page ${expected}`);
    }
  });

  it("sends a full load of a payload's address to the screen itself", async () => {
    // Next falls back to loading the payload's address when its fetch fails;
    // the cashier must land on the screen, not on text or the order screen.
    const { network, install, request } = boot();
    await install();
    network.online = false;
    const response = await request('/pos/payment/index.txt', 'navigate');
    expect(response!.status).toBe(302);
    expect(new URL(response!.headers.get('location')!, ORIGIN).pathname).toBe('/pos/payment/');
  });

  it('serves a screen’s code from the cache', async () => {
    const { network, install, request } = boot();
    await install();
    network.online = false;
    const response = await request('/_next/static/chunks/app/(pos)/pos/payment/page-abc.js');
    expect(await response!.text()).toContain('asset');
  });
});

describe('with the network up', () => {
  it('serves the network and refreshes the cache by the payload’s address, not its query', async () => {
    const { caches, install, request } = boot();
    await install();
    const response = await request('/pos/orders/index.txt?_rsc=abc');
    expect(await response!.text()).toContain('payload of /pos/orders/');
    expect(caches.paths()).not.toContain('/pos/orders/index.txt?_rsc=abc');
  });

  it('leaves the API, the dashboard and the public page alone', async () => {
    const { install, request } = boot();
    await install();
    for (const path of ['/api/v1/sync/pull', '/manager/', '/r/wisam-al-sham/']) {
      expect(await request(path, 'navigate'), path).toBeNull();
    }
  });
});
