/**
 * The customer's order, as walked through in the review (batch 30,
 * docs/UX-VISUAL-REVIEW.ar.md).
 *
 * What the walk-through found on a phone:
 *   - with "pickup" chosen, the sheet still said «بيانات التوصيل» and the
 *     button «إرسال طلب التوصيل»;
 *   - the page said «مغلق الآن» and took the order without a word about when
 *     it would be confirmed;
 *   - the cart and the confirmation showed totals with no currency, where
 *     every price on the page has one;
 *   - the confirmation said «تم استلام طلبك بنجاح» twice, in the header and
 *     under it;
 *   - the cart's counters were grey squares-in-circles, the dish's a green
 *     pill: two counters for one thing on one page;
 *   - the footer's links were 21px tall, under WCAG's 24px floor.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import ar from '../../../i18n/messages/ar.json';

const flow = readFileSync(resolve(__dirname, '../OrderFlow.tsx'), 'utf-8');
const landing = readFileSync(resolve(__dirname, '../LandingClient.tsx'), 'utf-8');

/** A top-level function's text: from its name up to the next top-level function. */
function fn(name: string, source: string): string {
  const start = source.search(new RegExp(`(?:^|\\n)(?:export )?function ${name}\\b`));
  expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + 1);
  const next = rest.search(/\n(?:export )?function [A-Za-z]/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('a pickup order', () => {
  it('is titled and sent as a pickup, not a delivery', () => {
    expect(flow).toMatch(/draft\.fulfilment === 'pickup' \? label\('landing\.form\.titlePickup'\) : label\('landing\.form\.title'\)/);
    expect(flow).toMatch(/draft\.fulfilment === 'pickup' \? 'landing\.form\.submitPickup' : 'landing\.form\.submit'/);
    expect(ar['landing.form.titlePickup' as keyof typeof ar]).toBeTruthy();
    expect(ar['landing.form.submitPickup' as keyof typeof ar]).not.toMatch(/توصيل/);
  });
});

describe('ordering while the restaurant is closed', () => {
  it('is said in the cart and on the form, with when it opens', () => {
    expect(landing).toMatch(/<CartProvider[\s\S]{0,300}hours=\{data\.hours\}/);
    const notice = fn('ClosedNotice', flow);
    expect(notice).toMatch(/openState\(cart\.hours, new Date\(\), TIME_ZONE\)/);
    expect(notice).toMatch(/return null;/);
    expect(fn('CartStep', flow)).toMatch(/<ClosedNotice \/>/);
    expect(fn('FormStep', flow)).toMatch(/<ClosedNotice \/>/);
  });
});

describe('totals', () => {
  it('carry the currency wherever the customer sees money', () => {
    for (const name of ['CartStep', 'CartBar', 'DoneStep']) {
      expect(fn(name, flow), name).toMatch(/label\('landing\.currency'\)/);
    }
  });

  it('are gold, like every price on the page', () => {
    expect(fn('CartStep', flow)).toMatch(/numeric text-gold">\{money\(cart\.subtotalMinor\)\}/);
  });
});

describe('the confirmation', () => {
  it('says it once: the header names the step, the body says it went through', () => {
    expect(flow).toMatch(/step === 'done'\s*\?\s*label\('landing\.confirm\.header'\)/);
    expect(fn('DoneStep', flow)).toMatch(/label\('landing\.confirm\.title'\)/);
  });
});

describe('one counter', () => {
  it('is the same pill on a dish and in the cart', () => {
    expect(flow).toMatch(/export function QtyPill\b/);
    expect(fn('CartStep', flow)).toMatch(/<QtyPill\b/);
    expect(fn('AddControl', landing)).toMatch(/<QtyPill\b/);
  });

  it('and the sheet keeps one button shape', () => {
    expect(fn('CartStep', flow)).not.toMatch(/rounded-full bg-accent/);
  });
});

describe('the footer', () => {
  it('gives every link a target of 44px or more', () => {
    const footer = fn('Footer', landing);
    // Each <button> or <a>, and the first className after it.
    const links = [...footer.matchAll(/<(?:button|a)\b[\s\S]{0,300}?className="([^"]*)"/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const classes of links) expect(classes).toMatch(/\bmin-h-control-stepper\b/);
  });
});
