/**
 * The till and the kitchen, modernised without slowing either (batch 21,
 * docs/MODERN-DESIGN-REVIEW.ar.md, findings 13–17).
 *
 * What the review found:
 *   - at 1280px the till's dish tiles stayed at their 132px floor, small for
 *     a thumb on a large screen;
 *   - a dish already in the order was marked only by a thin border and a
 *     corner badge;
 *   - "جاهز في المطبخ" appeared at the bottom centre, over the pay button;
 *   - the kitchen board was light like the rest of the app, glaring in a lit
 *     kitchen, and a ticket's age was only the colour of a line of text.
 * Nothing here adds a step or a tap to the sale.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Toast } from '@/components/feedback/feedback';
import { MenuItemCard } from '@/components/menu/menu';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const tokens = read('styles/design-tokens.css');
const kitchen = read('features/kitchen/KitchenScreen.tsx');
const rail = read('features/pos/PosRail.tsx');

function classes(html: string): string {
  return /class="([^"]*)"/.exec(html)?.[1] ?? '';
}

describe("the till's dish tiles", () => {
  it('grow from 132px to 152px on a large screen', () => {
    expect(tokens).toMatch(/--item-card-min-width:\s*132px/);
    expect(tokens).toMatch(/@media\s*\(min-width:\s*1280px\)\s*\{\s*:root\s*\{[^}]*--item-card-min-width:\s*152px/);
  });

  it('tint a dish that is already in the order', () => {
    const inCart = classes(renderToStaticMarkup(createElement(MenuItemCard, { name: 'شاورما', price: '14,375', inCart: '2' })));
    const notInCart = classes(renderToStaticMarkup(createElement(MenuItemCard, { name: 'شاورما', price: '14,375' })));
    expect(inCart).toMatch(/\bbg-accent-tint\b/);
    expect(notInCart).not.toMatch(/\bbg-accent-tint\b/);
  });

  it('set the price a weight above the name', () => {
    const html = renderToStaticMarkup(createElement(MenuItemCard, { name: 'شاورما', price: '14,375' }));
    expect(html).toMatch(/class="[^"]*\btext-num-md\b[^"]*\bfont-semibold\b[^"]*"[^>]*>14,375/);
  });
});

describe('a notice', () => {
  it('can stand at the top, away from the pay button', () => {
    const top = classes(renderToStaticMarkup(createElement(Toast, { message: 'x', onDismiss: () => {}, placement: 'top' })));
    expect(top).toMatch(/\btop-16\b/);
    expect(top).not.toMatch(/\bbottom-/);
  });

  it('stays at the bottom by default', () => {
    const bottom = classes(renderToStaticMarkup(createElement(Toast, { message: 'x', onDismiss: () => {} })));
    expect(bottom).toMatch(/\bbottom-/);
  });

  it('"ready in the kitchen" uses the top on the till', () => {
    expect(rail).toMatch(/<Toast message=\{readyNote\}[^>]*placement="top"/);
  });
});

describe('the kitchen board', () => {
  it('is dark, whatever the rest of the app is set to', () => {
    expect(kitchen).toMatch(/<div className="[^"]*" dir=\{i18n\.dir\} data-screen="kitchen" data-theme="dark">/);
  });

  it("marks each ticket's age with a bar along its edge, readable from across the kitchen", () => {
    expect(kitchen).toMatch(/const AGE_BAR: Record<'success' \| 'warning' \| 'danger', string> = \{/);
    for (const tone of ['success', 'warning', 'danger']) {
      expect(kitchen).toMatch(new RegExp(`${tone}: 'bg-${tone}'`));
    }
    expect(kitchen).toMatch(/data-age=\{tone\}/);
    expect(kitchen).toMatch(/AGE_BAR\[tone\]/);
  });
});
