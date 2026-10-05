/**
 * The product is called Orderak — اوردراك (owner's decision, 2026-10-05).
 *
 * It was "نقاط البيع" (point of sale) in Arabic and "Sudan POS" in English: a
 * description, not a name. The name is what the browser tab, the installed
 * app and the sign-in page show. Internal identifiers keep their old
 * spelling (the `sudanpos` database, the browser-storage keys): renaming
 * them would empty a deployed database or wipe the settings on every device.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BrandMark } from '@/components/primitives/indicators';
import { buildPrintContext } from '@/print';

import ar from '../../i18n/messages/ar.json';
import en from '../../i18n/messages/en.json';

const SRC = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../../public/manifest.webmanifest'), 'utf-8'));

describe('the product name', () => {
  it('is اوردراك in Arabic and Orderak in English', () => {
    expect(ar['common.appName']).toBe('اوردراك');
    expect(en['common.appName']).toBe('Orderak');
  });

  it('names the installed app', () => {
    expect(manifest.name).toBe('اوردراك');
    expect(manifest.description).toContain('اوردراك');
  });

  it('is said nowhere under its old names', () => {
    for (const messages of [ar, en]) {
      for (const [key, text] of Object.entries(messages)) {
        expect(text, key).not.toMatch(/نقاط البيع|Sudan POS/);
      }
    }
  });
});

describe('the name inside the screens (2026-10-05)', () => {
  it('is in every tab, after the screen: "الكاشير · اوردراك"', () => {
    expect(read('app/layout.tsx')).toMatch(/title:\s*\{\s*default:\s*t\('common\.appName'\),\s*template:\s*`%s · \$\{t\('common\.appName'\)\}`/);
  });

  it('is drawn as a mark: اوردراك, with Orderak under it in Latin', () => {
    const html = renderToStaticMarkup(createElement(BrandMark, {}));
    expect(html).toContain('اوردراك');
    expect(html).toMatch(/<[^>]+lang="en"[^>]*dir="ltr"[^>]*>Orderak</);
    expect(html).toMatch(/\bfont-display\b/);
  });

  it('opens the sign-in screen and heads the manager\'s sidebar', () => {
    expect(read('features/auth/LoginScreen.tsx')).toMatch(/<BrandMark\b/);
    expect(read('features/manager/ManagerShell.tsx')).toMatch(/<nav[\s\S]{0,300}<BrandMark\b/);
  });
});

describe('the name everywhere (2026-10-05)', () => {
  it('has a one-line form for a screen header', () => {
    const html = renderToStaticMarkup(createElement(BrandMark, { inline: true }));
    expect(html).toMatch(/\bflex-row\b/);
    expect(html).toContain('اوردراك');
    expect(html).toContain('Orderak');
  });

  it('tops the till\'s rail', () => {
    expect(read('features/pos/PosRail.tsx')).toMatch(/<NavRail\s+header=\{[\s\S]{0,200}<BrandMark\b/);
    expect(read('components/layout/layout.tsx')).toMatch(/header\s*\?\s*\(?\s*<div[^>]*>\s*\{header\}/);
  });

  it.each(['features/kitchen/KitchenScreen.tsx', 'features/deliveries/DeliveriesScreen.tsx', 'features/catalog/CatalogScreen.tsx'])(
    'heads %s',
    (path) => {
      expect(read(path)).toMatch(/<header[\s\S]{0,400}<BrandMark inline\b/);
    },
  );

  it("signs off the restaurant's page", () => {
    const landing = read('features/landing/LandingClient.tsx');
    expect(/<footer[\s\S]*?<\/footer>/.exec(landing)?.[0]).toMatch(/label\('landing\.poweredBy'\)/);
    expect(ar['landing.poweredBy' as keyof typeof ar]).toContain('اوردراك');
  });

  it('closes the receipt and the shift report', () => {
    expect(buildPrintContext('ar', 'western').labels.poweredBy).toBe('اوردراك · Orderak');
    const document = read('print/document.ts');
    for (const builder of ['buildReceipt', 'buildShiftReport']) {
      const body = new RegExp(`export function ${builder}\\b[\\s\\S]*?\\n\\}`).exec(document)?.[0] ?? '';
      expect(body, builder).toMatch(/text: ctx\.labels\.poweredBy/);
    }
  });
});
