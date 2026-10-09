'use client';

/**
 * The revenue overview. KPIs, a payment-mix share bar, and the top of the
 * sales picture — all from the API through TanStack Query. Credit is reported
 * apart from collected revenue, the same distinction the cashier's report and
 * the shift close make.
 */
import { useState } from 'react';

import { ErrorState, KpiCard, KpiStrip, LedgerRow, LoadingList, SegmentedControl, StackedShareBar } from '@/components';
import { describeError } from '@/lib/describeError';
import { AlertTriangle } from 'lucide-react';

import { useI18n } from '@/i18n';
import { ManagerShell } from './ManagerShell';
import { ActivityLog } from './ActivityLog';
import { useRevenue } from './hooks';
import { PERIOD_KEYS, change, periodRange, previousRange, type PeriodKey } from './period';
import type { KpiDelta } from '@/components/report/report';

const METHOD_TOKEN: Record<string, string> = {
  cash: 'bg-chart-1',
  bank: 'bg-chart-2',
  wallet: 'bg-chart-3',
  credit: 'bg-chart-4',
};

const METHOD_LABEL = {
  cash: 'manager.method.cash',
  bank: 'manager.method.bank',
  wallet: 'manager.method.wallet',
  credit: 'manager.method.credit',
} as const;

export function DashboardScreen() {
  const i18n = useI18n();
  // Today by default, so this figure means the same thing as the cashier's
  // daily report. With no filter the overview reported every closed order ever
  // recorded, which is why the two screens disagreed.
  const [period, setPeriod] = useState<PeriodKey>('today');
  const revenue = useRevenue(periodRange(period));
  // The same span of the period before, up to this minute, to read the
  // figures against (batch 22). "All" has no period before it.
  const previous = previousRange(period);
  const before = useRevenue(previous ?? undefined, { enabled: previous !== null });

  return (
    <ManagerShell title={i18n.t('manager.dashboard.title')} description={i18n.t('manager.dashboard.pageDescription')}>
      <div className="mb-16 flex flex-wrap items-center justify-between gap-12">
        <SegmentedControl<PeriodKey>
          ariaLabel={i18n.t('manager.period.label')}
          value={period}
          onChange={setPeriod}
          options={PERIOD_KEYS.map((key) => ({ value: key, label: i18n.t(`manager.period.${key}` as never) }))}
        />
        <span className="text-ar-xs text-text-muted">{i18n.t('manager.period.syncedNote')}</span>
      </div>
      {revenue.isLoading ? (
        <LoadingList rows={4} rowClassName="h-control-2xl" />
      ) : revenue.isError || !revenue.data ? (
        <ErrorState
          title={i18n.t('common.loadFailed')}
          detail={i18n.t(describeError(revenue.error))}
          retryLabel={i18n.t('common.retry')}
          onRetry={() => void revenue.refetch()}
          icon={<AlertTriangle size={30} />}
        />
      ) : (
        <Dashboard data={revenue.data} before={previous ? before.data : undefined} period={period} />
      )}
    </ManagerShell>
  );
}

