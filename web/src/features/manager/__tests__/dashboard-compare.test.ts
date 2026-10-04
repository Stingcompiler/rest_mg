/**
 * The manager's figures, compared (batch 22, docs/MODERN-DESIGN-REVIEW.ar.md,
 * findings 18–19).
 *
 * The dashboard showed a number and nothing to read it against: 65,000 taken
 * today is good or bad only next to what the same hours took yesterday. The
 * comparison is with the same span of the period before, up to the same time
 * of day, so a morning is not measured against a whole day. Every manager
 * page also gets a one-line description under its title.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { KpiCard } from '@/components/report/report';
import { change, periodRange, previousRange } from '../period';

const DIR = resolve(__dirname, '..');
const dashboard = readFileSync(resolve(DIR, 'DashboardScreen.tsx'), 'utf-8');

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 14:37:20 in Khartoum (UTC+2) on 4 October 2026.
const NOW = new Date('2026-10-04T12:37:20.000Z');

describe('previousRange', () => {
  it('is yesterday from midnight up to this minute yesterday, for today', () => {
    const range = previousRange('today', NOW)!;
    expect(range.from).toBe('2026-10-02T22:00:00.000Z'); // midnight on the 3rd, Khartoum
    expect(range.to).toBe('2026-10-03T12:37:00.000Z'); // the same minute, a day back
  });

  it('is the seven days before, up to the same time, for the week', () => {
    const range = previousRange('week', NOW)!;
    const current = periodRange('week', NOW);
    expect(Date.parse(range.from!)).toBe(Date.parse(current.from!) - 7 * DAY);
    expect(range.to).toBe(new Date(Date.parse('2026-10-04T12:37:00.000Z') - 7 * DAY).toISOString());
  });

  it('is the thirty days before, for the month', () => {
    const range = previousRange('month', NOW)!;
    expect(Date.parse(periodRange('month', NOW).from!) - Date.parse(range.from!)).toBe(30 * DAY);
  });

  it('is nothing for "all": there is no period before everything', () => {
    expect(previousRange('all', NOW)).toBeNull();
  });

  it('stays the same within a minute, so the query is not refetched on every render', () => {
    expect(previousRange('today', new Date(NOW.getTime() + 30_000))).toEqual(previousRange('today', NOW));
  });
});

describe('change', () => {
  it('says how much higher or lower, in whole percent', () => {
    expect(change(112n, 100n)).toEqual({ direction: 'up', percent: 12 });
    expect(change(95n, 100n)).toEqual({ direction: 'down', percent: 5 });
    expect(change(100n, 100n)).toEqual({ direction: 'flat', percent: 0 });
  });

  it('says nothing when there is nothing to compare with', () => {
    expect(change(500n, 0n)).toBeNull();
  });
});

describe('KpiCard', () => {
  it('shows the comparison under the figure, coloured by its direction', () => {
    const up = renderToStaticMarkup(
      createElement(KpiCard, { label: 'x', value: '1', delta: { direction: 'up', text: '+١٢٪ عن الوقت نفسه أمس' } }),
    );
    expect(up).toContain('+١٢٪ عن الوقت نفسه أمس');
    expect(up).toMatch(/class="[^"]*\btext-success\b[^"]*"[^>]*>[\s\S]*عن الوقت نفسه أمس/);
    const down = renderToStaticMarkup(
      createElement(KpiCard, { label: 'x', value: '1', delta: { direction: 'down', text: '−٥٪' } }),
    );
    expect(down).toMatch(/\btext-danger\b/);
  });

  it('shows nothing extra without one', () => {
    expect(renderToStaticMarkup(createElement(KpiCard, { label: 'x', value: '1' }))).not.toMatch(/text-success|text-danger/);
  });
});

describe('the dashboard', () => {
  it('fetches the period before and compares collected, orders and the average ticket', () => {
    expect(dashboard).toMatch(/useRevenue\(previous/);
    expect((dashboard.match(/delta=\{/g) ?? []).length).toBe(3);
  });
});

describe('every manager page', () => {
  it('says in one line what it is for, under its title', () => {
    const screens = readdirSync(DIR).filter((name) => name.endsWith('Screen.tsx'));
    expect(screens.length).toBeGreaterThanOrEqual(7);
    for (const name of screens) {
      const text = readFileSync(resolve(DIR, name), 'utf-8');
      if (!text.includes('<ManagerShell')) continue;
      expect(text, name).toMatch(/<ManagerShell\s+title=\{[^}]*\}\s+description=\{i18n\.t\('[^']+\.description'\)\}/);
    }
  });
});
