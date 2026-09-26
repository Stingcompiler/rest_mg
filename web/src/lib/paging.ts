/**
 * Paging, as arithmetic separate from any screen.
 *
 * Four server lists and two local ones grow without a ceiling — the activity
 * log, orders, deliveries, customers, the sync queue and the day's receipts.
 * They all page the same way, so the sums live here once: which rows a page
 * covers, whether there is another one, and where it starts.
 *
 * The server's envelope and a local array are deliberately reduced to the same
 * shape. A screen paging IndexedDB should not have to be written differently
 * from a screen paging Django, and `PageWindow` is what both hand to the pager.
 */

/** The envelope every paginated endpoint answers with. Mirrors `core/query.py`. */
export interface Page<T> {
  results: T[];
  total: number;
  limit: number;
  offset: number;
  /** null on the last page, so the caller never computes the end itself. */
  next_offset: number | null;
}

export interface PageWindow {
  /** 1-based, for display: "showing 51–100 of 431". Both are 0 when empty. */
  from: number;
  to: number;
  total: number;
  /** 1-based page number and count, for "page 2 of 9". */
  page: number;
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
  prevOffset: number;
  nextOffset: number;
}

const DEFAULT_PAGE_SIZE = 50;

export function pageWindow(total: number, limit: number, offset: number): PageWindow {
  const size = Math.max(1, limit);
  const start = Math.max(0, offset);
  // An empty list reads "0 of 0", not "1–0 of 0".
  const shown = Math.max(0, Math.min(size, total - start));
  return {
    from: shown === 0 ? 0 : start + 1,
    to: shown === 0 ? 0 : start + shown,
    total,
    page: Math.floor(start / size) + 1,
    pageCount: Math.max(1, Math.ceil(total / size)),
    hasPrev: start > 0,
    hasNext: start + size < total,
    prevOffset: Math.max(0, start - size),
    nextOffset: start + size,
  };
}

/**
 * The same window for a list already in memory — the sync queue, the day's
 * closed orders. Returns the rows plus the window, so a local screen and a
 * server-backed screen render the identical pager.
 */
export function pageLocal<T>(
  rows: readonly T[],
  limit: number = DEFAULT_PAGE_SIZE,
  offset = 0,
): { results: T[]; window: PageWindow } {
  const size = Math.max(1, limit);
  const start = Math.max(0, offset);
  return {
    results: rows.slice(start, start + size),
    window: pageWindow(rows.length, size, start),
  };
}

/**
 * Where to land after the list underneath has shrunk — a queue drained, a
 * customer retired. Staying on a page that no longer exists shows an empty
 * screen and no way back, so step to the last page that does.
 */
export function clampOffset(total: number, limit: number, offset: number): number {
  const size = Math.max(1, limit);
  if (total <= 0) return 0;
  if (offset < size) return 0;
  const lastStart = Math.floor(Math.max(0, total - 1) / size) * size;
  return Math.min(Math.max(0, offset), lastStart);
}

export { DEFAULT_PAGE_SIZE };
