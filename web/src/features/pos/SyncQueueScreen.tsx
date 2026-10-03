'use client';

/**
 * What is still waiting to reach the server, and a way to push it now.
 *
 * The till works offline by design, so a queue is normal and not an error. What
 * was missing was any way to *look* at it: a cashier could be told "5 bills have
 * not reached the server" with no way to see which, why, or to do anything about
 * it except wait for the next interval.
 *
 * Two states are kept visibly apart, because they call for opposite responses:
 * something **waiting to send** clears itself once the line returns, while
 * something **the server refused** never will, and someone has to be told.
 */
import { useCallback, useEffect, useState } from 'react';
import { CloudOff, CloudUpload, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

import { AppHeader, Button, EmptyState, Numeric, Pager, StatusChip } from '@/components';
import {
  allOutboxEntries,
  openDatabase,
  retryOutboxNow,
  toMinor,
  type OutboxRecord,
  type OrderRecord,
  type PriceChangeRecord,
  type ShiftRecord,
} from '@/db';
import { formatTime, useI18n } from '@/i18n';
import { clampOffset, pageLocal } from '@/lib/paging';
import { usePos } from './PosProvider';
import { PosRail } from './PosRail';
import { refusalKey } from './syncRefusal';

/**
 * The queue is rendered a page at a time.
 *
 * Not for the sake of tidiness: a till that has been off the line for a busy day
 * can hold thousands of records, and drawing every one of them at once is how a
 * cheap Android tablet stops responding — on the very screen someone opened
 * because sync was already going wrong.
 */
const PAGE_SIZE = 25;

const TYPE_KEY = {
  order: 'pos.sync.type.order',
  shift: 'pos.sync.type.shift',
  price_change: 'pos.sync.type.price_change',
} as const;

/** A one-line description of what the queued record actually is. */
function describe(entry: OutboxRecord, money: (minor: bigint) => string): { label: string; amount?: string } {
  if (entry.type === 'order') {
    const order = entry.payload as OrderRecord;
    return { label: order.number, amount: money(toMinor(order.totalMinor)) };
  }
  if (entry.type === 'shift') {
    return { label: (entry.payload as ShiftRecord).name };
  }
  const change = entry.payload as PriceChangeRecord;
  return { label: change.itemId ?? '', amount: money(toMinor(change.newPriceMinor)) };
}

export function SyncQueueScreen() {
  const i18n = useI18n();
  const pos = usePos();
  const [entries, setEntries] = useState<OutboxRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    const db = await openDatabase();
    const rows = await allOutboxEntries(db);
    setEntries(rows);
    // The queue drains underneath this screen. Staying on a page that no longer
    // exists would show an empty list with no way back, so step to the last one
    // that does.
    setOffset((current) => clampOffset(rows.length, PAGE_SIZE, current));
  }, []);

  useEffect(() => {
    void load();
    // The queue also drains in the background, so keep the view honest.
    const timer = setInterval(() => void load(), 5_000);
    return () => clearInterval(timer);
  }, [load]);

  // "Try again now" means two things: clear the backoff holding these records
  // back, then actually run a sync. Either on its own would look broken.
  const retry = async (ids?: string[]) => {
    setBusy(true);
    setNote(null);
    try {
      const db = await openDatabase();
      await retryOutboxNow(db, ids);
      pos.syncNow();
      // Give the run a moment to land before reporting what is left.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const left = await allOutboxEntries(db);
      setEntries(left);
      setNote(
        left.length === 0
          ? i18n.t('pos.sync.doneAll')
          : i18n.t('pos.sync.stillPending', { count: i18n.int(left.length) }),
      );
    } finally {
      setBusy(false);
    }
  };

  const waiting = (entries ?? []).filter((entry) => entry.lastError === null);
  const refused = (entries ?? []).filter((entry) => entry.lastError !== null);

  return (
    <div className="flex h-screen bg-bg text-text" dir={i18n.dir}>
      <PosRail active="sync" />
      <div className="flex min-w-0 flex-1 flex-col pb-mobile-nav md:pb-0">
        <AppHeader
          title={
            <span className="flex items-baseline gap-8 text-ar-xl font-semibold">
              {i18n.t('pos.sync.title')}
              <Numeric className="text-num-lg text-text-muted">{i18n.int(entries?.length ?? 0)}</Numeric>
            </span>
          }
          trailing={
            <StatusChip
              label={i18n.t(pos.online ? 'pos.status.online' : 'pos.status.offline')}
              tone={pos.online ? 'success' : 'warning'}
              dot
            />
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-16">
          <div className="mx-auto flex max-w-3xl flex-col gap-14">
            <div className="flex flex-wrap items-center justify-between gap-12 rounded-lg border border-line bg-surface p-16">
              <div className="flex flex-col gap-4">
                <span className="text-ar-base">
                  {i18n.t('pos.sync.summary', {
                    waiting: i18n.int(waiting.length),
                    refused: i18n.int(refused.length),
                  })}
                </span>
                {!pos.online ? (
                  <span className="flex items-center gap-6 text-ar-sm text-warning">
                    <CloudOff size={15} />
                    {i18n.t('pos.sync.offlineNote')}
                  </span>
                ) : null}
              </div>
              <Button
                variant="primary"
                onClick={() => void retry()}
                disabled={busy || (entries ?? []).length === 0}
              >
                <span className="flex items-center gap-6">
                  <RefreshCw size={18} className={busy ? 'animate-spin' : undefined} />
                  {busy ? i18n.t('pos.sync.syncing') : i18n.t('pos.sync.retryAll')}
                </span>
              </Button>
            </div>

            {note ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-8 rounded-lg border border-line bg-surface-2 px-14 py-10 text-ar-base text-text-muted"
              >
                <CheckCircle2 size={17} className="text-success" />
                {note}
              </div>
            ) : null}

            {entries === null ? null : entries.length === 0 ? (
              <EmptyState title={i18n.t('pos.sync.empty')} icon={<CloudUpload size={30} />} />
            ) : (
              <div className="flex flex-col gap-8">
                {pageLocal(entries, PAGE_SIZE, offset).results.map((entry) => {
                  const { label, amount } = describe(entry, i18n.money);
                  const isRefused = entry.lastError !== null;
                  return (
                    <div
                      key={entry.id}
                      className={
                        isRefused
                          ? 'flex flex-col gap-8 rounded-lg border border-danger bg-surface p-14'
                          : 'flex flex-col gap-8 rounded-lg border border-line bg-surface p-14'
                      }
                    >
                      <div className="flex flex-wrap items-center gap-x-14 gap-y-6">
                        <span className="text-ar-sm text-text-muted">{i18n.t(TYPE_KEY[entry.type])}</span>
                        <span dir="ltr">
                          <Numeric className="text-num-base font-semibold">{label}</Numeric>
                        </span>
                        {amount ? <Numeric className="text-num-base">{amount}</Numeric> : null}
                        <span className="text-ar-sm text-text-muted">
                          {formatTime(new Date(entry.createdAt))}
                        </span>
                        <StatusChip
                          label={i18n.t(isRefused ? 'pos.sync.refused' : 'pos.sync.waiting')}
                          tone={isRefused ? 'danger' : 'warning'}
                          dot
                        />
                        <div className="ms-auto flex items-center gap-8">
                          {entry.attempts > 0 ? (
                            <span className="text-ar-xs text-text-muted">
                              {i18n.t('pos.sync.attempts', { count: i18n.int(entry.attempts) })}
                            </span>
                          ) : null}
                          <Button variant="secondary" onClick={() => void retry([entry.id])} disabled={busy}>
                            {i18n.t('pos.sync.retryOne')}
                          </Button>
                        </div>
                      </div>

                      {isRefused ? (
                        <div className="flex items-start gap-8 rounded-md bg-danger-tint px-12 py-8 text-ar-sm text-danger">
                          <AlertTriangle size={15} className="mt-2 flex-none" />
                          <span className="min-w-0 break-words">
                            {i18n.t('pos.sync.reason')}:{' '}
                            {(() => {
                              const known = refusalKey(entry.lastError ?? '');
                              return known ? i18n.t(known) : entry.lastError;
                            })()}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <Pager
                  window={pageLocal(entries, PAGE_SIZE, offset).window}
                  onOffset={setOffset}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
