/**
 * No failure is silent, and none speaks in raw text.
 *
 * The review found mutations with no error handling at all: deactivating a
 * category, revoking a device or retiring a customer could fail and the
 * screen looked as though it had worked. It also found error states with
 * nothing to press, and errors rendered as `String(error)` or as the server's
 * English message (batch 12). These rules keep that from coming back.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

const SOURCES = files(ROOT).map((path) => ({ name: relative(ROOT, path), text: readFileSync(path, 'utf-8') }));

/** Each `useMutation({ ... })` call, as the text between its braces. */
function mutations(text: string): string[] {
  const found: string[] = [];
  let at = text.indexOf('useMutation(');
  while (at !== -1) {
    const open = text.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < text.length; end += 1) {
      if (text[end] === '{') depth += 1;
      if (text[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    found.push(text.slice(open, end + 1));
    at = text.indexOf('useMutation(', end);
  }
  return found;
}

describe('feedback rules', () => {
  it('scan the feature tree', () => {
    expect(SOURCES.length).toBeGreaterThan(30);
  });

  it('every failed mutation is reported', () => {
    // One place, so no screen can forget: the query client reports any
    // mutation that fails, unless the mutation says it shows its own error
    // (meta.inlineError) next to the form that caused it.
    const provider = readFileSync(resolve(ROOT, 'manager/QueryProvider.tsx'), 'utf-8');
    expect(provider).toMatch(/new MutationCache\(\{[\s\S]*onError/);
    expect(provider).toMatch(/inlineError/);
    expect(provider).toMatch(/<Toast\b/);
    expect(mutations(provider).length + SOURCES.filter((f) => mutations(f.text).length > 0).length).toBeGreaterThan(0);
  });

  it('every error state offers a retry', () => {
    const stuck = SOURCES.flatMap(({ name, text }) =>
      [...text.matchAll(/<ErrorState\b[^>]*?\/?>/gs)]
        .filter(([tag]) => !/\bonRetry=/.test(tag!))
        .map(() => name),
    );
    expect(stuck).toEqual([]);
  });

  it('a load failure says what went wrong, not "retry"', () => {
    // Seven screens showed a failed load as an empty state titled "إعادة
    // المحاولة", with nothing to press.
    const disguised = SOURCES.flatMap(({ name, text }) =>
      [...text.matchAll(/title=\{i18n\.t\('common\.retry'\)\}/g)].map(() => name),
    );
    expect(disguised).toEqual([]);
  });

  it('no screen renders raw error text', () => {
    const raw = SOURCES.flatMap(({ name, text }) =>
      [...text.matchAll(/String\((?:caught|error|err|e)\)|\.error\??\.message\b|\(caught as Error\)\.message|error\.message\b/g)].map(
        ([match]) => `${name}: ${match}`,
      ),
    );
    expect(raw).toEqual([]);
  });
});
