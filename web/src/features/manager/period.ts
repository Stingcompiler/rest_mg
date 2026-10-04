/**
 * The period a dashboard figure covers.
 *
 * This exists because the manager's overview and the cashier's daily report
 * disagreed, and one reason was simply that they measured different spans: the
 * overview had no date filter at all and reported every closed order ever, while
 * the cashier's report is by definition today's. Two screens labelled "collected
 * revenue" showing different numbers is worse than either being absent, so the
 * period is now explicit and defaults to today.
 *
 * Boundaries are computed in the restaurant's own timezone, not the browser's —
 * a till in Khartoum should roll over at midnight in Khartoum.
 */
import { TIME_ZONE } from '@/i18n';

export type PeriodKey = 'today' | 'week' | 'month' | 'all';

export const PERIOD_KEYS: PeriodKey[] = ['today', 'week', 'month', 'all'];

/** The restaurant-local calendar date of an instant, as YYYY-MM-DD. */
function localDate(at: Date): string {
  // en-CA renders ISO-shaped dates, which is what we want to reassemble from.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** A calendar date `days` away from `date`, both YYYY-MM-DD. Zone-free. */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** How far the restaurant's clock is ahead of UTC at an instant, in ms. */
function zoneOffset(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const wallClock = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return wallClock - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant midnight begins on `date` in the restaurant's zone.
 *
 * Built from UTC arithmetic and the zone's offset, never from a Date parsed in
 * the browser's own zone — that is what made a manager abroad (or a CI machine
 * in UTC) see boundaries two hours off.
 */
function restaurantMidnight(date: string): Date {
  const utcMidnight = Date.parse(`${date}T00:00:00Z`);
  const guess = utcMidnight - zoneOffset(new Date(utcMidnight));
  // Re-read the offset at the guess, in case the zone changed its offset that night.
  return new Date(utcMidnight - zoneOffset(new Date(guess)));
}

/**
 * The `from`/`to` the revenue endpoint expects, or an empty object for "all".
 *
 * Half-open, `from <= t < to`, the server's rule too. `to` is the next midnight
 * rather than "now", so an order closed later in the day does not fall outside
 * a range the manager is still looking at.
 */
export function periodRange(period: PeriodKey, now = new Date()): { from?: string; to?: string } {
  if (period === 'all') return {};

  const today = localDate(now);
  const back = period === 'week' ? 6 : period === 'month' ? 29 : 0; // today plus the days before it
  return {
    from: restaurantMidnight(addDays(today, -back)).toISOString(),
    to: restaurantMidnight(addDays(today, 1)).toISOString(),
  };
}

const DAY_MS = 86_400_000;
const SPAN_DAYS: Record<Exclude<PeriodKey, 'all'>, number> = { today: 1, week: 7, month: 30 };

/**
 * The same span of the period before, up to the same time of day (batch 22).
 *
 * A morning measured against the whole of yesterday always looks like a bad
 * day, so "today" compares with yesterday from midnight up to this minute
 * yesterday; the week and the month likewise. Cut to the minute, so the
 * query key stays the same across renders within it. Khartoum keeps no
 * daylight saving, so a day back is 24 hours back.
 */
export function previousRange(period: PeriodKey, now = new Date()): { from: string; to: string } | null {
  if (period === 'all') return null;
  const days = SPAN_DAYS[period];
  const back = period === 'week' ? 6 : period === 'month' ? 29 : 0;
  const minute = Math.floor(now.getTime() / 60_000) * 60_000;
  return {
    from: restaurantMidnight(addDays(localDate(now), -back - days)).toISOString(),
    to: new Date(minute - days * DAY_MS).toISOString(),
  };
}

export interface Change {
  direction: 'up' | 'down' | 'flat';
  /** Whole percent, always positive; the direction carries the sign. */
  percent: number;
}

/** How a figure moved against the period before; nothing when that was zero. */
export function change(current: bigint, previous: bigint): Change | null {
  if (previous <= 0n) return null;
  const diff = current - previous;
  const magnitude = diff < 0n ? -diff : diff;
  const percent = Number((magnitude * 100n + previous / 2n) / previous);
  if (percent === 0) return { direction: 'flat', percent: 0 };
  return { direction: diff > 0n ? 'up' : 'down', percent };
}
