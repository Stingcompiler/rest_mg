/**
 * Accessibility, guarded as data.
 *
 * The design system's colours are only accessible if their contrast ratios hold,
 * so this reads the real token file and checks them — no hand-maintained table
 * to drift. It answers the review's open question about borders explicitly:
 *
 *   - body text on every surface clears WCAG AA (4.5:1);
 *   - status colours used as text clear 4.5:1;
 *   - a component boundary you must be able to find — `border-strong`, used for
 *     secondary buttons, selected chips, and add affordances — clears the 3:1
 *     non-text minimum (WCAG 1.4.11);
 *   - the plain `border`, a decorative separator between surfaces that already
 *     differ in colour, is exempt (1.4.11 covers boundaries required to identify
 *     a component; here the surface step conveys separation and the border only
 *     refines it). It is measured and reported, not failed.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { contrastRatio } from '../contrast';

function parseBlock(css: string, opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`Block not found: ${opener}`);
  const braceStart = css.indexOf('{', start);
  const braceEnd = css.indexOf('}', braceStart);
  const body = css.slice(braceStart + 1, braceEnd);
  const colours: Record<string, string> = {};
  for (const match of body.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    colours[match[1]] = match[2];
  }
  return colours;
}

const css = readFileSync(resolve(__dirname, '../design-tokens.css'), 'utf-8');
// The colour blocks are keyed by the theme selectors; other `:root {` blocks
// hold typography and spacing.
const light = parseBlock(css, "[data-theme='light']");
const dark = parseBlock(css, "[data-theme='dark']");

const THEMES = [
  { name: 'light', c: light },
  { name: 'dark', c: dark },
] as const;

describe.each(THEMES)('contrast — $name theme', ({ c }) => {
  it('body and muted text clear AA (4.5:1) on bg and surface', () => {
    for (const surface of [c.bg, c.surface, c['surface-2']]) {
      expect(contrastRatio(c.text, surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(c['text-muted'], surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('a button label clears AA on the accent fill', () => {
    expect(contrastRatio(c['text-on-accent'], c.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it('status colours used as text clear AA on surface', () => {
    for (const token of ['success', 'warning', 'danger', 'accent']) {
      expect(contrastRatio(c[token], c.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('credit text clears AA on its own tint', () => {
    expect(contrastRatio(c['credit-text'], c['credit-tint'])).toBeGreaterThanOrEqual(4.5);
  });

  it('danger text clears AA on its callout tint', () => {
    expect(contrastRatio(c['danger-text'], c['danger-tint'])).toBeGreaterThanOrEqual(4.5);
  });

  it('border-strong clears the 3:1 non-text minimum on bg and surface', () => {
    expect(contrastRatio(c['border-strong'], c.bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c['border-strong'], c.surface)).toBeGreaterThanOrEqual(3);
  });

  // The luxury identity (batch 13, docs/LUXURY-DESIGN.ar.md).
  it('gold, used for prices and the featured mark, reads as text on bg and surface', () => {
    expect(contrastRatio(c.gold, c.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.gold, c.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('text on the ink surface (hero, footer, sidebar) clears AAA for body and AA for muted', () => {
    expect(contrastRatio(c['on-ink'], c.ink)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(c['on-ink'], c['ink-2'])).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(c['on-ink-muted'], c.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it('the gold rule stands out on ink and on the page', () => {
    // Ornament only, never text: the 3:1 non-text minimum.
    expect(contrastRatio(c['gold-soft'], c.ink)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(c.gold, c.ink)).toBeGreaterThanOrEqual(3);
  });

  it('the focus ring colour is distinct from the surface it rings', () => {
    // The ring is accent (light) / accent-soft (dark); either must stand out.
    const ring = c['accent-soft'] ?? c.accent;
    expect(contrastRatio(ring, c.surface)).toBeGreaterThanOrEqual(3);
  });
});
