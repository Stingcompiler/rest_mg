/**
 * Opening hours with real days (batch 23).
 *
 * The hours were free text ("السبت – الخميس"), so the page could not tell a
 * visitor whether the restaurant is open now, and no screen could edit them.
 * A row now carries `days` (0 = Sunday … 6 = Saturday, as Date#getDay) and
 * HH:MM times. These pin how a row is named and how "open now" is worked out,
 * in the restaurant's own time zone.
 */
import { describe, expect, it } from 'vitest';

import { dayRangeLabel, openState, type HoursRow } from '@/lib/hours';

const TZ = 'Africa/Khartoum'; // UTC+2, no daylight saving

/** An instant at a Khartoum wall-clock time. 2026-10-04 is a Sunday. */
function at(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+02:00`);
}

const WEEK: HoursRow[] = [
  { days: [6, 0, 1, 2, 3, 4], open: '08:00', close: '23:00' },
  { days: [5], open: '13:00', close: '23:00' },
];

describe('dayRangeLabel', () => {
  it('names a run of days by its ends, in the Sudanese week from Saturday', () => {
    expect(dayRangeLabel([6, 0, 1, 2, 3, 4], 'ar')).toBe('السبت – الخميس');
    expect(dayRangeLabel([0, 1, 2, 3, 4, 6], 'en')).toBe('Saturday – Thursday');
  });

  it('names one day by itself, and every day as such', () => {
    expect(dayRangeLabel([5], 'ar')).toBe('الجمعة');
    expect(dayRangeLabel([0, 1, 2, 3, 4, 5, 6], 'ar')).toBe('كل يوم');
    expect(dayRangeLabel([0, 1, 2, 3, 4, 5, 6], 'en')).toBe('Every day');
  });

  it('lists days that are not a run', () => {
    expect(dayRangeLabel([5, 1], 'ar')).toBe('الاثنين، الجمعة');
    expect(dayRangeLabel([5, 1], 'en')).toBe('Monday, Friday');
  });
});

describe('openState', () => {
  it('is open within the hours, and says when it closes', () => {
    expect(openState(WEEK, at('2026-10-04', '14:30'), TZ)).toEqual({ open: true, closes: '23:00' });
  });

  it('is closed before opening, and opens later today', () => {
    expect(openState(WEEK, at('2026-10-04', '06:15'), TZ)).toEqual({ open: false, opens: '08:00', when: 'today' });
  });

  it('is closed after closing, and opens tomorrow', () => {
    // Thursday night: Friday opens late.
    expect(openState(WEEK, at('2026-10-08', '23:30'), TZ)).toEqual({ open: false, opens: '13:00', when: 'tomorrow' });
  });

  it('names the day when the next opening is further off', () => {
    const weekdays: HoursRow[] = [{ days: [1], open: '09:00', close: '17:00' }];
    // Tuesday evening: next Monday.
    expect(openState(weekdays, at('2026-10-06', '18:00'), TZ)).toEqual({ open: false, opens: '09:00', when: 1 });
  });

  it('stays open past midnight on a late night', () => {
    const late: HoursRow[] = [{ days: [4], open: '18:00', close: '02:00' }];
    // Thursday 18:00 to Friday 02:00. At 01:00 on Friday it is still Thursday's night.
    expect(openState(late, at('2026-10-09', '01:00'), TZ)).toEqual({ open: true, closes: '02:00' });
    expect(openState(late, at('2026-10-09', '02:30'), TZ)).toMatchObject({ open: false });
  });

  it('opens again for the second half of a split day', () => {
    const split: HoursRow[] = [
      { days: [0], open: '07:00', close: '11:00' },
      { days: [0], open: '16:00', close: '23:00' },
    ];
    expect(openState(split, at('2026-10-04', '13:00'), TZ)).toEqual({ open: false, opens: '16:00', when: 'today' });
  });

  it('reads the restaurant clock, not the visitor’s', () => {
    // 21:30 UTC is 23:30 in Khartoum: closed, whatever the phone's zone.
    expect(openState(WEEK, new Date('2026-10-04T21:30:00Z'), TZ)).toMatchObject({ open: false });
  });

  it('says nothing when the hours have no days to read', () => {
    expect(openState([{ day_ar: 'يوميًا', open: '08:00', close: '23:00' }], at('2026-10-04', '12:00'), TZ)).toBeNull();
    expect(openState([], at('2026-10-04', '12:00'), TZ)).toBeNull();
  });
});
