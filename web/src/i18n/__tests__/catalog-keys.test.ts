/**
 * Each message is defined once.
 *
 * JSON lets a key appear twice and keeps the last, silently. Batch 22 added
 * `manager.profile.description` for the page's one-line description while the
 * same key already labelled the restaurant's description field, so the
 * profile page described itself as «الوصف القصير» (found in batch 23).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe.each(['ar', 'en'])('%s.json', (locale) => {
  it('defines every key once', () => {
    const text = readFileSync(resolve(__dirname, `../messages/${locale}.json`), 'utf-8');
    const keys = [...text.matchAll(/^\s*"([^"]+)"\s*:/gm)].map((match) => match[1]!);
    const twice = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(twice).toEqual([]);
  });
});
