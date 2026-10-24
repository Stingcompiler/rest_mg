/**
 * Every numeral is a numeral (batch 70, order B2; Design Reference §2, §11).
 *
 * Amounts, times, dates, identifiers, phones, codes, counters and step numbers
 * are set in `.numeric` (alias `.num`): Mono, tabular, left to right, isolated
 * from the Arabic around them. A number set as plain text breaks the column it
 * should line up in, and flips beside Arabic words.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__' && name !== 'gallery') walk(path, out);
    } else if (name.endsWith('.tsx')) out.push(path);
  }
  return out;
};
const files = walk(SRC);

/** A number rendered straight into an element: that element must be a numeral. */
const NUMBER_CALL =
  '(?:i18n\\.(?:money|int)|formatTime|formatDate|money|int)\\(|[\\w.?]+\\.(?:phone|whatsapp|number|reference|code|username)\\s*\\}';
const CHILD = new RegExp(`(<[A-Za-z][\\w.]*(?:[^<>]|=>|\\{[^{}]*\\})*>)\\s*\\{\\s*(?:${NUMBER_CALL})`, 'g');
const IS_NUMERAL = /numeric|Numeric|data-num|\bnum\b/;

describe('a number set into the page', () => {
  it('sits in an element that is a numeral', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf-8');
      for (const m of text.matchAll(CHILD)) {
        if (!IS_NUMERAL.test(m[1]!)) offenders.push(`${file.replace(SRC, '')}:${text.slice(0, m.index).split('\n').length}  ${m[1]!.replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
    // The scan reads every component with a backtracking pattern: allow it time on a busy machine.
  }, 30_000);
});

describe('a numeric column', () => {
  it('lines up on its end: a table cell holding a number is aligned to the end', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf-8');
      for (const m of text.matchAll(/<t[dh]\b([^>]*)>\s*\{[^}]*(?:money|int|number)\(/g)) {
        if (!/text-end|numeric|Numeric/.test(m[1]!)) offenders.push(`${file.replace(SRC, '')}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
