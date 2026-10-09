/**
 * Stamps the build into the till's worker (batch 38).
 *
 * A browser installs a service worker again only when its file changes, and
 * public/pos-sw.js is the same in every build. Its install step caches every
 * till screen, so without a change a deploy never re-cached them: a screen not
 * opened online since ran offline as the old build. The build id in the cache
 * version makes each build a new worker, which caches the new build whole and
 * drops the old one. Runs after `next build`, on out/pos-sw.js.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LINE = /const VERSION = 'pos-shell-v2';/;

/** The worker's source with the build in its cache version. */
export function stampWorker(source, buildId) {
  const id = String(buildId).replace(/[^A-Za-z0-9_-]/g, '');
  if (!id) throw new Error('stamp-worker: no build id to stamp');
  if (!LINE.test(source)) throw new Error("stamp-worker: the worker has no `const VERSION = 'pos-shell-v2';` line");
  return source.replace(LINE, `const VERSION = 'pos-shell-v2-${id}';`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const buildId = readFileSync(resolve(web, '.next/BUILD_ID'), 'utf-8').trim();
  const worker = resolve(web, 'out/pos-sw.js');
  writeFileSync(worker, stampWorker(readFileSync(worker, 'utf-8'), buildId));
  console.log(`stamped out/pos-sw.js with build ${buildId}`);
}
