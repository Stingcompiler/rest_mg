/**
 * The font system (batch 70; Design Reference v2.3 §2 and D-0007).
 *
 * Decision B, an established-brand exception, recorded in docs/DECISIONS.md as
 * D-0013: IBM Plex Sans Arabic and IBM Plex Sans for text, IBM Plex Mono for
 * every numeral, and Readex Pro for the logo and for titles of 1.5rem and up.
 * Self-hosted, font-display: swap, a system-ui fallback, and no family outside
 * that list. Three variables: --font-ui, --font-mono, --font-display.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');
const WEB = resolve(SRC, '..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const css = read('styles/design-tokens.css');
const layout = read('app/layout.tsx');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__' && name !== 'gallery') walk(path, out);
    } else if (/\.(tsx?|css)$/.test(name)) out.push(path);
  }
  return out;
};
const sources = walk(SRC);

/** The weights a next/font call asks for. */
const weightsOf = (family: string): number[] => {
  const call = new RegExp(`${family}\\(\\{[\\s\\S]*?\\}\\);`).exec(layout)?.[0] ?? '';
  return [...(/weight:\s*\[([^\]]*)\]/.exec(call)?.[1] ?? '').matchAll(/'(\d+)'/g)].map((m) => Number(m[1]));
};

describe('the families', () => {
  it('are exactly Plex Sans Arabic, Plex Sans, Plex Mono and Readex Pro', () => {
    const imported = /import \{([^}]*)\} from 'next\/font\/google'/.exec(layout)?.[1]?.split(',').map((s) => s.trim()).filter(Boolean).sort();
    expect(imported).toEqual(['IBM_Plex_Mono', 'IBM_Plex_Sans', 'IBM_Plex_Sans_Arabic', 'Readex_Pro']);
  });

  it('keep to the weights the decision allows: text 400–600 (700 left out), Mono 400/500/600, Readex 600 only', () => {
    for (const family of ['IBM_Plex_Sans_Arabic', 'IBM_Plex_Sans']) {
      const weights = weightsOf(family);
      expect(weights.length, family).toBeGreaterThan(0);
      expect(weights.length, `${family} weights`).toBeLessThanOrEqual(4);
      for (const w of weights) expect([400, 500, 600, 700], `${family} ${w}`).toContain(w);
    }
    expect(weightsOf('IBM_Plex_Mono').every((w) => [400, 500, 600].includes(w))).toBe(true);
    expect(weightsOf('Readex_Pro')).toEqual([600]);
  });

  it('swap while loading, and fall back to the system face, not to a stand-in', () => {
    expect((layout.match(/display:\s*'swap'/g) ?? []).length).toBe(4);
    // next/font's fallback faces are families of their own in document.fonts.
    expect((layout.match(/adjustFontFallback:\s*false/g) ?? []).length).toBe(4);
    expect(css).toMatch(/--font-ui:[^;]*system-ui/);
  });
});

describe('the variables', () => {
  it('are three: --font-ui, --font-mono, --font-display', () => {
    const declared = [...css.matchAll(/^\s*(--font-[a-z-]+):/gm)].map((m) => m[1]);
    expect([...new Set(declared)].sort()).toEqual(['--font-display', '--font-mono', '--font-ui']);
  });

  it('are the only font names the theme offers', () => {
    const config = readFileSync(resolve(WEB, 'tailwind.config.ts'), 'utf-8');
    const block = /fontFamily:\s*\{([\s\S]*?)\},/.exec(config)?.[1] ?? '';
    expect([...block.matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]).sort()).toEqual(['display', 'mono', 'ui']);
  });

  it('are the only font families written anywhere else', () => {
    const offenders = sources
      .filter((f) => !f.endsWith('design-tokens.css'))
      .flatMap((f) => (readFileSync(f, 'utf-8').match(/font-family:\s*[^;`]*/g) ?? []).map((m) => `${f.replace(SRC, '')}: ${m}`))
      .filter((m) => !/var\(--font-(ui|mono|display)\)/.test(m));
    expect(offenders).toEqual([]);
  });
});

describe('weights in the components', () => {
  it('stop at 600: nothing is set bolder than the families carry', () => {
    const offenders = sources
      .filter((f) => f.endsWith('.tsx'))
      .flatMap((f) => (readFileSync(f, 'utf-8').match(/\bfont-(bold|extrabold|black|light|thin)\b/g) ?? []).map(() => f.replace(SRC, '')));
    expect(offenders).toEqual([]);
  });
});

/** Pixel sizes of the type tokens, by name. */
const px = (token: string) => Number(new RegExp(`--${token}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(css)?.[1]);

describe('the display face', () => {
  it('sets only the logo and titles of 24px and up', () => {
    const sizeOf = (cls: string): number | null => {
      const base = cls.split(/\s+/).find((c) => /^text-(ar|la|num|display)-/.test(c));
      return base ? px(`text-${base.replace(/^text-/, '')}`) : null;
    };
    const offenders: string[] = [];
    for (const file of sources.filter((f) => f.endsWith('.tsx'))) {
      const text = readFileSync(file, 'utf-8');
      for (const m of text.matchAll(/className=(?:"([^"]*)"|\{[^}]*?`([^`]*)`|\{cn\(([^)]*)\))/g)) {
        const cls = (m[1] ?? m[2] ?? m[3] ?? '').replace(/['"]/g, ' ');
        if (!/\bfont-display\b/.test(cls)) continue;
        const size = sizeOf(cls);
        if (size === null || size < 24) offenders.push(`${file.replace(SRC, '')}: ${cls.trim().slice(0, 80)}`);
      }
    }
    // The wordmark is the logo: the brand mark may be smaller.
    expect(offenders.filter((o) => !o.includes('components/primitives/indicators.tsx'))).toEqual([]);
  });
});

describe('the numeral rule', () => {
  const globals = read('app/globals.css');

  it('puts every numeral in Mono, tabular, left to right and isolated', () => {
    const rule = /\.numeric,\s*\.num,\s*\[data-num\]\s*\{([^}]*)\}/.exec(globals)?.[1] ?? '';
    expect(rule).toMatch(/font-family:\s*var\(--font-mono\)/);
    expect(rule).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(rule).toMatch(/direction:\s*ltr/);
    expect(rule).toMatch(/unicode-bidi:\s*isolate/);
  });
});

describe('the decision is recorded', () => {
  it('as D-0013, with the option chosen, the families and the weights', () => {
    const decisions = readFileSync(resolve(WEB, '../docs/DECISIONS.md'), 'utf-8');
    expect(decisions).toContain('D-0013');
    const entry = decisions.slice(decisions.indexOf('D-0013'));
    for (const word of ['ب', 'IBM Plex Sans Arabic', 'IBM Plex Mono', 'Readex Pro', '400', '600', 'swap']) expect(entry, word).toContain(word);
  });
});
