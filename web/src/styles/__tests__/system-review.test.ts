/**
 * One system, as measured in the review (batch 32, docs/UX-VISUAL-REVIEW.ar.md:
 * C1–C3, K4, T1).
 *
 *   - C1: `border-strong` is a border *width* here; written as if it were a
 *     colour, it left the border Tailwind's default grey #E5E7EB, the one
 *     colour from outside the palette on ten screens.
 *   - C2: counts dimmed with opacity read 3.19:1 where 4.5 is needed.
 *   - C3: tokens with two names for one colour.
 *   - K4: cards at 10px beside cards at 12px, and two names for "round".
 *   - T1: Arabic-Indic digits in English sentences.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import config from '../../../tailwind.config';
import { Button } from '@/components/primitives/controls';
import { SearchField } from '@/components/menu/menu';
import { defaultNumeralsFor, readNumerals } from '@/i18n/preferences';

const SRC = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const tokens = read('styles/design-tokens.css');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}
const FILES = sourceFiles(SRC).map((path) => ({ name: relative(SRC, path), text: readFileSync(path, 'utf-8') }));

const extend = config.theme?.extend ?? {};

describe('borders (C1)', () => {
  it('default to the palette’s border colour, never Tailwind’s grey', () => {
    const colours = (extend.borderColor ?? {}) as Record<string, string>;
    expect(colours.DEFAULT).toMatch(/--color-border/);
  });

  it('never use the strong width as if it were a colour', () => {
    const COLOUR = /(?<![\w-])(?:[a-z-]+:)*border-(?:line|line-strong|accent|danger|credit|warning|success|gold|gold-soft|ink|ink-2|transparent)(?![\w-])/;
    const offenders: string[] = [];
    for (const { name, text } of FILES) {
      for (const [literal] of text.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g)) {
        if (/(?<![\w:-])border-strong(?![\w-])/.test(literal) && !COLOUR.test(literal)) offenders.push(`${name}: ${literal.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('give the secondary button the strong line colour', () => {
    const html = renderToStaticMarkup(createElement(Button, { variant: 'secondary' }, 'x'));
    expect(html).toMatch(/\bborder-line-strong\b/);
  });
});

describe('text (C2)', () => {
  it('is never dimmed with opacity: a token says what colour it is', () => {
    const offenders = FILES.flatMap(({ name, text }) =>
      // A disabled control fades on purpose (and WCAG exempts it); text does not.
      [...text.matchAll(/(?<![\w:-])opacity-(?:70|75|80|85|90)(?![\w-])/g)].map(() => name),
    );
    expect(offenders).toEqual([]);
  });
});

describe('tokens (C3)', () => {
  it('have one name per colour', () => {
    // bg-rail was ink in both themes; surface-quiet was surface-3 but for a shade.
    for (const name of ['--color-bg-rail', '--color-surface-quiet']) expect(tokens).not.toContain(`${name}:`);
    const colours = (extend.colors ?? {}) as Record<string, Record<string, string>>;
    expect(colours.bg?.rail).toBeUndefined();
    expect(colours.surface?.quiet).toBeUndefined();
    for (const { name, text } of FILES) expect(text, name).not.toMatch(/bg-bg-rail|surface-quiet/);
  });
});

describe('corners (K4)', () => {
  it('have one name for round', () => {
    const radii = (extend.borderRadius ?? {}) as Record<string, string>;
    expect(radii.pill).toBeUndefined();
    expect(tokens).not.toContain('--radius-pill:');
    for (const { name, text } of FILES) expect(text, name).not.toMatch(/rounded-pill/);
  });

  it('give every card the card corner, 12px', () => {
    // The landing page's dishes stopped being cards in batch 35: a printed
    // menu's lines, and a featured dish's photo, which keeps the card corner.
    const landing = read('features/landing/LandingClient.tsx');
    expect(landing).toMatch(/<DishPhoto item=\{item\} className="[^"]*\brounded-lg\b/);
    expect(read('components/report/report.tsx')).toMatch(/flex flex-col gap-8 rounded-lg border border-line/);
  });
});

describe('numerals (T1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follow the language until someone chooses', () => {
    expect(defaultNumeralsFor('ar')).toBe('arabic-indic');
    expect(defaultNumeralsFor('en')).toBe('western');
    vi.stubGlobal('window', { localStorage: { getItem: () => null, setItem: () => {} } });
    expect(readNumerals('en')).toBe('western');
    expect(readNumerals('ar')).toBe('arabic-indic');
  });

  it('keep a choice once made', () => {
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => (key === 'sp-numerals' ? 'arabic-indic' : null), setItem: () => {} } });
    expect(readNumerals('en')).toBe('arabic-indic');
  });

  it('are worked out from the language in the provider', () => {
    expect(read('i18n/I18nProvider.tsx')).toMatch(/numeralsChoice \?\? defaultNumeralsFor\(locale\)/);
  });
});

describe('the till’s search field (found re-measuring)', () => {
  it('takes a tap anywhere in its box, and its input fills the box', () => {
    const html = renderToStaticMarkup(createElement(SearchField, { placeholder: 'x' }));
    expect(html).toMatch(/^<label class="[^"]*\bmin-h-control-md\b/);
    expect(html).toMatch(/<input class="[^"]*\bself-stretch\b/);
  });
});
