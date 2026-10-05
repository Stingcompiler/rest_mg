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
