/**
 * The cashier's screens on a phone (batch 52).
 *
 * The owner: the deliveries page is not responsive; check every cashier
 * screen. Measured at 360px, 768px and 1024px:
 *
 *   - Every screen was `h-screen` (100vh) with its own scrolling inside. On a
 *     phone 100vh is taller than what shows under the browser's bar, so the
 *     bottom of each screen — the order sheet's «دفع», the last delivery's
 *     buttons — sat under the bar, out of reach. `h-dvh` is the visible height.
 *   - The payment screen stacked its columns with flex-col-reverse inside a
 *     scrolling box, which opens at the end: the bill and «إغلاق الفاتورة»
 *     started above the top of the screen (y = −54).
 *   - The payment title lost the order number to the clock beside it.
 *   - Zeros read as dots: «بانتظار المزامنة ٠», «إغلاق الوردية ·» (a shift with
 *     no name), «٠ بانتظار الإرسال، ٠ مرفوض».
 *   - Shift close: each denomination row sized its own columns, so the
 *     steppers stood at a different place on every row.
 *   - The deliveries title's truck icon shrank to a dot.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import config from '../../../../tailwind.config';
import { DenominationRow } from '@/components/shift/shift';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');

const SHELLS = [
  'app/(pos)/pos/layout.tsx',
  'features/pos/OrderEntryScreen.tsx',
  'features/pos/PaymentScreen.tsx',
  'features/pos/OpenOrdersScreen.tsx',
  'features/pos/DailyReportScreen.tsx',
  'features/pos/ShiftCloseScreen.tsx',
  'features/pos/SyncQueueScreen.tsx',
  'features/pos/MenuManagementScreen.tsx',
  'features/deliveries/DeliveriesScreen.tsx',
  'features/catalog/CatalogScreen.tsx',
  'features/kitchen/KitchenScreen.tsx',
  'features/auth/RequireRole.tsx',
  'features/auth/LoginScreen.tsx',
  'features/manager/ManagerShell.tsx',
];

describe('a screen’s height', () => {
  it.each(SHELLS)('is the visible height on a phone, not 100vh: %s', (file) => {
    const text = read(file);
    expect(text).not.toMatch(/(?<![\w-])h-screen(?![\w-])/);
    expect(text).not.toMatch(/(?<![\w-])min-h-screen(?![\w-])/);
  });
});

describe('the payment screen on a phone', () => {
  const payment = read('features/pos/PaymentScreen.tsx');

  it('opens at the bill, not scrolled to the keypad', () => {
    expect(payment).not.toMatch(/flex-col-reverse/);
    expect(payment).toMatch(/<aside className="[^"]*\border-first\b[^"]*\blg:order-none\b/);
  });

  it('puts the bill beside the keypad only from 1024px: at 768 the methods were squeezed to a word a line', () => {
    expect(payment).toMatch(/lg:flex-row lg:overflow-visible/);
    expect(payment).not.toMatch(/md:flex-row/);
  });

  it('gives the order number the room the clock took', () => {
    expect(payment).toMatch(/<Numeric className="hidden text-num-base sm:inline">\{formatTime\(new Date\(\)\)\}<\/Numeric>/);
  });
});

describe('the header on a phone', () => {
  it('sets the title a size smaller, with less padding', () => {
    expect(read('components/layout/layout.tsx')).toMatch(/truncate text-ar-lg font-semibold text-text sm:text-ar-xl/);
  });
});

describe('zeros that read as dots', () => {
  it('leave the count off a title when there is none', () => {
    expect(read('features/pos/SyncQueueScreen.tsx')).toMatch(/entries\?\.length \?/);
    expect(read('features/pos/OpenOrdersScreen.tsx')).toMatch(/all\.length > 0 \?/);
  });

  it('name a shift only when it has a name', () => {
    expect(read('features/pos/ShiftCloseScreen.tsx')).not.toMatch(/\$\{i18n\.t\('pos\.shift\.close'\)\} · \$\{shift\.toSnapshot\(\)\.name\}/);
  });

  it('say nothing of a queue that is empty', () => {
    expect(read('features/pos/SyncQueueScreen.tsx')).toMatch(/waiting\.length > 0 \|\| refused\.length > 0 \?/);
  });
});

describe('the cash count', () => {
  it('reads «—» for a row with nothing counted, and sizes the coins field to an amount', () => {
    const shift = read('features/pos/ShiftCloseScreen.tsx');
    expect(shift).toMatch(/sum=\{count > 0 \? i18n\.money\(denominationMinor \* BigInt\(count\)\) : '—'\}/);
    expect(shift).toMatch(/size=\{8\}/);
  });

  it('lines every row’s stepper up in one column', () => {
    const columns = (config.theme?.extend?.gridTemplateColumns ?? {}) as Record<string, string>;
    expect(columns.denomination).toBeDefined();
    const html = renderToStaticMarkup(createElement(DenominationRow, { note: '5', stepper: createElement('span'), sum: '0' }));
    expect(html).toMatch(/^<div class="[^"]*\bgrid grid-cols-denomination\b/);
  });
});

describe('the menu screen on a tablet', () => {
  it('wraps its percentage buttons', () => {
    expect(read('features/pos/MenuManagementScreen.tsx')).toMatch(/<div className="flex flex-wrap gap-8">\s*\{PERCENTS\.map/);
  });
});

describe('the deliveries title', () => {
  it('keeps its icon its size', () => {
    expect(read('features/deliveries/DeliveriesScreen.tsx')).toMatch(/<Truck size=\{22\} className="flex-none text-accent" \/>/);
  });
});