function Dashboard({
  data,
  before,
  period,
}: {
  data: import('./api').RevenueReport;
  before?: import('./api').RevenueReport;
  period: PeriodKey;
}) {
  const i18n = useI18n();

  // "+١٢٪ عن الوقت نفسه أمس"; nothing until the period before has loaded, or
  // when it had nothing to compare with.
  const compare = (now: bigint | number, then: bigint | number | undefined): KpiDelta | undefined => {
    if (then === undefined || period === 'all') return undefined;
    const moved = change(BigInt(now), BigInt(then));
    if (!moved) return undefined;
    const sign = moved.direction === 'up' ? '+' : moved.direction === 'down' ? '−' : '';
    return {
      direction: moved.direction,
      text: i18n.t(`manager.compare.${period}` as const, { change: `${sign}${i18n.int(moved.percent)}` }),
    };
  };

  const methodTotals = Object.entries(data.by_method);
  const totalPaid = methodTotals.reduce((sum, [, value]) => sum + BigInt(value), 0n);
  const segments = methodTotals.map(([method, value]) => ({
    label: i18n.t(METHOD_LABEL[method as keyof typeof METHOD_LABEL] ?? 'manager.method.cash'),
    percent: totalPaid > 0n ? Number((BigInt(value) * 100n) / totalPaid) : 0,
    colorClass: METHOD_TOKEN[method] ?? 'bg-chart-1',
    value: i18n.money(BigInt(value)),
  }));

  const unit = i18n.t('landing.currency');
  const nothingYet = i18n.t('manager.dashboard.nothingYet');
  const money = (minor: string | number) => i18n.money(BigInt(minor));
  const isZero = (minor: string | number) => BigInt(minor) === 0n;

  return (
    <div className="flex flex-col gap-32">
      {/* One ledger band, the takings first and largest (batch 40): every
          figure was a floating card with a gold top line, the template look,
          and a quiet day read as seven dots («٠»). */}
      <KpiStrip columns={4}>
        <KpiCard
          lead
          label={i18n.t('pos.report.collected')}
          value={money(data.collected_minor)}
          unit={unit}
          tone="success"
          zero={isZero(data.collected_minor)}
          zeroLabel={nothingYet}
          delta={compare(BigInt(data.collected_minor), before && BigInt(before.collected_minor))}
        />
        <KpiCard
          label={i18n.t('pos.report.orderCount')}
          value={i18n.int(data.order_count)}
          zero={data.order_count === 0}
          zeroLabel={nothingYet}
          delta={compare(data.order_count, before?.order_count)}
        />
        <KpiCard
          label={i18n.t('pos.report.averageTicket')}
          value={money(data.average_ticket_minor)}
          unit={unit}
          zero={isZero(data.average_ticket_minor)}
          zeroLabel={nothingYet}
          delta={compare(BigInt(data.average_ticket_minor), before && BigInt(before.average_ticket_minor))}
        />
        <KpiCard
          label={i18n.t('pos.report.credit')}
          value={money(data.credit_outstanding_minor)}
          unit={unit}
          zero={isZero(data.credit_outstanding_minor)}
          zeroLabel={nothingYet}
          sub={
            isZero(data.credit_sales_minor) && isZero(data.settlements_minor)
              ? undefined
              : i18n.t('manager.money.creditMovement', {
                  sales: money(data.credit_sales_minor),
                  repaid: money(data.settlements_minor),
                })
          }
          tone="credit"
        />
      </KpiStrip>

      <div className="grid grid-cols-1 gap-32 lg:grid-cols-2">
        {/* The money that has not finished moving. Reporting only what was
            collected made a full kitchen look like a quiet day, and hid every
            online delivery until a cashier settled it. Lines of a ledger, with
            the dotted leaders of the public menu (batch 40). */}
        <DashSection title={i18n.t('manager.money.openTitle')}>
          <LedgerRow
            label={i18n.t('manager.money.unpaid')}
            value={money(data.unpaid_minor)}
            unit={unit}
            zero={isZero(data.unpaid_minor)}
            tone={isZero(data.unpaid_minor) ? 'text' : 'credit'}
            note={
              data.pending_delivery_count > 0
                ? i18n.t('manager.money.pendingDelivery', { count: i18n.int(data.pending_delivery_count) })
                : data.unpaid_order_count > 0
                  ? i18n.plural('manager.money.ordersCount', data.unpaid_order_count)
                  : undefined
            }
          />
          <LedgerRow label={i18n.t('manager.money.discount')} value={money(data.discount_minor)} unit={unit} zero={isZero(data.discount_minor)} />
          <LedgerRow
            label={i18n.t('manager.money.void')}
            value={money(data.void_minor)}
            unit={unit}
            zero={isZero(data.void_minor)}
            note={data.void_order_count > 0 ? i18n.plural('manager.money.ordersCount', data.void_order_count) : undefined}
          />
        </DashSection>

        <DashSection title={i18n.t('manager.dashboard.payMix')}>
          {totalPaid > 0n ? <StackedShareBar segments={segments} /> : <p className="text-ar-sm text-text-muted">{nothingYet}</p>}
        </DashSection>

        {/* Where the money came from, in money rather than in counts. */}
        <DashSection title={i18n.t('manager.money.byChannel')}>
          {Object.entries(data.by_channel_minor).length === 0 ? (
            <p className="text-ar-sm text-text-muted">{nothingYet}</p>
          ) : (
            Object.entries(data.by_channel_minor).map(([channel, value]) => (
              <LedgerRow
                key={channel}
                label={i18n.t(channel === 'online' ? 'manager.money.channel.online' : 'manager.money.channel.pos')}
                value={money(value)}
                unit={unit}
              />
            ))
          )}
        </DashSection>

        <DashSection title={i18n.t('manager.money.byType')}>
          {Object.entries(data.by_type_minor).length === 0 ? (
            <p className="text-ar-sm text-text-muted">{nothingYet}</p>
          ) : (
            Object.entries(data.by_type_minor).map(([type, value]) => (
              <LedgerRow
                key={type}
                label={i18n.t(
                  type === 'delivery' ? 'pos.orderType.delivery' : type === 'takeaway' ? 'pos.orderType.takeaway' : 'pos.orderType.dineIn',
                )}
                value={money(value)}
                unit={unit}
              />
            ))
          )}
        </DashSection>
      </div>

      {/* Recent administrative activity — the tail of the log, so a manager sees
          who changed what without leaving the overview. */}
      <DashSection title={i18n.t('manager.dashboard.recentActivity')}>
        <ActivityLog query={{ limit: 8 }} />
      </DashSection>
    </div>
  );
}

/** A part of the overview: a title over a rule, not another box (batch 40). */
function DashSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-8 border-t-strong border-ink pt-12">
      <h2 className="text-ar-md font-semibold text-text">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}
