'use client';

/**
 * Shift close. Denomination count on the start side, sales-by-method and the
 * variance callout on the end side. The close is blocked while any order is open
 * on the till or while a variance beyond tolerance — short or over — has no
 * written reason. The entity decides, and the button reflects it.
 *
 * The counts shown are the shift's own, so a reload mid-count picks up where
 * the cashier left off instead of showing zeros over a non-zero total.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCircle2, Printer, TriangleAlert } from 'lucide-react';

import {
  AmountRow,
  Button,
  CalloutPanel,
  ConfirmDialog,
  DenominationRow,
  IconButton,
  Numeric,
  QtyStepper,
  TextField,
} from '@/components';
import { AppHeader } from '@/components/layout/layout';
import { useI18n } from '@/i18n';
import { DomainError, type Shift } from '@/domain';
import { buildPrintContext, printShiftReportToPaper } from '@/print';
import { usePos } from './PosProvider';
import { holdsSomething } from './shiftClose';
import { DENOMINATIONS } from './seed-data';

export function ShiftCloseScreen() {
  const pos = usePos();
  const i18n = useI18n();
  const router = useRouter();
  const shift = pos.shift;
  const countRows = shift.toSnapshot().counts;
  const counts = Object.fromEntries(countRows.map((row) => [row.label, row.count]));
  const lumpAmount = (label: string) => countRows.find((row) => row.label === label)?.lineTotalMinor ?? 0n;
  // Every bill still open on this till — the shift itself only holds the ones
  // it closed, so it cannot see these on its own.
  const openOrders = pos.cart.list().filter((order) => holdsSomething(order.toSnapshot()));
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // One press, one close. The handler is async, so without this the button
  // stays live while the write is in flight and a second tap reaches the
  // entity — which then refuses, and the cashier sees an error for having
  // done nothing wrong.
  const [closing, setClosing] = useState(false);
  // Closing is final and a new shift opens straight after, so it asks first.
  const [confirming, setConfirming] = useState(false);
  // The shift just closed, kept so its report can still be printed. Before,
  // the report could only be printed before closing, and the screen left at
  // once, so nobody saw the confirmation either.
  const [closed, setClosed] = useState<Shift | null>(null);

  const expected = shift.expectedCash();
  const counted = shift.countedCash();
  const variance = shift.variance();
  const blocking = shift.blockingReasons(openOrders.length);
  const isShort = variance < 0n;
  const isOver = variance > 0n;
  // Every method, not only the drawer. A till short by exactly the day's bank
  // transfers is not a missing-money problem, and the cashier being asked to
  // explain the difference is the one person who cannot see that yet.
  const totals = shift.totalsByMethod();

  const printReport = () => {
    setError(null);
    const ok = printShiftReportToPaper(shift, buildPrintContext(i18n.locale, i18n.numerals));
    setNote(i18n.t(ok ? 'pos.shift.printed' : 'pos.shift.printBlocked'));
  };

  const changeCount = (label: string, denominationMinor: bigint, delta: number) => {
    const next = Math.max(0, (counts[label] ?? 0) + delta);
    pos.setDenominationCount(denominationMinor, label, next);
  };

  const alreadyClosed = shift.status !== 'open';

  const close = async () => {
    if (closing || alreadyClosed) return;
    setError(null);
    setClosing(true);
    const closingShift = shift;
    try {
      await pos.closeShift();
      setConfirming(false);
      setClosed(closingShift);
    } catch (caught) {
      setConfirming(false);
      setClosing(false);
      // The entity refuses with a stable code; say why, on screen. This used to
      // go to the console, so the button simply appeared to do nothing.
      const code = caught instanceof DomainError ? `error.${caught.code}` : 'error.unknown';
      setError(i18n.t(code as Parameters<typeof i18n.t>[0]));
    }
  };

  if (closed) {
    return <ClosedShiftScreen shift={closed} onNext={() => router.push('/pos')} />;
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-text" dir={i18n.dir}>
      <AppHeader
        leading={
          <IconButton label={i18n.t('common.cancel')} onClick={() => router.push('/pos')}>
            <ArrowRight size={22} />
          </IconButton>
        }
        title={`${i18n.t('pos.shift.close')} · ${shift.toSnapshot().name}`}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-16 overflow-y-auto p-16 md:flex-row md:overflow-visible">
        <div className="flex w-full flex-none flex-col gap-10 md:w-denomination-panel">
          <span className="text-ar-base text-text-muted">{i18n.t('pos.shift.countByDenomination')}</span>
          {DENOMINATIONS.map(({ key, denominationMinor }) => {
            if (denominationMinor === null) {
              // Coins have no single face value: counted as one amount.
              const amount = lumpAmount(key);
              return (
                <DenominationRow
                  key={key}
                  note={i18n.t('pos.shift.coins')}
                  sum={i18n.money(amount)}
                  stepper={
                    <TextField
                      inputMode="numeric"
                      dir="ltr"
                      aria-label={i18n.t('pos.shift.coinsAmount')}
                      placeholder={i18n.int(0)}
                      value={amount > 0n ? amount.toString() : ''}
                      onChange={(event) =>
                        pos.setLumpAmount(key, BigInt(event.target.value.replace(/\D/g, '') || '0'))
                      }
                    />
                  }
                />
              );
            }
            const count = counts[key] ?? 0;
            return (
              <DenominationRow
                key={key}
                note={i18n.int(Number(denominationMinor))}
                sum={i18n.money(denominationMinor * BigInt(count))}
                stepper={
                  <QtyStepper
                    qty={i18n.int(count)}
                    decrementLabel={i18n.t('pos.shift.countLess')}
                    incrementLabel={i18n.t('pos.shift.countMore')}
                    onDecrement={() => changeCount(key, denominationMinor, -1)}
                    onIncrement={() => changeCount(key, denominationMinor, +1)}
                    onSet={(next) => pos.setDenominationCount(denominationMinor, key, next)}
                    valueLabel={i18n.t('pos.shift.countOf', { note: i18n.int(Number(denominationMinor)) })}
                  />
                }
              />
            );
          })}
          <div className="mt-auto flex items-baseline justify-between rounded-lg border border-line bg-surface p-16">
            <span className="text-ar-lg font-semibold">{i18n.t('pos.shift.counted')}</span>
            <Numeric className="text-num-2xl font-semibold">{i18n.money(counted)}</Numeric>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-10">
          <span className="text-ar-base text-text-muted">{i18n.t('pos.shift.byMethod')}</span>
          {/* The heading promised a breakdown by method and only ever showed
              expected cash, which is the one line that is *not* a method. */}
          <AmountRow label={i18n.t('pos.payment.cash')} amount={i18n.money(totals.cash)} />
          {(['bank', 'wallet', 'credit'] as const).map((method) =>
            totals[method] === 0n ? null : (
              <AmountRow
                key={method}
                label={`${i18n.t(`pos.payment.${method}` as const)} · ${i18n.t('pos.shift.notInDrawer')}`}
                amount={i18n.money(totals[method])}
              />
            ),
          )}
          {shift.openingFloatMinor > 0n ? (
            <AmountRow label={i18n.t('pos.shift.openingFloat')} amount={i18n.money(shift.openingFloatMinor)} />
          ) : null}
          <AmountRow label={i18n.t('pos.shift.expectedCash')} amount={i18n.money(expected)} />

          {/* Short or over, the difference is shown and — beyond tolerance —
              explained. Over used to ask for a reason with nowhere to write it. */}
          {isShort || isOver ? (
            <CalloutPanel
              title={i18n.t(isShort ? 'pos.shift.shortfall' : 'pos.shift.surplus')}
              amount={i18n.money(variance)}
              detail={`${i18n.t('pos.shift.expectedCash')} ${i18n.money(expected)} · ${i18n.t('pos.shift.counted')} ${i18n.money(counted)}`}
              icon={<TriangleAlert size={30} />}
            >
              {blocking.includes('unexplained_variance') ? (
                <TextField
                  aria-label={i18n.t('pos.shift.reasonPlaceholder')}
                  placeholder={i18n.t('pos.shift.reasonPlaceholder')}
                  value={shift.varianceReason}
                  onChange={(event) => pos.setVarianceReason(event.target.value)}
                />
              ) : null}
            </CalloutPanel>
          ) : null}

          {alreadyClosed ? (
            <div role="status" className="rounded-lg border border-line bg-surface-2 px-14 py-10 text-ar-base text-text-muted">
              {i18n.t('pos.shift.alreadyClosed')}
            </div>
          ) : null}

          {blocking.length > 0 && !alreadyClosed ? (
            /* A greyed button with no explanation is the screen refusing to say
               what it wants. These are the entity's own reasons, in words. */
            <div className="rounded-lg border border-line bg-surface-2 px-14 py-10 text-ar-sm text-text-muted">
              <span className="font-medium">{i18n.t('pos.shift.blocked')}</span>
              <ul className="mt-6 flex list-disc flex-col gap-2 ps-18">
                {blocking.includes('open_orders') ? (
                  <li>
                    {i18n.t('pos.shift.blockedOpenOrders')}{' '}
                    <button type="button" onClick={() => router.push('/pos/orders')} className="inline-flex min-h-control-stepper items-center font-medium text-accent underline">
                      {i18n.t('pos.shift.openOrdersList', {
                        numbers: openOrders.map((order) => `#${order.toSnapshot().number}`).join(' · '),
                      })}
                    </button>
                  </li>
                ) : null}
                {blocking.includes('unexplained_variance') ? <li>{i18n.t('pos.shift.blockedReason')}</li> : null}
              </ul>
            </div>
          ) : null}

          {note ? (
            <div role="status" aria-live="polite" className="rounded-lg border border-line bg-surface-2 px-14 py-10 text-ar-base text-text-muted">
              {note}
            </div>
          ) : null}

          {error ? (
            <div role="status" aria-live="polite" className="rounded-lg border border-danger bg-danger-tint px-14 py-10 text-ar-base text-danger">
              {error}
            </div>
          ) : null}

          <div className="mt-auto grid grid-cols-[1fr_1.3fr] gap-10">
            <Button variant="secondary" size="xl" onClick={printReport}>
              <span className="flex items-center justify-center gap-8">
                <Printer size={20} />
                {i18n.t('pos.shift.printReport')}
              </span>
            </Button>
            <Button
              variant="primary"
              size="xl"
              disabled={blocking.length > 0 || closing || alreadyClosed}
              onClick={() => setConfirming(true)}
            >
              {closing ? i18n.t('pos.shift.closing') : i18n.t('pos.shift.close')}
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        tone="accent"
        title={i18n.t('pos.shift.confirmTitle')}
        body={i18n.t('pos.shift.confirmBody', { counted: i18n.money(counted), expected: i18n.money(expected) })}
        confirmLabel={i18n.t('pos.shift.close')}
        cancelLabel={i18n.t('common.back')}
        pending={closing}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void close()}
      />
    </div>
  );
}

