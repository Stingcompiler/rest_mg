/**
 * Density modes (batch 65, Design Reference §5).
 *
 * Three settings for the whole app: compact, default (what it has always
 * been), comfortable. They scale the **spacing** of lists, cards and sections
 * with one number, `--density`. What they must not touch: a control's size
 * (the 44px touch floor), a badge, a field, a chart.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_DENSITY, DENSITIES, isDensity, readDensity, writeDensity } from '@/i18n/preferences';
import { applyDensity } from '../density';

const SRC = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const css = read('styles/design-tokens.css');

describe('the preference', () => {
  it('has three modes, and default is what the app already looked like', () => {
    expect(DENSITIES).toEqual(['compact', 'default', 'comfortable']);
    expect(DEFAULT_DENSITY).toBe('default');
  });

  it('accepts only those three', () => {
    expect(isDensity('compact')).toBe(true);
    expect(isDensity('tiny')).toBe(false);
    expect(isDensity(null)).toBe(false);
  });

  it('reads the default where there is no storage, and never throws over a preference', () => {
    expect(readDensity()).toBe('default');
    expect(() => writeDensity('compact')).not.toThrow();
    expect(() => applyDensity('compact')).not.toThrow();
  });
});

describe('the tokens', () => {
  it('scale with one number: 1 by default, less when compact, more when comfortable', () => {
    expect(css).toMatch(/:root,\s*\n\[data-theme='light'\]\s*\{[\s\S]*?--density:\s*1;/);
    const compact = css.match(/\[data-density='compact'\]\s*\{[^}]*--density:\s*([\d.]+)/)?.[1];
    const comfortable = css.match(/\[data-density='comfortable'\]\s*\{[^}]*--density:\s*([\d.]+)/)?.[1];
    expect(Number(compact)).toBeLessThan(1);
    expect(Number(comfortable)).toBeGreaterThan(1);
  });

  it('keep today’s spacing at the default', () => {
    for (const [name, px] of [
      ['row', 12],
      ['row-lg', 14],
      ['card', 14],
      ['card-wide', 18],
      ['stack', 32],
    ] as const) {
      expect(css, name).toContain(`--density-${name}: calc(${px}px * var(--density));`);
    }
  });

  it('never touch a control, a badge or a field: no size token depends on density', () => {
    for (const line of css.split('\n').filter((l) => /--(control|size|badge|toggle)-/.test(l))) {
      expect(line).not.toContain('--density');
    }
  });

  it('are reachable as spacing utilities', () => {
    const tailwind = readFileSync(resolve(SRC, '../tailwind.config.ts'), 'utf-8');
    for (const name of ['row', 'row-lg', 'card', 'card-wide', 'stack']) {
      expect(tailwind, name).toContain(`'${name}': 'var(--density-${name})'`);
    }
  });
});

describe('where it takes effect', () => {
  it('lists, cards and sections use it', () => {
    expect(read('features/manager/StaffScreen.tsx')).toMatch(/border-b border-line py-row-lg/);
    expect(read('features/manager/CustomersScreen.tsx')).toMatch(/border-b border-line py-row-lg/);
    expect(read('features/manager/DevicesScreen.tsx')).toMatch(/border-b border-line py-row-lg/);
    expect(read('features/manager/ReportsScreen.tsx')).toMatch(/border-b border-line py-row\b/);
    expect(read('components/report/report.tsx')).toMatch(/border-b border-line py-row\b/);
    expect(read('components/report/report.tsx')).toMatch(/p-card sm:p-card-wide/);
    expect(read('features/manager/DashboardScreen.tsx')).toMatch(/flex flex-col gap-stack/);
  });
});

describe('the setting', () => {
  it('is stamped before the first paint, so the page never jumps', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toMatch(/sp-density/);
    expect(layout).toMatch(/data-density/);
  });

  it('is chosen in settings, kept, and applied from the theme provider', () => {
    const menu = read('components/settings/SettingsMenu.tsx');
    expect(menu).toMatch(/settings\.density/);
    expect(menu).toMatch(/theme\.setDensity\(/);
    const provider = read('theme/ThemeProvider.tsx');
    expect(provider).toMatch(/setDensity/);
    expect(provider).toMatch(/applyDensity\(/);
  });

  it('is named in both languages', () => {
    for (const locale of ['ar', 'en']) {
      const text = read(`i18n/messages/${locale}.json`);
      for (const key of ['settings.density', 'settings.density.compact', 'settings.density.default', 'settings.density.comfortable']) {
        expect(text, `${locale}: ${key}`).toContain(`"${key}"`);
      }
    }
  });
});
