/**
 * The opening-hours editor's rules (batch 23): what stops a save, and what is
 * sent. A row with days needs at least one day and both times. Saved rows
 * carry their labels in both languages, so the public page shows them as it
 * always did; a row saved before days existed is sent back as it was.
 */
import type { MessageKey } from '@/i18n';
import { WEEK_ORDER, dayRangeLabel, type HoursRow } from '@/lib/hours';

export function hoursProblem(rows: readonly HoursRow[]): MessageKey | null {
  for (const row of rows) {
    if (!Array.isArray(row.days)) continue;
    if (row.days.length === 0) return 'manager.hours.needDay';
    if (!row.open || !row.close) return 'manager.hours.needTimes';
  }
  return null;
}

export function toSavedHours(rows: readonly HoursRow[]): HoursRow[] {
  return rows.map((row) => {
    if (!Array.isArray(row.days)) return row;
    const days = WEEK_ORDER.filter((day) => row.days!.includes(day));
    return {
      days,
      open: row.open,
      close: row.close,
      day_ar: dayRangeLabel(days, 'ar'),
      day_en: dayRangeLabel(days, 'en'),
    };
  });
}
