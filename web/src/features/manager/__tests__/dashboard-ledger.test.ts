/**
 * The manager's figures without template cards (batch 40).
 *
 * The owner, looking at the live dashboard: the cards still look like an AI
 * template. Every figure was its own floating box (border, shadow, a gold line
 * on top) in an even grid, and every panel another box. And on a quiet day
 * each box showed «٠» at 40px, which in Arabic-Indic digits is a dot: seven
 * boxes that looked empty rather than zero.
 *
 * Now the figures are one ledger: cells divided by hairlines inside a single
 * band, the takings first and largest; money carries its currency; nothing
 * yet reads «—» with the words for it. What has not finished moving is a list
 * of lines with dotted leaders, like the public menu; the panels are sections
 * under a rule, not boxes.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { KpiCard, KpiStrip, LedgerRow } from '@/components/report/report';
import ar from '@/i18n/messages/ar.json';
import en from '@/i18n/messages/en.json';

const SRC = resolve(__dirname, '../../..');
const dashboard = readFileSync(resolve(SRC, 'features/manager/DashboardScreen.tsx'), 'utf-8');
const BOX = /\bshadow-card\b|\bborder-t-gold-soft\b|\bborder-t-strong\b/;

describe('a figure', () => {
  it('is a cell of the ledger, not a box of its own', () => {
    const html = renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '١٢٬٥٠٠' }));
    expect(html).not.toMatch(BOX);
    expect(html).not.toMatch(/\brounded-lg\b|\bborder border-line\b/);
  });

  it('reads «—» when there is nothing yet, never a lone «٠» that looks like a dot', () => {
    const html = renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '٠', zero: true, zeroLabel: 'لا شيء بعد' }));
    expect(html).toContain('—');
    expect(html).not.toMatch(/>٠</);
    expect(html).toContain('لا شيء بعد');
  });

  it('carries its currency when it is money', () => {
    const html = renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '١٢٬٥٠٠', unit: 'ج.س' }));
    expect(html).toContain('ج.س');
  });

  it('sets the lead figure larger than the rest', () => {
    const lead = renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '1', lead: true }));
    const rest = renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '1' }));
    expect(lead).toMatch(/\btext-num-4xl\b/);
    expect(rest).toMatch(/\btext-num-2xl\b/);
  });
});

describe('the ledger', () => {
  it('is one band, its cells divided by hairlines', () => {
    const html = renderToStaticMarkup(createElement(KpiStrip, { columns: 4, children: createElement(KpiCard, { label: 'a', value: '1' }) }));
    expect(html).toMatch(/^<div class="[^"]*\bgap-px\b[^"]*\bbg-line\b/);
    expect(html).toMatch(/\blg:grid-cols-4\b/);
  });

  it('lists what has not finished moving as lines with dotted leaders', () => {
    const html = renderToStaticMarkup(createElement(LedgerRow, { label: 'لم تُحصَّل بعد', value: '٤٤٬٥٠٠' }));
    expect(html).toMatch(/border-dotted/);
    expect(html).toContain('لم تُحصَّل بعد');
    const empty = renderToStaticMarkup(createElement(LedgerRow, { label: 'x', value: '٠', zero: true }));
    expect(empty).toContain('—');
    expect(empty).not.toMatch(/>٠</);
  });
});

describe('the overview', () => {
  it('uses the ledger, and no panel is a box', () => {
    expect(dashboard).toMatch(/<KpiStrip columns=\{4\}>/);
    expect(dashboard).toMatch(/<LedgerRow\b/);
    expect(dashboard).not.toMatch(/rounded-lg border border-line bg-surface p-20/);
    expect(dashboard).toMatch(/function DashSection\b/);
  });

  it('leads with the takings, and says when a figure is nothing yet', () => {
    expect(dashboard).toMatch(/<KpiCard\s+lead\b/);
    expect(dashboard).toMatch(/zero=\{/);
  });

  it('names its sections in both languages', () => {
    for (const key of ['manager.dashboard.nothingYet', 'manager.money.openTitle']) {
      expect(ar, key).toHaveProperty([key]);
      expect(en, key).toHaveProperty([key]);
    }
  });
});
