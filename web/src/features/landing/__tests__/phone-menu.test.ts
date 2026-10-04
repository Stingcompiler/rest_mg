/**
 * The restaurant's page on a phone, ordered like a modern delivery app
 * (batch 19, docs/MODERN-DESIGN-REVIEW.ar.md, findings 1–7).
 *
 * What the review found at 375px:
 *   - the name and "اطلب الآن" each broke onto two lines in the top bar;
 *   - with no cover photo the hero was an empty ink block two thirds of the
 *     screen tall, so no dish showed before a full scroll;
 *   - each dish card was ~330px, half of it a stand-in box with a fork icon,
 *     so eight dishes took three screens;
 *   - prices had no currency;
 *   - the category bar drew a grey scrollbar across the first card;
 *   - "أضف" was the card's full width, never showed how many were added, and
 *     threw the whole cart sheet over the menu on every tap.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { activeSection } from '../menuSpy';

const landing = readFileSync(resolve(__dirname, '../LandingClient.tsx'), 'utf-8');
const flow = readFileSync(resolve(__dirname, '../OrderFlow.tsx'), 'utf-8');

/** The body of a top-level function in the landing page. */
function fn(name: string, source = landing): string {
  const body = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}`).exec(source)?.[0];
  expect(body, `function ${name}`).toBeDefined();
  return body!;
}

describe('the top bar', () => {
  it("keeps the restaurant's name on one line", () => {
    expect(fn('TopBar')).toMatch(/className="[^"]*\bmin-w-0\b[^"]*\btruncate\b|className="[^"]*\btruncate\b[^"]*\bmin-w-0\b/);
  });

  it('shrinks the order button to its icon on a phone, still named', () => {
    const bar = fn('TopBar');
    expect(bar).toMatch(/sr-only sm:not-sr-only/);
    expect(bar).toMatch(/aria-label=/);
  });

  it('shows how many dishes are in the cart, and opens it', () => {
    const bar = fn('TopBar');
    expect(bar).toMatch(/cart\.count/);
    expect(bar).toMatch(/cart\.open\(\)/);
  });
});

describe('the hero', () => {
  it('is shorter on a phone, and shorter still without a photo', () => {
    expect(landing).not.toMatch(/className="relative flex min-h-\[68vh\]/);
    expect(landing).toMatch(/heroImage\s*\?\s*'[^']*min-h-\[52vh\][^']*sm:min-h-\[68vh\]/);
    expect(landing).toMatch(/:\s*'[^']*min-h-\[36vh\]/);
  });

  it('offers one way to the menu, not two buttons that both scroll there', () => {
    // With ordering on, "اطلب الآن" and "تصفح القائمة" both went to the menu.
    expect(landing).toMatch(/\{ordering \? null : \(\s*<button/);
  });
});

describe('a dish', () => {
  it('draws no stand-in box when it has no photo', () => {
    expect(fn('DishPhoto')).toMatch(/if \(!item\.image_url\) return null;/);
    expect(landing).not.toMatch(/function ItemImage\b/);
  });

  it('is a compact row on a phone and a card from 640px up', () => {
    const card = fn('ItemCard');
    expect(card).toMatch(/<article className="[^"]*\bflex-row\b[^"]*\bsm:flex-col\b/);
  });

  it('shows its price with the currency', () => {
    expect(fn('Price')).toMatch(/label\('landing\.currency'\)/);
    expect(fn('ItemCard')).toMatch(/<Price\b/);
    expect(fn('FeaturedCard')).toMatch(/<Price\b/);
  });

  it('is added with a round "+" that turns into a counter in place', () => {
    const control = fn('AddControl');
    expect(control).toMatch(/cart\.lines\.find/);
    expect(control).toMatch(/<Plus\b/);
    expect(control).toMatch(/<Minus\b/);
    expect(control).toMatch(/cart\.setQty/);
    expect(fn('ItemCard')).toMatch(/<AddControl\b/);
  });
});

describe('the cart', () => {
  it('stays closed when a dish is added: the bar at the bottom counts it', () => {
    const add = /\badd\(item\)\s*\{[\s\S]*?\n {6}\},/.exec(flow)?.[0] ?? '';
    expect(add).toMatch(/setLines/);
    expect(add).not.toMatch(/setSheetOpen\(true\)/);
  });

  it('draws no empty photo box beside a line without one', () => {
    expect(flow).not.toMatch(/bg-surface-2">\s*\{item\.image_url \? <img[\s\S]{0,120}?: null\}/);
  });
});

describe('the category bar', () => {
  it('hides its scrollbar', () => {
    expect(fn('MenuSection')).toMatch(/sticky top-header[^"]*\[scrollbar-width:none\][^"]*\[&::-webkit-scrollbar\]:hidden/);
  });

  it('jumps to a category and marks the one being read', () => {
    const menu = fn('MenuSection');
    expect(menu).toMatch(/activeSection\(/);
    expect(menu).toMatch(/id=\{sectionId\(category\.id\)\}/);
    expect(menu).toMatch(/aria-current=/);
  });

  it('keeps the marked chip in view by scrolling the bar alone, never the page', () => {
    // scrollIntoView on the chip scrolled the page too, and pulled it down to
    // the menu on load (found while verifying batch 19).
    const menu = fn('MenuSection');
    expect(menu).toMatch(/nav\.scrollBy\(/);
    expect(menu).not.toMatch(/inline:/);
  });
});

describe('activeSection', () => {
  const sections = [
    { id: 'grills', top: -900 },
    { id: 'meals', top: -40 },
    { id: 'drinks', top: 600 },
  ];

  it('is the last category whose title has passed under the bar', () => {
    expect(activeSection(sections, 120)).toBe('meals');
  });

  it('is the first category before any has reached the bar', () => {
    expect(activeSection([{ id: 'grills', top: 400 }, { id: 'meals', top: 900 }], 120)).toBe('grills');
  });

  it('is the one whose title sits exactly on the line', () => {
    expect(activeSection([{ id: 'grills', top: -10 }, { id: 'meals', top: 120 }], 120)).toBe('meals');
  });

  it('is nothing for an empty menu', () => {
    expect(activeSection([], 120)).toBeNull();
  });
});
