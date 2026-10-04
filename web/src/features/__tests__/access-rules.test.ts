/**
 * Every popup behaves as one, and every field has a name (batch 15).
 *
 * The review found the discount sheet, the phone cart, the customer picker,
 * the reference dialog, the catalog editor and the statement sheet drawn over
 * the page without taking focus or closing on Escape, and fields named only
 * by a placeholder, which a screen reader does not read as a name.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

const SOURCES = files(ROOT).map((path) => ({ name: relative(ROOT, path), text: readFileSync(path, 'utf-8') }));

describe('popups', () => {
  it('take focus and close on Escape wherever a backdrop is drawn', () => {
    const loose = SOURCES.filter(({ text }) => /bg-black\/50/.test(text)).filter(
      ({ text }) => !/useModalDialog\(/.test(text),
    );
    expect(loose.map(({ name }) => name)).toEqual([]);
  });

  it('announce themselves as dialogs', () => {
    const unnamed = SOURCES.filter(({ text }) => /bg-black\/50/.test(text)).filter(
      ({ text }) => !/role="dialog"/.test(text) || !/aria-modal="true"/.test(text),
    );
    expect(unnamed.map(({ name }) => name)).toEqual([]);
  });
});

describe('fields', () => {
  it('are named by more than a placeholder', () => {
    // A TextField or input with a placeholder must carry an aria-label, or
    // sit inside a <label> opened on one of the three lines above it.
    const nameless = SOURCES.flatMap(({ name, text }) => {
      const lines = text.split('\n');
      return lines.flatMap((line, index) => {
        if (!/<(TextField|input|textarea)\b/.test(line)) return [];
        const tag = lines.slice(index, index + 12).join(' ');
        const element = tag.slice(0, tag.indexOf('/>') + 2 || undefined);
        if (!/placeholder=/.test(element)) return [];
        if (/aria-label=|aria-labelledby=/.test(element)) return [];
        if (lines.slice(Math.max(0, index - 3), index).some((above) => /<label\b|<Field\b/.test(above))) return [];
        return [`${name}:${index + 1}`];
      });
    });
    expect(nameless).toEqual([]);
  });
});
