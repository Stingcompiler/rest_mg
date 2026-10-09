/**
 * Every deploy re-caches the whole till (batch 38).
 *
 * The till's worker caches every screen when it installs (batch 33), but a
 * browser installs a worker again only when its file changes, and
 * public/pos-sw.js is the same file in every build. After a deploy, a screen
 * not opened online since then ran offline as the old build; if that deploy
 * had added a step to the local database's migrations, the old code could not
 * open the database at all. Now the build stamps its id into the worker's
 * cache version, so each deploy is a new worker: it caches the new build whole
 * and drops the old one.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { stampWorker } from '../../../scripts/stamp-worker.mjs';

const WEB = resolve(__dirname, '../../..');
const WORKER = readFileSync(resolve(WEB, 'public/pos-sw.js'), 'utf-8');
const pkg = JSON.parse(readFileSync(resolve(WEB, 'package.json'), 'utf-8')) as { scripts: Record<string, string> };

describe('stamping the worker', () => {
  it('puts the build into the cache version', () => {
    const stamped = stampWorker(WORKER, 'np21_0vPz8SbT46eIRkO2');
    expect(stamped).toContain("const VERSION = 'pos-shell-v2-np21_0vPz8SbT46eIRkO2';");
    expect(stamped).not.toContain("const VERSION = 'pos-shell-v2';");
  });

  it('keeps only safe characters from the build id', () => {
    expect(stampWorker(WORKER, "a'b;c/d e")).toContain("const VERSION = 'pos-shell-v2-abcde';");
  });

  it('refuses a worker it cannot stamp, rather than ship one unstamped', () => {
    expect(() => stampWorker('const OTHER = 1;', 'abc')).toThrow(/VERSION/);
    expect(() => stampWorker(WORKER, '')).toThrow(/build id/);
  });

  it('runs on every build, after Next has written the export', () => {
    expect(pkg.scripts.build).toBe('next build && node scripts/stamp-worker.mjs');
  });
});

describe('a stamped worker taking over', () => {
  it('drops every other build’s caches, keeps its own, and leaves caches not its kind alone', async () => {
    // "newer" starts with "new": only exact names count as this build's.
    const names = new Set(['pos-shell-v2-shell', 'pos-shell-v2-old-shell', 'pos-shell-v2-old-assets', 'pos-shell-v2-newer-shell', 'pos-shell-v2-new-shell', 'pos-shell-v2-new-assets', 'other-app']);
    const caches = {
      keys: async () => [...names],
      delete: async (name: string) => names.delete(name),
      open: async () => ({}),
    };
    const handlers: Record<string, (event: unknown) => void> = {};
    vm.runInNewContext(stampWorker(WORKER, 'new'), {
      self: { addEventListener: (type: string, fn: (event: unknown) => void) => (handlers[type] = fn), clients: { claim: async () => {} }, location: new URL('http://localhost/pos-sw.js') },
      caches,
      URL,
      Promise,
      Set,
      Response,
    });
    let done: Promise<unknown> = Promise.resolve();
    handlers.activate!({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect([...names].sort()).toEqual(['other-app', 'pos-shell-v2-new-assets', 'pos-shell-v2-new-shell']);
  });
});
