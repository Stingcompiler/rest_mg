'use client';

/**
 * The pager: what you are looking at, and how to see the rest.
 *
 * It reads the count aloud ("51-100 of 431") rather than only offering arrows,
 * because on a list of debts or of activity the size of the thing is itself the
 * information — a manager needs to know the log has four thousand entries, not
 * merely that another page exists.
 *
 * Direction is left to the document. The arrows are logical (`rotate-180` under
 * RTL is handled by the icon choice, not by swapping handlers), so "next"
 * always means further down the list in both Arabic and English.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useI18n } from '@/i18n';
import type { PageWindow } from '@/lib/paging';
import { Button } from './controls';

export interface PagerProps {
  window: PageWindow;
  onOffset: (offset: number) => void;
  /** Hidden entirely when a single page holds everything. */
  hideWhenSingle?: boolean;
  busy?: boolean;
}

export function Pager({ window: win, onOffset, hideWhenSingle = true, busy }: PagerProps) {
  const i18n = useI18n();
  if (hideWhenSingle && !win.hasPrev && !win.hasNext) return null;

  // In RTL "onward" points left; the icons mirror so the arrow always aims the
  // way the reader's eye travels.
  const Onward = i18n.dir === 'rtl' ? ChevronLeft : ChevronRight;
  const Back = i18n.dir === 'rtl' ? ChevronRight : ChevronLeft;

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-12 rounded-lg border border-line bg-surface px-14 py-10"
      aria-label={i18n.t('pager.label')}
    >
      <span className="text-ar-sm text-text-muted">
        {i18n.t('pager.showing', {
          from: i18n.int(win.from),
          to: i18n.int(win.to),
          total: i18n.int(win.total),
        })}
      </span>
      <div className="flex items-center gap-8">
        <span className="text-ar-sm text-text-muted">
          {i18n.t('pager.page', { page: i18n.int(win.page), count: i18n.int(win.pageCount) })}
        </span>
        <Button
          variant="secondary"
          disabled={!win.hasPrev || busy}
          onClick={() => onOffset(win.prevOffset)}
          aria-label={i18n.t('pager.previous')}
        >
          <span className="flex items-center gap-6">
            <Back size={18} />
            {i18n.t('pager.previous')}
          </span>
        </Button>
        <Button
          variant="secondary"
          disabled={!win.hasNext || busy}
          onClick={() => onOffset(win.nextOffset)}
          aria-label={i18n.t('pager.next')}
        >
          <span className="flex items-center gap-6">
            {i18n.t('pager.next')}
            <Onward size={18} />
          </span>
        </Button>
      </div>
    </nav>
  );
}
