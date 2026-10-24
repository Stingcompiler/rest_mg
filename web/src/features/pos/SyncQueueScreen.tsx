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

import { AppHeader, Button, ConfirmDialog, EmptyState, Numeric, Pager, StatusChip } from '@/components';
import {
  allOutboxEntries,
  discardRefusedOutboxEntry,
  holdOutboxEntry,
  isOutboxHeld,
  openDatabase,
  retryOutboxNow,
  toMinor,
  type OutboxRecord,
  type OrderRecord,
  type AvailabilityChangeRecord,
  type PriceChangeRecord,
  type ShiftRecord,
} from '@/db';
import { useAuth } from '@/features/auth/AuthProvider';
import { formatTime, useI18n } from '@/i18n';
import { clampOffset, pageLocal } from '@/lib/paging';
import { usePos } from './PosProvider';
import { PosRail } from './PosRail';
import { refusalKey, refusalMessageKey } from './syncRefusal';

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
  availability: 'pos.sync.type.availability',
} as const;

/**
 * A one-line description of what the queued record actually is. A price or
 * availability change names the dish: it used to show the item's id, a UUID.
 */
function describe(
  entry: OutboxRecord,
  money: (minor: bigint) => string,
  itemName: (id: string) => string,
): { label: string; amount?: string } {
  if (entry.type === 'order') {
    const order = entry.payload as OrderRecord;
    return { label: order.number, amount: money(toMinor(order.totalMinor)) };
  }
  if (entry.type === 'shift') {
    return { label: (entry.payload as ShiftRecord).name };
  }
  if (entry.type === 'availability') {
    return { label: itemName((entry.payload as AvailabilityChangeRecord).itemId) };
  }
  const change = entry.payload as PriceChangeRecord;
  return { label: itemName(change.itemId ?? ''), amount: money(toMinor(change.newPriceMinor)) };
}

