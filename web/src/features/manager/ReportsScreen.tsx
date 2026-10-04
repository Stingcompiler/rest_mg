'use client';

/**
 * Sales — the recent orders, read-only. The server never edits an order, so
 * this is a ledger, not a workspace.
 */
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

import { EmptyState, ErrorState, LoadingList, Numeric, Pager } from '@/components';
import { describeError } from '@/lib/describeError';
import { formatDate, useI18n } from '@/i18n';
import { pageWindow } from '@/lib/paging';
import { ManagerShell } from './ManagerShell';
import { useOrders } from './hooks';

const TYPE_LABEL = {
  dine_in: 'pos.orderType.dineIn',
  takeaway: 'pos.orderType.takeaway',
  delivery: 'pos.orderType.delivery',
} as const;

/** Enough orders to scan at once; older ones are a click away. */
const PAGE_SIZE = 25;

export function ReportsScreen() {
  const i18n = useI18n();
  const [offset, setOffset] = useState(0);
  const orders = useOrders({ limit: PAGE_SIZE, offset });
  const rows = orders.data?.results ?? [];

  return (
    <ManagerShell title={i18n.t('manager.reports.title')} description={i18n.t('manager.reports.description')}>
      {orders.isLoading ? (
        <LoadingList rows={6} rowClassName="h-control-xl" />
      ) : orders.isError ? (
        <ErrorState
          title={i18n.t('common.loadFailed')}
          detail={i18n.t(describeError(orders.error))}
          retryLabel={i18n.t('common.retry')}
          onRetry={() => void orders.refetch()}
          icon={<AlertTriangle size={30} />}
        />
      ) : rows.length === 0 ? (
        <EmptyState title={i18n.t('manager.reports.empty')} />
      ) : (
        <div className="flex flex-col gap-8">
          <span className="text-ar-md text-text-muted">{i18n.t('manager.reports.recentOrders')}</span>
          {rows.map((order) => (
            <div key={order.id} className="flex items-center gap-16 rounded-lg border border-line bg-surface p-14">
              <Numeric className="text-num-md font-semibold">{order.number}</Numeric>
              <span className="text-ar-base text-text-muted">
                {i18n.t(TYPE_LABEL[order.type as keyof typeof TYPE_LABEL] ?? 'pos.orderType.dineIn')}
              </span>
              <span className="flex-1 text-ar-base text-text-muted">{order.cashier_name}</span>
              <Numeric className="text-num-sm text-text-muted" >
                {order.closed_at ? formatDate(new Date(order.closed_at)) : ''}
              </Numeric>
              <Numeric className="text-num-md font-semibold">{i18n.money(BigInt(order.total_minor))}</Numeric>
            </div>
          ))}
          <Pager
            window={pageWindow(orders.data?.total ?? 0, PAGE_SIZE, offset)}
            onOffset={setOffset}
            busy={orders.isFetching}
          />
        </div>
      )}
    </ManagerShell>
  );
}
