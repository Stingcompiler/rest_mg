/**
 * Every spacing, radius and shadow class resolves to a design token.
 *
 * The spacing scale here is in pixels (`p-16` is 16px), and it replaces only
 * the numbers it names. Any other number silently falls back to Tailwind's own
 * rem scale, which is four times larger: `py-40` was 160px of padding above and
 * below every section of the public page, where 40px was meant. The opposite
 * mistake hides inside the scale: `h-16` reads as 64px to anyone who knows
 * Tailwind and is 16px here, which is how the phone's cart bar and the catalog
 * thumbnails came out a quarter of their size. Found in the design review
 * (batch 9).
 *
 * The same holds for radius and shadow names the theme does not define:
 * `rounded-2xl` and `shadow-xl` are Tailwind's values, not ours, and drift from
 * the system without anyone choosing it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../../../tailwind.config';

const SRC = resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** The file without comments, so prose about a class is not read as one. */
function code(path: string): string {
  return readFileSync(path, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Names this file imports from lucide-react, aliases included. */
function iconNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const [, list] of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'lucide-react'/g)) {
    for (const part of list!.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  return names;
}

const FILES = sourceFiles(SRC).map((path) => {
  const text = code(path);
  return { name: relative(SRC, path), text, icons: iconNames(text) };
});

const extend = config.theme?.extend ?? {};
const spacingKeys = new Set(Object.keys((extend.spacing ?? {}) as Record<string, string>));
const radiusKeys = new Set(Object.keys((extend.borderRadius ?? {}) as Record<string, string>));
const shadowKeys = new Set(Object.keys((extend.boxShadow ?? {}) as Record<string, string>));

const SPACING_UTILITIES = [
  'p', 'px', 'py', 'pt', 'pb', 'ps', 'pe',
  'm', 'mx', 'my', 'mt', 'mb', 'ms', 'me',
  'gap', 'gap-x', 'gap-y', 'space-x', 'space-y',
  'w', 'h', 'size', 'min-w', 'min-h', 'max-h', 'basis',
  'top', 'bottom', 'start', 'end', 'inset', 'inset-x', 'inset-y',
];
const BOX_UTILITIES = new Set(['w', 'h', 'size', 'min-w', 'min-h', 'max-h']);

const NUMERIC_CLASS = new RegExp(
  `(?<![\\w-])-?(${SPACING_UTILITIES.map((u) => u.replace('-', '\\-')).join('|')})-(\\d+(?:\\.\\d+)?)(?![\\w.%-])`,
  'g',
);

function findAll(
  pattern: RegExp,
  pick: (match: RegExpMatchArray, file: (typeof FILES)[number]) => string | null,
): string[] {
  return FILES.flatMap((file) =>
    [...file.text.matchAll(pattern)].map((match) => pick(match, file)).filter((hit): hit is string => hit !== null).map((hit) => `${file.name}: ${hit}`),
  );
}

describe('spacing classes', () => {
  it('scans the source tree', () => {
    expect(FILES.length).toBeGreaterThan(40);
    expect(spacingKeys.has('16')).toBe(true);
  });

  it('use only numbers the token scale defines', () => {
    const offScale = findAll(NUMERIC_CLASS, ([whole, , value]) =>
      value === '0' || spacingKeys.has(value!) ? null : whole.trim(),
    );
    expect(offScale).toEqual([]);
  });

  it('size a box (16px and up) by a named dimension, not a scale number', () => {
    // Below 16 a number is a hairline, a dot or a bar, and reads the same in
    // either scale. From 16 up it is a box, and the two readings part by 4×.
    const ambiguous = findAll(NUMERIC_CLASS, ([whole, utility, value]) =>
      BOX_UTILITIES.has(utility!) && Number(value) >= 16 ? whole.trim() : null,
    );
    expect(ambiguous).toEqual([]);
  });
});

describe('radius and shadow classes', () => {
  it('use radius names the theme defines', () => {
    // A bare `rounded` followed by an operator is a prop of that name, not a class.
    const pattern =
      /(?<![\w-])rounded(?:-(t|b|s|e|l|r|tl|tr|bl|br|ss|se|es|ee))?(?:-([a-z0-9]+))?(?![\w-])(?!\s*(?:&&|\?|=|,|\)|:))/g;
    const stray = findAll(pattern, ([whole, , size]) => {
      if (size === 'full' || size === 'none') return null;
      return size && radiusKeys.has(size) ? null : whole;
    });
    expect(stray).toEqual([]);
  });

  it('use shadow names the theme defines', () => {
    const pattern = /(?<![\w-])shadow(?:-([a-z0-9]+))?(?![\w-])/g;
    const stray = findAll(pattern, ([whole, size]) =>
      size === 'none' || (size && shadowKeys.has(size)) ? null : whole,
    );
    expect(stray).toEqual([]);
  });
});

describe('type classes', () => {
  it('use no arbitrary font size', () => {
    const pattern = /(?<![\w-])text-\[[\d.]+(?:px|rem|em)\]/g;
    expect(findAll(pattern, ([whole]) => whole)).toEqual([]);
  });

  it('use line heights the theme defines', () => {
    // `leading-tight` is Tailwind's 1.25, too close for a two-line Arabic title.
    const leading = new Set(Object.keys((extend.lineHeight ?? {}) as Record<string, string>));
    const pattern = /(?<![\w-])leading-([a-z0-9]+)(?![\w-])/g;
    expect(findAll(pattern, ([whole, name]) => (leading.has(name!) ? null : whole))).toEqual([]);
  });
});

describe('icon-only buttons', () => {
  it('go through IconButton, which keeps the 44px touch floor', () => {
    // A bare <button> around one icon is as small as the icon: 22px for a back
    // arrow, 16px for the cart's delete. IconButton carries the floor.
    const pattern = /<button\b(?:=>|[^>])*>\s*<([A-Z]\w*)\b(?:=>|[^>])*\/>\s*<\/button>/g;
    const bare = findAll(pattern, ([, child], file) =>
      file.icons.has(child!) ? `<button><${child} /></button>` : null,
    );
    expect(bare).toEqual([]);
  });
});
