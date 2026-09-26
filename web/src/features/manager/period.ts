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

/**
 * The `from`/`to` the revenue endpoint expects, or an empty object for "all".
 *
 * `to` is the end of today rather than "now", so an order closed later in the
 * day does not fall outside a range the manager is still looking at.
 */
export function periodRange(period: PeriodKey, now = new Date()): { from?: string; to?: string } {
  if (period === 'all') return {};

  const startOfToday = new Date(`${localDate(now)}T00:00:00`);
  const from = new Date(startOfToday);
  if (period === 'week') from.setDate(from.getDate() - 6); // today plus the six before it
  if (period === 'month') from.setDate(from.getDate() - 29);

  const to = new Date(startOfToday);
  to.setDate(to.getDate() + 1);

  return { from: from.toISOString(), to: to.toISOString() };
}
