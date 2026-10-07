/**
 * The till and the staff screens, as walked through and measured in the
 * review (batch 31, docs/UX-VISUAL-REVIEW.ar.md: U5–U11, K1, K2, K3, K5).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MenuItemCard } from '@/components/menu/menu';
import { OrderCard } from '@/components/orders/orders';
import { Toggle } from '@/components/primitives/controls';
import { destinationAfterLogin } from '@/lib/http';
import ar from '@/i18n/messages/ar.json';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const payment = read('features/pos/PaymentScreen.tsx');
const deliveries = read('features/deliveries/DeliveriesScreen.tsx');
const catalog = read('features/catalog/CatalogScreen.tsx');
const menu = read('features/pos/MenuManagementScreen.tsx');
const shiftClose = read('features/pos/ShiftCloseScreen.tsx');
const profile = read('features/manager/ProfileScreen.tsx');

const classes = (html: string) => /class="([^"]*)"/.exec(html)?.[1] ?? '';

describe('paying cash (U5, U6)', () => {
  it('takes a quick-cash note in one tap, as cash, with what was handed over', () => {
    // A note's button set an amount and waited for a second tap on «نقدًا»,
    // placed above it on the screen.
    expect(payment).toMatch(/const payCash = \(tendered: bigint\)/);
    expect(payment).toMatch(/tenderedMinor: tendered/);
    expect(payment).toMatch(/<QuickCashButton[\s\S]{0,200}onClick=\{\(\) => payCash\(amount\)\}/);
    expect(payment).toMatch(/label=\{i18n\.t\('pos\.payment\.exactCash'\)\} onClick=\{\(\) => payCash\(due\)\}/);
    expect(payment).toMatch(/i18n\.t\('pos\.payment\.quickCash'\)/);
  });

  it('says the change is due, not "partial", when more is typed than is owed', () => {
    expect(payment).toMatch(/enteredMinor >= due\s*\?\s*i18n\.t\('pos\.payment\.changePreview'/);
  });

  it('names the summary once: what is owed, or the change, never both with a zero', () => {
    expect(payment).toMatch(/<CalloutPanel title=\{i18n\.t\('pos\.payment\.balance'\)\}/);
    const panel = /<CalloutPanel[\s\S]*?<\/CalloutPanel>/.exec(payment)?.[0] ?? '';
    expect(panel.match(/pos\.payment\.change'/g)?.length ?? 0).toBe(1);
  });
});

describe('signing in to a screen of your own (U7)', () => {
  it("takes the cashier to delivery orders or the catalogue when that is where they were going", () => {
    expect(destinationAfterLogin('/deliveries/', 'cashier')).toBe('/deliveries/');
    expect(destinationAfterLogin('/catalog/', 'cashier')).toBe('/catalog/');
  });

  it('still never carries anyone into an app that is not theirs', () => {
    expect(destinationAfterLogin('/kitchen/', 'cashier')).toBe('/pos/');
    expect(destinationAfterLogin('/manager/', 'cashier')).toBe('/pos/');
    expect(destinationAfterLogin('/deliveries/', 'kitchen')).toBe('/kitchen/');
    expect(destinationAfterLogin('/kitchen/', 'manager')).toBe('/manager/');
  });
});

describe('a dot beside a number (U8)', () => {
  it('is never written: next to Arabic-Indic digits «·» reads as the zero «٠»', () => {
    const near = Object.entries(ar).filter(([, text]) => /\}\s*·|·\s*\{/.test(text));
    expect(near).toEqual([]);
    expect(deliveries).not.toMatch(/·\s*\{i18n\.(int|money)\(/);
  });

  it('gives a heading its count as a badge', () => {
    expect(deliveries).toMatch(/\{i18n\.t\('deliveries\.yourTurn'\)\}\s*<CountBadge count=\{i18n\.int\(mine\.length\)\} \/>/);
  });
});

describe('a delivery card before it is confirmed (U9)', () => {
  it('shows no kitchen chip: the kitchen has not got the order yet', () => {
    expect(deliveries).toMatch(/order\.kitchen_status && !terminal && ds !== 'pending'/);
  });
});

describe('the catalogue for a screen reader (U10, U11)', () => {
  it('names which dish or category each edit button is for', () => {
    expect(catalog).toMatch(/label=\{i18n\.t\('catalog\.editItemNamed', \{ name: item\.name_ar \}\)\}/);
    expect(catalog).toMatch(/label=\{i18n\.t\('catalog\.editCategoryNamed', \{ name: category\.name_ar \}\)\}/);
  });

  it('puts no label inside another', () => {
    expect(catalog).not.toMatch(/<Field[^>]*>\s*<TextField/);
  });
});

describe('the menu screen on a phone (K1)', () => {
  it('wraps its bulk-price bar instead of running off the screen', () => {
    expect(menu).toMatch(/className="flex flex-none flex-wrap items-center gap-12 border-b border-line bg-surface px-16 py-14"/);
  });
});

describe('switches and small targets (K2, K3)', () => {
  it('keeps a switch its size in a crowded row, with a 46px target', () => {
    const toggle = classes(renderToStaticMarkup(createElement(Toggle, { checked: false, label: 'x' })));
    expect(toggle).toMatch(/\bflex-none\b/);
    expect(toggle).toMatch(/\bafter:-inset-y-6\b/);
  });

  it('gives the opening-hours days, the customer’s phone and the shift’s orders link 44px', () => {
    expect(profile).toMatch(/'min-h-control-stepper rounded-md border px-10/);
    expect(deliveries).toMatch(/<a href=\{`tel:\$\{order\.customer_phone\}`\} className="[^"]*\bmin-h-control-stepper\b/);
    expect(shiftClose).toMatch(/onClick=\{\(\) => router\.push\('\/pos\/orders'\)\} className="[^"]*\bmin-h-control-stepper\b/);
  });
});

describe('a tap that shows (K5)', () => {
  it('presses the till’s dish tile and the order card’s button', () => {
    const tile = classes(renderToStaticMarkup(createElement(MenuItemCard, { name: 'x', price: '1' })));
    expect(tile).toMatch(/\bactive:scale-\[0\.98\]/);
    const card = renderToStaticMarkup(
      createElement(OrderCard, {
        id: '1', typeLabel: 't', total: '1', items: 'i', age: 'a', agePercent: 10, ageTone: 'success',
        resumeLabel: 'r', cancelLabel: 'c', onResume: () => {}, onCancel: () => {},
      } as never),
    );
    expect(card).toMatch(/active:bg-accent-pressed/);
  });
});
