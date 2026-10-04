/**
 * Opening hours with real days (batch 23).
 *
 * A row carries `days` (0 = Sunday … 6 = Saturday, as Date#getDay) and HH:MM
 * times. A closing time before the opening one is a late night that ends
 * after midnight; equal times are open the whole day. Rows saved before days
 * existed have only a label and times: they still show, but cannot say
 * whether the restaurant is open now.
 *
 * Everything is read on the restaurant's clock, not the visitor's phone.
 */
export interface HoursRow {
  days?: number[];
  open?: string;
  close?: string;
  day_ar?: string;
  day_en?: string;
}

/** The Sudanese week, from Saturday. */
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5] as const;

const DAY_MINUTES = 1440;
const WEEK_MINUTES = 7 * DAY_MINUTES;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A weekday's name: 0 is Sunday. */
export function dayName(day: number, locale: 'ar' | 'en'): string {
  // 1 January 2023 was a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)));
}

/** "السبت – الخميس" for a run of days, a list otherwise, "كل يوم" for all seven. */
export function dayRangeLabel(days: readonly number[], locale: 'ar' | 'en'): string {
  const ordered = WEEK_ORDER.filter((day) => days.includes(day));
  if (ordered.length === 7) return locale === 'ar' ? 'كل يوم' : 'Every day';
  const names = ordered.map((day) => dayName(day, locale));
  if (names.length === 1) return names[0]!;
  const positions = ordered.map((day) => WEEK_ORDER.indexOf(day));
  const isRun = positions.every((position, index) => index === 0 || position === positions[index - 1]! + 1);
  if (isRun) return `${names[0]} – ${names[names.length - 1]}`;
  return names.join(locale === 'ar' ? '، ' : ', ');
}

export type OpenState =
  | { open: true; closes: string }
  /** `when` is "today", "tomorrow", or the weekday (0 = Sunday) it next opens. */
  | { open: false; opens: string; when: 'today' | 'tomorrow' | number };

function minutes(time: string): number | null {
  const match = TIME.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The weekday and minute of the day at an instant, on a zone's clock. */
function clock(now: Date, timeZone: string): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: WEEKDAY[part('weekday')] ?? 0, minute: Number(part('hour')) * 60 + Number(part('minute')) };
}

/** Whether the restaurant is open at `now`, and when it closes or next opens. */
export function openState(rows: readonly HoursRow[], now: Date, timeZone: string): OpenState | null {
  // Every span in the week, in minutes from Sunday 00:00, with the row's times.
  const spans: { start: number; end: number; open: string; close: string }[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.days) || !row.open || !row.close) continue;
    const open = minutes(row.open);
    const close = minutes(row.close);
    if (open === null || close === null) continue;
    for (const day of row.days) {
      const start = day * DAY_MINUTES + open;
      const end = close > open ? day * DAY_MINUTES + close : close === open ? start + DAY_MINUTES : (day + 1) * DAY_MINUTES + close;
      // The week before and after too: Saturday's late night runs into Sunday.
      for (const shift of [-WEEK_MINUTES, 0, WEEK_MINUTES]) {
        spans.push({ start: start + shift, end: end + shift, open: row.open, close: row.close });
      }
    }
  }
  if (spans.length === 0) return null;

  const { day, minute } = clock(now, timeZone);
  const at = day * DAY_MINUTES + minute;

  const current = spans.filter((span) => span.start <= at && at < span.end).sort((a, b) => b.end - a.end)[0];
  if (current) return { open: true, closes: current.close };

  const next = spans.filter((span) => span.start > at).sort((a, b) => a.start - b.start)[0]!;
  const daysAway = Math.floor(next.start / DAY_MINUTES) - day;
  const when = daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : ((Math.floor(next.start / DAY_MINUTES) % 7) + 7) % 7;
  return { open: false, opens: next.open, when };
}
