'use client';

/**
 * The activity log, in full — who did what, and when.
 *
 * The dashboard carries a short tail of the same list; this is the page for the
 * question that tail cannot answer: *what has this person been doing*, or *what
 * happened on that day*. Filtering by user and by date is the point, so both are
 * present at the top and compose with each other.
 *
 * The "who" list comes from the log rather than from the staff roster, so
 * somebody who has since been deactivated is still selectable — their history
 * would otherwise become unreachable the day they left.
 */
import { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';

import { Button, Pager } from '@/components';
import { useI18n } from '@/i18n';
import { pageWindow } from '@/lib/paging';
import { ManagerShell } from './ManagerShell';
import { ActivityLog } from './ActivityLog';
import { useAuditActors, useAuditLog } from './hooks';
import type { AuditQuery } from './api';

/** The families a manager actually thinks in, not every leaf action. */
const ACTION_GROUPS = ['staff', 'item', 'category', 'price', 'delivery'] as const;

/** The log is read a screenful at a time; the rest is a click away. */
const PAGE_SIZE = 50;

const inputClass =
  'min-h-control-lg rounded-md border border-line bg-surface px-12 text-ar-base text-text outline-none focus-visible:border-accent';

export function ActivityScreen() {
  const i18n = useI18n();
  const actors = useAuditActors();
  const [actor, setActor] = useState('');
  const [group, setGroup] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);

  // Any change of filter is a different list, so page 3 of the old one is not a
  // meaningful place to be standing. Go back to the top.
  useEffect(() => {
    setOffset(0);
  }, [actor, group, from, to]);

  // A date input gives a bare YYYY-MM-DD; the server reads that as midnight in
  // the restaurant's timezone. `to` is pushed to the end of its day so a filter
  // of "to: today" includes what happened this afternoon.
  const query: AuditQuery = {
    actor: actor || undefined,
    action: group || undefined,
    from: from || undefined,
    to: to ? `${to}T23:59:59` : undefined,
    limit: PAGE_SIZE,
    offset,
  };

  const log = useAuditLog(query);
  const filtered = Boolean(actor || group || from || to);
  const clear = () => {
    setActor('');
    setGroup('');
    setFrom('');
    setTo('');
  };

  return (
    <ManagerShell title={i18n.t('manager.audit.pageTitle')} description={i18n.t('manager.audit.description')}>
      <div className="flex flex-col gap-16">
        <div className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-16">
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
              {i18n.t('manager.audit.filterUser')}
              <select className={inputClass} value={actor} onChange={(e) => setActor(e.target.value)}>
                <option value="">{i18n.t('manager.audit.allUsers')}</option>
                {(actors.data ?? []).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
              {i18n.t('manager.audit.filterAction')}
              <select className={inputClass} value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">{i18n.t('manager.audit.allActions')}</option>
                {ACTION_GROUPS.map((key) => (
                  <option key={key} value={key}>
                    {i18n.t(`manager.audit.group.${key}` as never)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
              {i18n.t('manager.audit.filterFrom')}
              <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
            </label>

            <label className="flex flex-col gap-6 text-ar-sm text-text-muted">
              {i18n.t('manager.audit.filterTo')}
              <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
            </label>
          </div>

          <div className="flex items-center justify-between gap-12">
            <span className="text-ar-sm text-text-muted">
              {i18n.t('manager.audit.results', { count: i18n.int(log.data?.total ?? 0) })}
            </span>
            {filtered ? (
              <Button variant="secondary" onClick={clear}>
                <span className="flex items-center gap-6">
                  <X size={16} />
                  {i18n.t('manager.audit.clear')}
                </span>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-8 rounded-lg border border-line bg-surface px-16">
          <span className="flex items-center gap-8 pt-14 text-ar-md text-text-muted">
            <History size={18} className="text-accent" />
            {i18n.t('manager.audit.title')}
          </span>
          <ActivityLog query={query} />
        </div>

        <Pager
          window={pageWindow(log.data?.total ?? 0, PAGE_SIZE, offset)}
          onOffset={setOffset}
          busy={log.isFetching}
        />
      </div>
    </ManagerShell>
  );
}