/** After the close: what was handed over, and the report, still printable. */
function ClosedShiftScreen({ shift, onNext }: { shift: Shift; onNext(): void }) {
  const i18n = useI18n();
  const [note, setNote] = useState<string | null>(null);
  const variance = shift.variance();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-20 bg-bg p-24 text-text" dir={i18n.dir}>
      <CheckCircle2 size={44} className="text-success" />
      <h1 className="text-ar-2xl font-semibold" role="status">
        {i18n.t('pos.shift.closedOk')}
      </h1>
      <div className="flex w-full max-w-md flex-col gap-8">
        <AmountRow label={i18n.t('pos.shift.expectedCash')} amount={i18n.money(shift.expectedCash())} />
        <AmountRow label={i18n.t('pos.shift.counted')} amount={i18n.money(shift.countedCash())} />
        {variance !== 0n ? (
          <AmountRow
            label={i18n.t(variance < 0n ? 'pos.shift.shortfall' : 'pos.shift.surplus')}
            amount={i18n.money(variance)}
          />
        ) : null}
      </div>
      {note ? (
        <p role="status" aria-live="polite" className="text-ar-base text-text-muted">
          {note}
        </p>
      ) : null}
      <div className="grid w-full max-w-md grid-cols-2 gap-10">
        <Button
          variant="secondary"
          size="xl"
          onClick={() => {
            const ok = printShiftReportToPaper(shift, buildPrintContext(i18n.locale, i18n.numerals));
            setNote(i18n.t(ok ? 'pos.shift.printed' : 'pos.shift.printBlocked'));
          }}
        >
          <span className="flex items-center justify-center gap-8">
            <Printer size={20} />
            {i18n.t('pos.shift.printReport')}
          </span>
        </Button>
        <Button variant="primary" size="xl" onClick={onNext}>
          {i18n.t('pos.shift.startNext')}
        </Button>
      </div>
    </div>
  );
}
