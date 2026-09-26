/**
 * The paging arithmetic.
 *
 * Every off-by-one here is visible to somebody: a receipt that cannot be found
 * because the last page is unreachable, a "51-100 of 47" that makes the screen
 * look broken, or a Next button that stays live at the end of the list.
 */
import { describe, expect, it } from 'vitest';

import { clampOffset, pageLocal, pageWindow } from '@/lib/paging';

describe('pageWindow', () => {
  it('reads the first page as 1 to the page size', () => {
    const win = pageWindow(431, 50, 0);
    expect([win.from, win.to, win.total]).toEqual([1, 50, 431]);
    expect(win.page).toBe(1);
    expect(win.pageCount).toBe(9);
    expect(win.hasPrev).toBe(false);
    expect(win.hasNext).toBe(true);
  });

  it('counts a middle page from the offset, not from one', () => {
    const win = pageWindow(431, 50, 100);
    expect([win.from, win.to]).toEqual([101, 150]);
    expect(win.page).toBe(3);
    expect(win.prevOffset).toBe(50);
    expect(win.nextOffset).toBe(150);
  });

  it('stops the last page at the real total', () => {
    // 431 rows in pages of 50: the ninth page holds 31, not 50.
    const win = pageWindow(431, 50, 400);
    expect([win.from, win.to]).toEqual([401, 431]);
    expect(win.hasNext).toBe(false);
    expect(win.page).toBe(9);
  });

  it('says nothing rather than "1-0" when the list is empty', () => {
    const win = pageWindow(0, 50, 0);
    expect([win.from, win.to, win.total]).toEqual([0, 0, 0]);
    expect(win.hasPrev).toBe(false);
    expect(win.hasNext).toBe(false);
    // Still "page 1 of 1" — an empty list is not "page 1 of 0".
    expect(win.pageCount).toBe(1);
  });

  it('has no next page when one page holds everything', () => {
    const win = pageWindow(12, 50, 0);
    expect(win.hasNext).toBe(false);
    expect([win.from, win.to]).toEqual([1, 12]);
  });

  it('reports an empty window past the end, not a range that runs backwards', () => {
    // An offset past the end shows nothing, so it must read "0-0", never
    // "0-500" — the label is the only thing telling the reader where they are.
    const win = pageWindow(10, 50, 500);
    expect([win.from, win.to]).toEqual([0, 0]);
    expect(win.hasNext).toBe(false);
  });

  it('survives a zero or negative page size', () => {
    // Clamped rather than dividing by zero.
    expect(pageWindow(10, 0, 0).pageCount).toBe(10);
    expect(pageWindow(10, -5, 0).to).toBe(1);
  });
});

describe('pageLocal', () => {
  const rows = Array.from({ length: 25 }, (_, i) => i);

  it('slices the page and describes it the same way as the server', () => {
    const { results, window: win } = pageLocal(rows, 10, 10);
    expect(results).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect([win.from, win.to, win.total]).toEqual([11, 20, 25]);
    expect(win.hasNext).toBe(true);
  });

  it('returns the short remainder on the last page', () => {
    const { results, window: win } = pageLocal(rows, 10, 20);
    expect(results).toEqual([20, 21, 22, 23, 24]);
    expect(win.hasNext).toBe(false);
  });

  it('returns nothing past the end without throwing', () => {
    expect(pageLocal(rows, 10, 900).results).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(pageLocal([], 10, 0).results).toEqual([]);
    expect(pageLocal([], 10, 0).window.total).toBe(0);
  });
});

describe('clampOffset', () => {
  // The queue drains and the day's bills grow while somebody is reading them.
  it('leaves a still-valid offset alone', () => {
    expect(clampOffset(100, 25, 50)).toBe(50);
  });

  it('steps back to the last real page when the list shrinks', () => {
    // 30 rows left, pages of 25: the last page starts at 25, not 75.
    expect(clampOffset(30, 25, 75)).toBe(25);
  });

  it('goes to the top when everything is gone', () => {
    expect(clampOffset(0, 25, 75)).toBe(0);
  });

  it('lands on a page boundary, never mid-page', () => {
    expect(clampOffset(26, 25, 999)).toBe(25);
    expect(clampOffset(25, 25, 999)).toBe(0);
  });

  it('never returns a negative offset', () => {
    expect(clampOffset(100, 25, -10)).toBe(0);
  });
});
