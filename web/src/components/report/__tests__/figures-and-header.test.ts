/**
 * Shared pieces that broke on a phone (batch 54, from the review's screenshots
 * at 360px; docs/ui-profile.md).
 *
 *   - The manager's overview in English: the lead figure «1,753,000» in Plex
 *     Mono at 40px did not fit half a phone's width and was cut to «1,753,0»,
 *     and «427,000 SDG» lost its unit. The takings now take the whole first
 *     row on a phone, figures are a size smaller there, and a unit wraps under
 *     its figure instead of being clipped.
 *   - «سُدِّد ٠»: a zero alone reads as a dot in Arabic-Indic digits.
 *   - The alert bell's «فعِّل الصوت» wrapped to two lines and squeezed the
 *     header of the kitchen and deliveries screens until their titles were cut.
 *   - The toast sat over the screen's title.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { KpiCard } from '../report';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');

describe('a figure on a phone', () => {
  it('gives the lead figure the whole first row, and a smaller size', () => {
    const html = renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '1,753,000', unit: 'SDG', lead: true }));
    expect(html).toMatch(/^<div class="[^"]*\bcol-span-2\b[^"]*\blg:col-span-1\b/);
    expect(html).toMatch(/\btext-num-3xl\b[^"]*\bsm:text-num-4xl\b/);
  });

  it('lets a last figure take a whole row too, so no empty cell shows the band’s colour', () => {
    const html = renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '1', wide: true }));
    expect(html).toMatch(/\bcol-span-2\b[^"]*\blg:col-span-1\b/);
    expect(read('features/manager/DashboardScreen.tsx')).toMatch(/<KpiCard\s+wide\s+label=\{i18n\.t\('pos\.report\.credit'\)\}/);
    expect(read('features/pos/DailyReportScreen.tsx')).toMatch(/<KpiCard wide label=\{i18n\.t\('pos\.report\.credit'\)\}/);
  });

  it('lets a unit wrap under its figure rather than be clipped', () => {
    const html = renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '427,000', unit: 'SDG' }));
    expect(html).toMatch(/<span class="flex flex-wrap items-baseline gap-x-6">/);
    expect(html).toMatch(/^<div class="[^"]*\bmin-w-0\b/);
  });

  it('keeps the padding modest in a half-width cell', () => {
    expect(renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '1' }))).toMatch(/\bp-14\b[^"]*\bsm:p-18\b/);
  });
});

describe('the overview', () => {
  it('writes «—», not a lone zero, for nothing repaid', () => {
    expect(read('features/manager/DashboardScreen.tsx')).toMatch(/repaid: isZero\(data\.settlements_minor\) \? '—' : money\(data\.settlements_minor\)/);
  });
});

describe('the header of a busy screen', () => {
  it('shows the alert bell’s call to action as its icon on a phone', () => {
    expect(read('features/alerts/AlertBell.tsx')).toMatch(/<span className="hidden sm:inline">\{label\}<\/span>/);
  });

  it('puts a toast below the header, not over its title', () => {
    expect(read('components/feedback/feedback.tsx')).toMatch(/placement === 'top' \? 'top-header mt-8'/);
  });
});
