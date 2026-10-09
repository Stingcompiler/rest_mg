'use client';

/**
 * Daily report — collected revenue, order count, average ticket, open credit,
 * an hourly bar chart, and the top-selling items. All computed locally from the
 * closed orders in IndexedDB; credit (آجل) is reported apart from collected
 * revenue, the same distinction the shift close and the server report make.
 */
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Cloud, CloudOff, Printer } from 'lucide-react';

import { AppHeader, BarChart, Button, EmptyState, KpiCard, KpiStrip, LoadingList, Numeric, Pager } from '@/components';
import { hydrateOrder, openDatabase, orderRepository, rejectedEntries, toMinor, type OrderRecord } from '@/db';
import { TIME_ZONE, formatDate, formatTime, useI18n } from '@/i18n';
import { clampOffset, pageLocal } from '@/lib/paging';
import { buildPrintContext, printReceiptToPaper } from '@/print';
import { PosRail } from './PosRail';

/**
 * Reprints, a page at a time.
 *
 * A busy day closes hundreds of bills, and the reprint list used to render
 * every one inside a short scroll box — slow on the tablet, and a long hunt
 * on a phone for the one receipt a customer is standing there asking for.
 */
const RECEIPTS_PER_PAGE = 12;

const khartoumHour = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  hour12: false,
  timeZone: TIME_ZONE,
});

interface ReportData {
  collected: bigint;
  credit: bigint;
  orderCount: number;
  gross: bigint;
  byHour: { hour: string; total: bigint }[];
  topItems: { name: string; qty: number; total: bigint }[];
}

function computeReport(orders: OrderRecord[]): ReportData {
  const today = formatDate(new Date());
  const closedToday = orders.filter(
    (order) => order.status === 'closed' && order.closedAt && formatDate(new Date(order.closedAt)) === today,
  );

  let collected = 0n;
  let credit = 0n;
  let gross = 0n;
  const hourTotals = new Map<string, bigint>();
  const itemTotals = new Map<string, { qty: number; total: bigint }>();

  for (const order of closedToday) {
    gross += toMinor(order.totalMinor);
    for (const payment of order.payments) {
      const amount = toMinor(payment.amountMinor);
      if (payment.method === 'credit') credit += amount;
      else collected += amount;
    }
    if (order.closedAt) {
      const hour = khartoumHour.format(new Date(order.closedAt));
      hourTotals.set(hour, (hourTotals.get(hour) ?? 0n) + toMinor(order.totalMinor));
    }
    for (const line of order.lines) {
      if (line.isVoid) continue;
      const current = itemTotals.get(line.nameAr) ?? { qty: 0, total: 0n };
      current.qty += line.qty;
      current.total += toMinor(line.unitPriceMinor) * BigInt(line.qty);
      itemTotals.set(line.nameAr, current);
    }
  }

  const byHour = [...hourTotals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, total]) => ({ hour, total }));
  const topItems = [...itemTotals.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort((a, b) => (b.total > a.total ? 1 : -1))
    .slice(0, 5);

  return { collected, credit, orderCount: closedToday.length, gross, byHour, topItems };
}

