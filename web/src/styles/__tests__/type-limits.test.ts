/**
 * The small-size limits (batch 70, order B3; Design Reference §2).
 *
 * Plex Sans Arabic reads down to 14px; Plex Sans and Plex Mono down to 12px,
 * and a 12px line is set at 1.6 or more. Nothing is set smaller, and no
 * component writes a size or a family of its own: sizes come from the named
 * scale in design-tokens.css and are used through its classes.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');
const WEB = resolve(SRC, '..');
const css = readFileSync(resolve(SRC, 'styles/design-tokens.css'), 'utf-8');
const tailwind = readFileSync(resolve(WEB, 'tailwind.config.ts'), 'utf-8');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__' && name !== 'gallery') walk(path, out);
    } else if (name.endsWith('.tsx')) out.push(path);
  }
  return out;
};

/** Every `--text-<scale>-<step>: Npx` in the first (default) declaration of each. */
const sizes = new Map<string, number>();
for (const m of css.matchAll(/^\s*--(text-(?:ar|la|num|display)-[a-z0-9]+):\s*(\d+(?:\.\d+)?)px/gm)) if (!sizes.has(m[1]!)) sizes.set(m[1]!, Number(m[2]));

describe('the named scale', () => {
  it('has no size under 12px, and no Arabic size under 14px', () => {
    expect(sizes.size).toBeGreaterThan(20);
    for (const [name, size] of sizes) {
      expect(size, name).toBeGreaterThanOrEqual(12);
      if (name.startsWith('text-ar-')) expect(size, name).toBeGreaterThanOrEqual(14);
    }
  });

  it('sets its 12px steps at a line height of 1.6 or more', () => {
    const lineOf = (name: string) => {
      const step = name.replace('text-', '');
      const entry = new RegExp(`'${step}':\\s*\\['var\\(--text-${step}\\)',\\s*\\{\\s*lineHeight:\\s*'var\\(--leading-([a-z]+)\\)'`).exec(tailwind)?.[1];
      return Number(new RegExp(`--leading-${entry}:\\s*([\\d.]+)`).exec(css)?.[1]);
    };
    for (const [name, size] of sizes) if (size <= 12.5) expect(lineOf(name), name).toBeGreaterThanOrEqual(1.6);
  });
});

describe('the components', () => {
  it('write no size and no family of their own', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf-8');
      for (const m of text.matchAll(/\btext-\[\d|\bfont-\[|fontSize\s*:|fontFamily\s*:|font-size\s*:|font:\s*\d/g)) offenders.push(`${file.replace(SRC, '')}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
