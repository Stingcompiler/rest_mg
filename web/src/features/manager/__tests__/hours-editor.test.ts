/**
 * The manager edits the opening hours, and the page says whether it is open
 * (batch 23).
 *
 * No screen edited the hours: they came from the seed and stayed. The profile
 * page now has a row per span — the days it covers, opening and closing —
 * and saves them with their labels, which the public page shows as before.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { hoursProblem, toSavedHours } from '../hoursForm';

const profile = readFileSync(resolve(__dirname, '../ProfileScreen.tsx'), 'utf-8');
const landing = readFileSync(resolve(__dirname, '../../landing/LandingClient.tsx'), 'utf-8');

describe('the hours editor', () => {
  it('is on the profile page, with a toggle per day and time fields', () => {
    expect(profile).toMatch(/<HoursEditor\b/);
    expect(profile).toMatch(/aria-pressed=\{/);
    expect((profile.match(/type="time"/g) ?? []).length).toBe(2);
  });

  it('saves the hours with the rest of the profile, and not while a row is wrong', () => {
    expect(profile).toMatch(/hours: toSavedHours\(form\.hours\)/);
    expect(profile).toMatch(/disabled=\{update\.isPending \|\| hoursError !== null\}/);
  });
});

describe('hoursProblem', () => {
  it('asks for a day and both times on every row', () => {
    expect(hoursProblem([{ days: [], open: '08:00', close: '23:00' }])).toBe('manager.hours.needDay');
    expect(hoursProblem([{ days: [1], open: '', close: '23:00' }])).toBe('manager.hours.needTimes');
    expect(hoursProblem([{ days: [1], open: '08:00', close: '23:00' }])).toBeNull();
    expect(hoursProblem([])).toBeNull();
  });
});

describe('toSavedHours', () => {
  it('sorts the days in the Sudanese week and labels the row in both languages', () => {
    expect(toSavedHours([{ days: [4, 6, 0, 1, 2, 3], open: '08:00', close: '23:00' }])).toEqual([
      { days: [6, 0, 1, 2, 3, 4], open: '08:00', close: '23:00', day_ar: 'السبت – الخميس', day_en: 'Saturday – Thursday' },
    ]);
  });

  it('keeps a row saved before days existed as it was', () => {
    const legacy = { day_ar: 'يوميًا', day_en: 'Daily', open: '08:00', close: '23:00' };
    expect(toSavedHours([legacy])).toEqual([legacy]);
  });
});

describe('the public page', () => {
  it('says under the name whether the restaurant is open now', () => {
    expect(landing).toMatch(/function OpenBadge\b[\s\S]*?openState\(data\.hours, now, TIME_ZONE\)/);
    expect(landing).toMatch(/<h1[\s\S]{0,600}<OpenBadge\b/);
  });

  it('keeps it current while the page stays open', () => {
    expect(/function OpenBadge\b[\s\S]*?\n\}/.exec(landing)?.[0]).toMatch(/setInterval\(/);
  });
});
