'use client';

/**
 * The revenue overview. KPIs, a payment-mix share bar, and the top of the
 * sales picture — all from the API through TanStack Query. Credit is reported
 * apart from collected revenue, the same distinction the cashier's report and
 * the shift close make.
 */
import { useState } from 'react';

import { EmptyState, ErrorState, KpiCard, LoadingList, SegmentedControl, StackedShareBar } from '@/components';
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

  return (
    <div className="flex flex-col gap-20">
      <div className="grid grid-cols-2 gap-16 lg:grid-cols-4">
        <KpiCard
          label={i18n.t('pos.report.collected')}
          value={i18n.money(BigInt(data.collected_minor))}
          tone="success"
          delta={compare(BigInt(data.collected_minor), before && BigInt(before.collected_minor))}
        />
        <KpiCard
          label={i18n.t('pos.report.orderCount')}
          value={i18n.int(data.order_count)}
          delta={compare(data.order_count, before?.order_count)}
        />
        <KpiCard
          label={i18n.t('pos.report.averageTicket')}
          value={i18n.money(BigInt(data.average_ticket_minor))}
          delta={compare(BigInt(data.average_ticket_minor), before && BigInt(before.average_ticket_minor))}
        />
        <KpiCard
          label={i18n.t('pos.report.credit')}
          value={i18n.money(BigInt(data.credit_outstanding_minor))}
          sub={i18n.t('manager.money.creditMovement', {
            sales: i18n.money(BigInt(data.credit_sales_minor)),
            repaid: i18n.money(BigInt(data.settlements_minor)),
          })}
          tone="credit"
        />
      </div>

      {/* The money that has not finished moving. Reporting only what was
          collected made a full kitchen look like a quiet day, and hid every
          online delivery until a cashier settled it. */}
      <div className="grid grid-cols-1 gap-16 lg:grid-cols-3">
        <KpiCard
          label={i18n.t('manager.money.unpaid')}
          value={i18n.money(BigInt(data.unpaid_minor))}
          sub={
            data.pending_delivery_count > 0
              ? i18n.t('manager.money.pendingDelivery', { count: i18n.int(data.pending_delivery_count) })
              : i18n.plural('manager.money.ordersCount', data.unpaid_order_count)
          }
          tone="credit"
        />
        <KpiCard
          label={i18n.t('manager.money.discount')}
          value={i18n.money(BigInt(data.discount_minor))}
        />
        <KpiCard
          label={i18n.t('manager.money.void')}
          value={i18n.money(BigInt(data.void_minor))}
          sub={i18n.plural('manager.money.ordersCount', data.void_order_count)}
        />
      </div>

      <div className="grid grid-cols-1 gap-16 lg:grid-cols-2">
        <div className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-20">
          <span className="text-ar-md text-text-muted">{i18n.t('manager.dashboard.payMix')}</span>
          <StackedShareBar segments={segments} />
        </div>

        {/* Where the money came from, in money rather than in counts. */}
        <div className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-20">
          <span className="text-ar-md text-text-muted">{i18n.t('manager.money.byChannel')}</span>
          <div className="flex flex-col gap-8">
            {Object.entries(data.by_channel_minor).length === 0 ? (
              <span className="text-ar-sm text-text-muted">—</span>
            ) : (
              Object.entries(data.by_channel_minor).map(([channel, value]) => (
                <div key={channel} className="flex items-baseline justify-between">
                  <span className="text-ar-base text-text-muted">
                    {i18n.t(
                      channel === 'online' ? 'manager.money.channel.online' : 'manager.money.channel.pos',
                    )}
                  </span>
                  <span className="numeric text-num-base font-semibold">{i18n.money(BigInt(value))}</span>
                </div>
              ))
            )}
            <div className="mt-4 border-t border-line pt-8" />
            <span className="text-ar-sm text-text-muted">{i18n.t('manager.money.byType')}</span>
            {Object.entries(data.by_type_minor).map(([type, value]) => (
              <div key={type} className="flex items-baseline justify-between">
                <span className="text-ar-base text-text-muted">
                  {i18n.t(
                    type === 'delivery'
                      ? 'pos.orderType.delivery'
                      : type === 'takeaway'
                        ? 'pos.orderType.takeaway'
                        : 'pos.orderType.dineIn',
                  )}
                </span>
                <span className="numeric text-num-base font-semibold">{i18n.money(BigInt(value))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent administrative activity — the tail of the log, so a manager sees
          who changed what without leaving the overview. */}
      <div className="flex flex-col gap-8 rounded-lg border border-line bg-surface p-20">
        <span className="text-ar-md text-text-muted">{i18n.t('manager.dashboard.recentActivity')}</span>
        <ActivityLog query={{ limit: 8 }} />
      </div>
    </div>
  );
}
