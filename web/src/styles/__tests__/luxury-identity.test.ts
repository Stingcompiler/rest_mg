/**
 * The luxury identity reaches every surface it was planned for.
 *
 * The plan (docs/LUXURY-DESIGN.ar.md, batch 13): titles in the display face,
 * prices and ornaments in gold, an ink surface to close the public page and
 * to hold the manager's sidebar, and the till left fast and plain. These pin
 * each of those, so a later edit cannot quietly undo one.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../../../tailwind.config';

const SRC = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const tokens = read('styles/design-tokens.css');
const landing = read('features/landing/LandingClient.tsx');
const shell = read('features/manager/ManagerShell.tsx');

describe('tokens', () => {
  it('define the display face, gold and ink', () => {
    expect(tokens).toMatch(/--font-display:\s*var\(--font-/);
    const colors = (config.theme?.extend?.colors ?? {}) as Record<string, unknown>;
    for (const name of ['gold', 'ink', 'on-ink']) expect(colors[name], name).toBeDefined();
    const family = (config.theme?.extend?.fontFamily ?? {}) as Record<string, unknown>;
    expect(family.display).toBeDefined();
  });
});

describe('the public page', () => {
  it("sets the restaurant's name and the section titles in the display face", () => {
    expect(landing).toMatch(/<h1 className="[^"]*\bfont-display\b/);
    expect(landing).toMatch(/<h2 className="[^"]*\bfont-display\b/);
  });

  it('shows prices in gold', () => {
    expect(landing).toMatch(/numeric[^"]*\btext-gold\b/);
  });

  it('closes on an ink footer', () => {
    expect(landing).toMatch(/<footer className="[^"]*\bbg-ink\b/);
  });

  // The gold rule after every title went in batch 18: it now marks the hero
  // alone (modern-identity.test.ts).
});

describe('the manager', () => {
  it('holds its navigation on ink, with titles in the display face', () => {
    expect(shell).toMatch(/<aside className="[^"]*\bbg-ink\b/);
    expect(shell).toMatch(/<h1 className="[^"]*\bfont-display\b/);
  });
});

describe('the till', () => {
  it('stays in the interface face: no display type on the sales path', () => {
    for (const path of ['features/pos/OrderEntryScreen.tsx', 'features/pos/PaymentScreen.tsx', 'components/menu/menu.tsx']) {
      expect(read(path), path).not.toMatch(/\bfont-display\b/);
    }
  });
});