export function SyncQueueScreen() {
  const i18n = useI18n();
  const pos = usePos();
  const [entries, setEntries] = useState<OutboxRecord[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  // Discarding a bill that may hold takings is a manager's decision (batch 63).
  const auth = useAuth();
  const canDiscard = auth.user !== null && ['owner', 'manager'].includes(auth.user.role);
  const [discarding, setDiscarding] = useState<OutboxRecord | null>(null);

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

  const keep = async (entry: OutboxRecord) => {
    const db = await openDatabase();
    await holdOutboxEntry(db, entry.id);
    await load();
  };

  const discard = async (entry: OutboxRecord) => {
    const db = await openDatabase();
    await discardRefusedOutboxEntry(db, entry.id);
    setDiscarding(null);
    await load();
  };

  const waiting = (entries ?? []).filter((entry) => entry.lastError === null);
  const held = (entries ?? []).filter((entry) => entry.lastError !== null && isOutboxHeld(entry));
  const refused = (entries ?? []).filter((entry) => entry.lastError !== null && !isOutboxHeld(entry));

  return (
    <div className="flex h-dvh bg-bg text-text" dir={i18n.dir}>
      <PosRail active="sync" />
      <div className="flex min-w-0 flex-1 flex-col pb-mobile-nav md:pb-0">
        <AppHeader
          title={
            <span className="flex items-baseline gap-8 text-ar-xl font-semibold">
              {i18n.t('pos.sync.title')}
              {/* No count for an empty queue: «٠» reads as a dot (batch 52). */}
              {entries?.length ? <Numeric className="text-num-lg text-text-muted">{i18n.int(entries.length)}</Numeric> : null}
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
                {waiting.length > 0 || refused.length > 0 || held.length > 0 ? (
                  <span className="text-ar-base">
                    {i18n.t('pos.sync.summary', {
                      waiting: i18n.int(waiting.length),
                      refused: i18n.int(refused.length),
                    })}
                    {held.length > 0 ? i18n.t('pos.sync.summaryHeld', { count: i18n.int(held.length) }) : ''}
                  </span>
                ) : null}
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
                  const { label, amount } = describe(
                    entry,
                    i18n.money,
                    (id) => pos.itemById.get(id)?.toSnapshot().nameAr ?? i18n.t('pos.sync.unknownItem'),
                  );
                  const isRefused = entry.lastError !== null;
                  const isKept = isRefused && isOutboxHeld(entry);
                  const kind = entry.type === 'order' ? 'order' : entry.type === 'shift' ? 'shift' : 'change';
                  return (
                    <div
                      key={entry.id}
                      className={
                        // A record that only exists on this device looks different in
                        // its shape, not only its colour: a dashed line (Design
                        // Reference §8, batch 62). A refused one keeps the danger line.
                        isRefused
                          ? 'flex flex-col gap-8 rounded-lg border border-danger bg-surface p-14'
                          : 'flex flex-col gap-8 rounded-lg border border-dashed border-line-strong bg-surface p-14'
                      }
                    >
                      <div className="flex flex-wrap items-center gap-x-14 gap-y-6">
                        <span className="text-ar-sm text-text-muted">{i18n.t(TYPE_KEY[entry.type])}</span>
                        <span dir="ltr">
                          <Numeric className="text-num-base font-semibold">{label}</Numeric>
                        </span>
                        {amount ? <Numeric className="text-num-base">{amount}</Numeric> : null}
                        <span className="numeric text-ar-sm text-text-muted">
                          {formatTime(new Date(entry.createdAt))}
                        </span>
                        {/* Waiting is the normal state of a till that was offline, not a
                            warning: neutral. Being sent right now is the action colour. */}
                        <StatusChip
                          label={i18n.t(isKept ? 'pos.sync.held' : isRefused ? 'pos.sync.refused' : busy ? 'pos.sync.sending' : 'pos.sync.waiting')}
                          tone={isKept ? 'neutral' : isRefused ? 'danger' : busy ? 'accent' : 'neutral'}
                          dot
                        />
                        <div className="ms-auto flex items-center gap-8">
                          {entry.attempts > 0 ? (
                            <span className="text-ar-xs text-text-muted">
                              {i18n.plural('pos.sync.attempts', entry.attempts)}
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
                          <span className="flex min-w-0 flex-col gap-4 break-words">
                            <span>
                              {i18n.t('pos.sync.reason')}: {i18n.t(refusalMessageKey(entry.lastError ?? ''))}
                            </span>
                            {refusalKey(entry.lastError ?? '') === null && entry.lastError ? (
                              <details className="text-ar-xs text-text-muted">
                                <summary className="cursor-pointer">{i18n.t('pos.sync.refusal.details')}</summary>
                                <code dir="ltr" className="block whitespace-pre-wrap break-all">
                                  {entry.lastError}
                                </code>
                              </details>
                            ) : null}
                          </span>
                        </div>
                      ) : null}

                      {/* Two decisions, each with what it costs (Design Reference
                          §8, batch 63). Trying again is the button above. */}
                      {isRefused ? (
                        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2">
                          <div className="flex flex-col gap-6">
                            {isKept ? (
                              <span className="text-ar-sm text-text-muted">{i18n.t('pos.sync.keptNote')}</span>
                            ) : (
                              <>
                                <Button variant="secondary" onClick={() => void keep(entry)}>
                                  {i18n.t('pos.sync.keepLocal')}
                                </Button>
                                <span className="text-ar-xs text-text-muted">{i18n.t('pos.sync.keepConsequence')}</span>
                              </>
                            )}
                          </div>
                          <div className="flex flex-col gap-6">
                            {canDiscard ? (
                              <>
                                <Button variant="quietDanger" onClick={() => setDiscarding(entry)}>
                                  {i18n.t('pos.sync.discard')}
                                </Button>
                                <span className="text-ar-xs text-text-muted">{i18n.t(`pos.sync.discardConsequence.${kind}` as const)}</span>
                              </>
                            ) : (
                              <span className="text-ar-xs text-text-muted">{i18n.t('pos.sync.askManager')}</span>
                            )}
                          </div>
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

      <ConfirmDialog
        open={discarding !== null}
        title={i18n.t('pos.sync.discardTitle')}
        body={
          discarding
            ? i18n.t(
                `pos.sync.discardConsequence.${discarding.type === 'order' ? 'order' : discarding.type === 'shift' ? 'shift' : 'change'}` as const,
              )
            : undefined
        }
        confirmLabel={i18n.t('pos.sync.discardConfirm')}
        cancelLabel={i18n.t('common.cancel')}
        onConfirm={() => discarding && void discard(discarding)}
        onCancel={() => setDiscarding(null)}
      />
    </div>
  );
}
