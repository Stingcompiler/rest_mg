/**
 * The restaurant's page on a large screen, and a dish's own details
 * (batch 20, docs/MODERN-DESIGN-REVIEW.ar.md, findings 8–11).
 *
 * What the review found at 1440px:
 *   - a long menu could only be read by scrolling: no way to see the
 *     categories and jump between them beside the dishes;
 *   - tapping a dish did nothing: no large photo, no full description;
 *   - "لماذا نحن" was six cards of stock copy ("جودة عالية", "أسعار مناسبة")
 *     that read as a template, while the facts a visitor looks for (hours,
 *     how to order, where) sat in two boxes at the very bottom.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../../../../tailwind.config';
import ar from '../../../i18n/messages/ar.json';
import en from '../../../i18n/messages/en.json';
import { readingLine } from '../menuSpy';

const landing = readFileSync(resolve(__dirname, '../LandingClient.tsx'), 'utf-8');

function fn(name: string): string {
  const body = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}`).exec(landing)?.[0];
  expect(body, `function ${name}`).toBeDefined();
  return body!;
}

describe('the menu on a large screen', () => {
  it('lays the categories out as a column beside the dishes', () => {
    const columns = (config.theme?.extend?.gridTemplateColumns ?? {}) as Record<string, string>;
    expect(columns['menu-page']).toMatch(/var\(--dim-menu-sidebar\)/);
    const menu = fn('MenuSection');
    expect(menu).toMatch(/lg:grid-cols-menu-page/);
    expect(menu).toMatch(/<nav[\s\S]*?className="[^"]*\blg:flex-col\b[^"]*\blg:top-header-gap\b/);
  });

  it('measures what is being read from the top bar there, not from the column', () => {
    expect(fn('MenuSection')).toMatch(/readingLine\(/);
  });
});

describe('readingLine', () => {
  it('sits under the category bar on a phone', () => {
    expect(readingLine({ wide: false, headerBottom: 68, barBottom: 134 })).toBe(142);
  });

  it('sits under the top bar on a large screen, where the categories are a column', () => {
    // The column's bottom edge is far down the page; using it marked the last
    // category before the visitor reached it.
    expect(readingLine({ wide: true, headerBottom: 68, barBottom: 900 })).toBe(92);
  });
});

describe("a dish's details", () => {
  it('open from the dish, with the "+" still pressable on top', () => {
    const card = fn('ItemCard');
    expect(card).toMatch(/after:absolute after:inset-0/);
    expect(card).toMatch(/onClick=\{\(\) => setOpen\(true\)\}/);
    expect(card).toMatch(/<div className="relative z-10[^"]*">\s*\{cart\.ordering \? <AddControl/);
  });

  it('show the large photo, the whole description, the price and the counter', () => {
    const details = fn('DishDetails');
    expect(details).toMatch(/useModalDialog\(/);
    expect(details).toMatch(/role="dialog"/);
    expect(details).toMatch(/aria-modal="true"/);
    expect(details).toMatch(/<DishPhoto\b/);
    expect(details).toMatch(/item\.description_ar/);
    expect(details).not.toMatch(/line-clamp/);
    expect(details).toMatch(/<Price\b/);
    expect(details).toMatch(/<AddControl\b/);
  });
});

describe('the facts a visitor looks for', () => {
  it('replace the stock "why us" cards', () => {
    expect(landing).not.toMatch(/landing\.why/);
    for (const messages of [ar, en]) {
      expect(Object.keys(messages).filter((key) => key.startsWith('landing.why'))).toEqual([]);
    }
  });

  it('come from the restaurant itself: hours, how to order, where', () => {
    const band = fn('InfoBand');
    expect(band).toMatch(/data\.hours/);
    expect(band).toMatch(/data\.address_ar/);
    expect(band).toMatch(/data\.map_url/);
    expect(band).toMatch(/ordering/);
    // Nothing to say, nothing drawn.
    expect(band).toMatch(/return null;/);
  });

  it('sit under the hero on a large screen and after the menu on a phone', () => {
    // On a phone the band under the hero would push the first dish off the
    // first screen again (batch 19).
    expect(landing).toMatch(/<InfoBand[^>]*className="hidden lg:block"/);
    expect(landing).toMatch(/<InfoBand[^>]*className="lg:hidden"/);
  });

  it('are said once: the about and hours boxes at the bottom are gone', () => {
    expect(landing).not.toMatch(/landing\.aboutUs/);
  });
});
