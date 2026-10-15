/**
 * The kitchen and delivery tickets without template patterns (batch 55, from
 * the review, docs/ui-profile.md).
 *
 *   - Each kitchen ticket carried a coloured strip down its edge in the colour
 *     of its age, beside the age written in the same colour: one state, said
 *     twice, the first as the forbidden strip. A late ticket is now outlined
 *     whole (it is the one that needs the eye); the age stays in words.
 *   - On a phone the kitchen's header ran 29px past the screen: the title
 *     wrapped and «تسجيل الخروج» squeezed the rest.
 *   - A delivery ticket drew the customer in a tinted box inside the card (a
 *     card inside a card), a «توصيل» chip on a page of deliveries, and the
 *     waiting-for-kitchen note in another tinted box; «إلغاء الطلب» had the
 *     weight of «تأكيد الطلب».
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Button } from '@/components/primitives/controls';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const kitchen = read('features/kitchen/KitchenScreen.tsx');
const deliveries = read('features/deliveries/DeliveriesScreen.tsx');

describe('a kitchen ticket', () => {
  it('has no strip down its edge', () => {
    expect(kitchen).not.toMatch(/AGE_BAR/);
    expect(kitchen).not.toMatch(/absolute inset-y-0 start-0/);
    expect(kitchen).not.toMatch(/<article[^>]*\bps-20\b/);
  });

  it('is outlined whole when it is late, and only then', () => {
    expect(kitchen).toMatch(/const LATE_OUTLINE = 'border-strong border-danger'/);
    expect(kitchen).toMatch(/tone === 'danger' \? LATE_OUTLINE : 'border border-line'/);
    expect(kitchen).toMatch(/data-age=\{tone\}/);
  });

  it('says its age in words, in the age’s colour', () => {
    expect(kitchen).toMatch(/i18n\.plural\('kitchen\.minutesAgo', minutes\)/);
    expect(kitchen).toMatch(/tone === 'danger'\s*\?\s*'text-ar-base font-semibold text-danger'/);
  });
});

describe('the kitchen header on a phone', () => {
  it('keeps its title on one line and shows sign-out as its icon', () => {
    expect(kitchen).toMatch(/<h1 className="whitespace-nowrap text-ar-lg font-semibold sm:text-ar-xl">/);
    expect(kitchen).toMatch(/<LogOut size=\{18\} className="sm:hidden" \/>/);
    expect(kitchen).toMatch(/<span className="hidden sm:inline">\{i18n\.t\('manager\.logout'\)\}<\/span>/);
  });
});

describe('a delivery ticket', () => {
  it('shows the customer as an open section, not a box inside the card', () => {
    expect(deliveries).not.toMatch(/rounded-md bg-surface-2 p-12 text-ar-sm/);
    expect(deliveries).toMatch(/flex flex-col gap-6 border-t border-line pt-12 text-ar-sm/);
  });

  it('sets the items off from the customer with a rule', () => {
    expect(deliveries).toMatch(/<ul className="flex flex-col gap-4 border-t border-line pt-12 text-ar-base">/);
  });

  it('names the kind only when it is not the page’s own: a pickup', () => {
    expect(deliveries).toMatch(/\{pickup \? <StatusChip label=\{i18n\.t\('deliveries\.kind\.pickup'\)\} tone="neutral" \/> : null\}/);
    expect(deliveries).not.toMatch(/deliveries\.kind\.delivery/);
  });

  it('says it is waiting on the kitchen in plain words', () => {
    expect(deliveries).not.toMatch(/rounded-md bg-surface-2 px-12 py-8/);
  });

  it('gives cancelling the quiet weight of a risky act beside the main one', () => {
    expect(deliveries).toMatch(/<Button variant="quietDanger" onClick=\{\(\) => setConfirmingCancel\(true\)\}/);
    const html = renderToStaticMarkup(createElement(Button, { variant: 'quietDanger' }, 'x'));
    expect(html).toMatch(/\btext-danger\b/);
    expect(html).not.toMatch(/\bborder\b(?!-)/);
  });
});
