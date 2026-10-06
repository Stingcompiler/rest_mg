/**
 * The modern foundation (batch 18, docs/MODERN-DESIGN-REVIEW.ar.md).
 *
 * The luxury identity of batch 13 stays — ivory, ink, emerald, gold for
 * prices — but it moves from classic to modern:
 *   - titles in a geometric face (Readex Pro) instead of a calligraphic one;
 *   - the gold ornament kept for the hero alone, not after every title;
 *   - motion that has tokens, and stops for anyone who asked for less of it.
 * Nothing in the project honoured "reduce motion" before this batch.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../../../tailwind.config';

const SRC = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const tokens = read('styles/design-tokens.css');
const globals = read('app/globals.css');
const layout = read('app/layout.tsx');
const landing = read('features/landing/LandingClient.tsx');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

/** Source without comments, so prose about a class is not read as one. */
const FILES = sourceFiles(SRC).map((path) => ({
  name: relative(SRC, path),
  text: readFileSync(path, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1'),
}));

function hits(pattern: RegExp): string[] {
  return FILES.flatMap(({ name, text }) => [...text.matchAll(pattern)].map((m) => `${name}: ${m[0]}`));
}

describe('the display face', () => {
  it('is Readex Pro, a modern geometric face for Arabic and Latin', () => {
    expect(tokens).toMatch(/--font-display:\s*var\(--font-readex-pro\)/);
    expect(layout).toMatch(/Readex_Pro\(\{/);
  });

  it('sets every title at the one weight it downloads', () => {
    // Readex Pro is loaded at 600 alone. Any other weight on a title would be
    // faked by the browser from that face, and smeared.
    expect(layout).toMatch(/Readex_Pro\(\{[\s\S]*?weight:\s*\['600'\]/);
    const others = hits(/\bfont-display\b[^"`]*/g).filter((hit) => /\bfont-(?!display|semibold)[a-z]+\b/.test(hit));
    expect(others).toEqual([]);
  });

  it('no longer loads El Messiri', () => {
    expect(layout).not.toMatch(/El_Messiri/);
    // A comment may still name it; no font stack may.
    expect(tokens).not.toMatch(/var\(--font-el-messiri\)|'El Messiri'/);
  });
});

describe('the stacks (batch 27)', () => {
  it('put the Arabic face right behind the mono, for Arabic-Indic numerals', () => {
    expect(tokens).toMatch(/--font-numeric:\s*var\(--font-plex-mono\),\s*var\(--font-plex-arabic\)/);
    expect(tokens).toMatch(/--font-arabic:\s*var\(--font-plex-arabic\)/);
    expect(tokens).not.toMatch(/--font-cairo/);
  });
});

describe('motion', () => {
  it('has duration and easing tokens', () => {
    for (const name of ['--motion-instant', '--motion-fast', '--motion-base', '--motion-slow', '--ease-out']) {
      expect(tokens, name).toContain(`${name}:`);
    }
    const extend = config.theme?.extend ?? {};
    const durations = (extend.transitionDuration ?? {}) as Record<string, string>;
    for (const name of ['DEFAULT', 'instant', 'fast', 'base', 'slow']) {
      expect(durations[name], name).toMatch(/^var\(--motion-/);
    }
    const easing = (extend.transitionTimingFunction ?? {}) as Record<string, string>;
    expect(easing.DEFAULT).toBe('var(--ease-out)');
    expect(easing.out).toBe('var(--ease-out)');
  });

  it('uses only the tokens: no raw millisecond durations', () => {
    expect(hits(/(?<![\w-])duration-(?:\d+|\[[^\]]*\])(?![\w-])/g)).toEqual([]);
  });

  it('stops for anyone who asked the system for less motion', () => {
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(globals);
    expect(block, 'a prefers-reduced-motion block in globals.css').not.toBeNull();
    const body = block![1]!;
    expect(body).toMatch(/transition-duration:\s*[^;]*!important/);
    expect(body).toMatch(/animation-duration:\s*[^;]*!important/);
    expect(body).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it('never asks for a smooth scroll directly', () => {
    // An explicit `behavior: 'smooth'` overrides the CSS rule above, so the
    // page would still glide for a visitor who turned motion off.
    expect(hits(/behavior:\s*'smooth'/g)).toEqual([]);
  });
});

describe('ornament', () => {
  it('marks the hero alone', () => {
    const uses = hits(/<Ornament\b/g);
    expect(uses).toEqual(['features/landing/LandingClient.tsx: <Ornament']);
    // And it is the hero's: right under the restaurant's name.
    expect(landing).toMatch(/<h1[\s\S]{0,400}<Ornament\b/);
  });

  it('leaves section titles plain and aligned to the start', () => {
    const heading = /function SectionHeading[\s\S]*?\n\}/.exec(landing)?.[0] ?? '';
    expect(heading).toMatch(/<h2 className="[^"]*\bfont-display\b/);
    expect(heading).not.toMatch(/text-center|items-center/);
  });

  it('drops the gold rule from the footer', () => {
    const footer = /<footer[\s\S]*?<\/footer>/.exec(landing)?.[0] ?? '';
    expect(footer).not.toMatch(/bg-gold-soft/);
  });
});

describe('details', () => {
  it('draws every icon at one stroke weight', () => {
    expect(hits(/strokeWidth=\{/g)).toEqual([]);
  });

  it("shapes the landing skeleton like the cards it stands in for", () => {
    const skeleton = /function LandingSkeleton[\s\S]*?\n\}/.exec(landing)?.[0] ?? '';
    expect(skeleton).toMatch(/h-card-skeleton[^"]*\brounded-md\b/);
  });
});