export function DailyReportScreen() {
  const i18n = useI18n();
  const [data, setData] = useState<ReportData | null>(null);
  // The bills themselves, kept so one can be reprinted. A customer often asks
  // for the paper after the drawer has already closed.
  const [closed, setClosed] = useState<OrderRecord[]>([]);
  const [printNote, setPrintNote] = useState<string | null>(null);
  // Refused by the server, as distinct from waiting for a network: one clears
  // itself, the other never will.
  const [refused, setRefused] = useState(0);
  const [receiptOffset, setReceiptOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void orderRepository.listByStatus('closed').then((orders) => {
      if (cancelled) return;
      setData(computeReport(orders));
      const today = formatDate(new Date());
      setClosed(
        orders
          .filter((order) => order.closedAt && formatDate(new Date(order.closedAt)) === today)
          .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
      );
      setReceiptOffset((current) =>
        clampOffset(
          orders.filter((order) => order.closedAt && formatDate(new Date(order.closedAt)) === today)
            .length,
          RECEIPTS_PER_PAGE,
          current,
        ),
      );
    });
    void openDatabase()
      .then(rejectedEntries)
      .then((entries) => {
        if (!cancelled) setRefused(entries.length);
      })
      .catch(() => {
        /* the banner is advisory; a read failure must not break the report */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Rebuild the bill from its stored record and hand it to the browser's
  // printer. This is the same receipt document the thermal printer renders, so
  // the paper reads identically whichever route it took.
  const printReceipt = (record: OrderRecord) => {
    const opened = printReceiptToPaper(
      hydrateOrder(record),
      buildPrintContext(i18n.locale, i18n.numerals),
      `${i18n.t('print.order')} ${record.number}`,
    );
    setPrintNote(i18n.t(opened ? 'pos.report.printOpened' : 'pos.report.printBlocked'));
  };

  const bars = useMemo(() => {
    if (!data || data.byHour.length === 0) return [];
    const max = data.byHour.reduce((peak, entry) => (entry.total > peak ? entry.total : peak), 1n);
    return data.byHour.map((entry) => ({
      height: Number((entry.total * 100n) / max),
      label: entry.hour,
    }));
  }, [data]);

  const averageTicket = data && data.orderCount > 0 ? data.gross / BigInt(data.orderCount) : 0n;
  const unsyncedToday = closed.filter((record) => record.syncedAt === null).length;

  return (
    <div className="flex h-screen bg-bg text-text" dir={i18n.dir}>
      <PosRail active="reports" />
      <div className="flex min-w-0 flex-1 flex-col pb-mobile-nav md:pb-0">
        <AppHeader
          title={
            <span className="flex items-baseline gap-8 text-ar-xl font-semibold">
              {i18n.t('pos.report.title')}
              <Numeric className="text-num-base text-text-muted" >{formatDate(new Date())}</Numeric>
            </span>
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-16">
          {!data ? (
            <LoadingList rows={4} rowClassName="h-control-2xl" />
          ) : data.orderCount === 0 ? (
            <EmptyState title={i18n.t('pos.report.empty')} icon={<BarChart3 size={30} />} />
          ) : (
            <div className="flex flex-col gap-14">
              {/* One ledger band, as on the manager's overview (batch 40). */}
              <KpiStrip columns={4}>
                <KpiCard lead label={i18n.t('pos.report.collected')} value={i18n.money(data.collected)} unit={i18n.t('landing.currency')} tone="success" zero={data.collected === 0n} zeroLabel={i18n.t('manager.dashboard.nothingYet')} />
                <KpiCard label={i18n.t('pos.report.orderCount')} value={i18n.int(data.orderCount)} zero={data.orderCount === 0} zeroLabel={i18n.t('manager.dashboard.nothingYet')} />
                <KpiCard label={i18n.t('pos.report.averageTicket')} value={i18n.money(averageTicket)} unit={i18n.t('landing.currency')} zero={averageTicket === 0n} zeroLabel={i18n.t('manager.dashboard.nothingYet')} />
                <KpiCard label={i18n.t('pos.report.credit')} value={i18n.money(data.credit)} unit={i18n.t('landing.currency')} tone="credit" zero={data.credit === 0n} zeroLabel={i18n.t('manager.dashboard.nothingYet')} />
              </KpiStrip>

              <div className="flex min-h-0 flex-1 flex-col gap-14 lg:flex-row">
                <div className="flex flex-1 flex-col gap-16 rounded-lg border border-line bg-surface p-18">
                  <span className="text-ar-md text-text-muted">{i18n.t('pos.report.byHour')}</span>
                  <BarChart bars={bars} />
                </div>
                <div className="flex flex-none flex-col gap-10 rounded-lg border border-line bg-surface p-18 lg:w-cart">
                  <span className="text-ar-md text-text-muted">{i18n.t('pos.report.topItems')}</span>
                  {data.topItems.map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-md bg-surface-2 px-14 py-12">
                      <span className="text-ar-md">{item.name}</span>
                      <div className="flex items-baseline gap-14">
                        <Numeric className="text-num-base text-text-muted">{`×${i18n.int(item.qty)}`}</Numeric>
                        <Numeric className="text-num-md font-semibold">{i18n.money(item.total)}</Numeric>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Why this total can sit above the manager's: bills live here
                  first and reach the server when the line is up. The device is
                  the only place that knows which ones are still waiting. */}
              <div
                className={
                  unsyncedToday > 0 || refused > 0
                    ? 'flex items-center gap-8 rounded-lg border border-warning bg-warning-tint px-14 py-10 text-ar-sm text-warning'
                    : 'flex items-center gap-8 rounded-lg border border-line bg-surface px-14 py-10 text-ar-sm text-text-muted'
                }
              >
                {unsyncedToday > 0 || refused > 0 ? <CloudOff size={16} /> : <Cloud size={16} />}
                {refused > 0
                  ? i18n.t('pos.report.rejected', { count: i18n.int(refused) })
                  : unsyncedToday > 0
                    ? i18n.t('pos.report.unsynced', { count: i18n.int(unsyncedToday) })
                    : i18n.t('pos.report.allSynced')}
              </div>

              {/* Reprint — a customer asking for paper after the fact. */}
              <div className="flex flex-col gap-10 rounded-lg border border-line bg-surface p-18">
                <div className="flex items-baseline justify-between gap-12">
                  <span className="text-ar-md text-text-muted">{i18n.t('pos.report.receipts')}</span>
                  <span className="text-ar-sm text-text-muted">{i18n.t('pos.report.receiptsHint')}</span>
                </div>
                {printNote ? (
                  <div role="status" aria-live="polite" className="rounded-md bg-surface-2 px-12 py-8 text-ar-sm text-text-muted">
                    {printNote}
                  </div>
                ) : null}
                {closed.length === 0 ? (
                  <span className="text-ar-base text-text-muted">{i18n.t('pos.report.noClosedOrders')}</span>
                ) : (
                  <div className="flex flex-col gap-8">
                    {pageLocal(closed, RECEIPTS_PER_PAGE, receiptOffset).results.map((record) => (
                      <div key={record.id} className="flex items-center gap-12 rounded-md bg-surface-2 px-12 py-10">
                        <span dir="ltr"><Numeric className="text-num-base font-semibold">{record.number}</Numeric></span>
                        <span className="flex-1 truncate text-ar-sm text-text-muted">
                          {record.closedAt ? formatTime(new Date(record.closedAt)) : ''}
                        </span>
                        <Numeric className="text-num-base">{i18n.money(toMinor(record.totalMinor))}</Numeric>
                        <Button variant="secondary" onClick={() => printReceipt(record)}>
                          <span className="flex items-center gap-6">
                            <Printer size={16} />
                            {i18n.t('pos.report.print')}
                          </span>
                        </Button>
                      </div>
                    ))}
                    <Pager
                      window={pageLocal(closed, RECEIPTS_PER_PAGE, receiptOffset).window}
                      onOffset={setReceiptOffset}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
