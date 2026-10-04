'use client';

/**
 * Open orders — a 3-column card grid of everything still on the floor. Each card
 * shows an age bar that escalates success → warning → danger as the order sits,
 * and a sync badge (open orders are unsynced until they close and push). Resume
 * switches the cart and returns to order entry; cancel voids the order behind a
 * confirmation, and the void queues for sync so the server learns of it.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListOrdered } from 'lucide-react';

import { AppHeader, Button, EmptyState, Numeric, OrderCard, ConfirmDialog, SegmentedControl } from '@/components';
import { useI18n } from '@/i18n';
import { DomainError, type OrderType } from '@/domain';
import { usePos } from './PosProvider';
import { PosRail } from './PosRail';

type Filter = 'all' | OrderType;

function ageInfo(openedAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(openedAt)) / 60_000));
  const percent = Math.min(100, (minutes / 60) * 100);
  const tone: 'success' | 'warning' | 'danger' =
    minutes < 15 ? 'success' : minutes < 30 ? 'warning' : 'danger';
  return { minutes, percent, tone };
}

export function OpenOrdersScreen() {
  const pos = usePos();
  const i18n = useI18n();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingCancel, setPendingCancel] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // The age bar is the point of these cards — it escalates from green through
  // amber to red as an order sits — so the clock has to move on its own. Read
  // once at render it froze at whatever the last mutation left behind, and an
  // order forgotten on the pass stayed reassuringly green all afternoon.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // Deliberately not memoised. `pos.cart` is one long-lived CartSession that
  // mutates its own map, so its identity never changes and a useMemo keyed on
  // it never recomputed: a cancelled order stayed on the grid and a new one
  // never appeared until the screen was left and re-entered. Listing a handful
  // of in-memory orders costs nothing; the context value changing identity on
  // every mutation is what makes this correct.
  const all = pos.cart.list();
  const orders = filter === 'all' ? all : all.filter((order) => order.type === filter);

  const typeLabelKey = {
    dine_in: 'pos.orderType.dineIn',
    takeaway: 'pos.orderType.takeaway',
    delivery: 'pos.orderType.delivery',
  } as const;

  const filterControl = (
    <SegmentedControl<Filter>
      ariaLabel={i18n.t('pos.orders.title')}
      value={filter}
      onChange={setFilter}
      options={[
        { value: 'all', label: i18n.t('pos.orders.all') },
        { value: 'dine_in', label: i18n.t('pos.orderType.dineIn') },
        { value: 'takeaway', label: i18n.t('pos.orderType.takeaway') },
        { value: 'delivery', label: i18n.t('pos.orderType.delivery') },
      ]}
    />
  );

  return (
    <div className="flex h-screen bg-bg text-text" dir={i18n.dir}>
      <PosRail active="orders" />
      <div className="flex min-w-0 flex-1 flex-col pb-mobile-nav md:pb-0">
        <AppHeader
          title={
            <span className="flex items-baseline gap-8 text-ar-xl font-semibold">
              {i18n.t('pos.orders.title')}
              {/* The total, not the filtered count. Showing the filtered one
                  beside a title that says "open orders" read as "you have none"
                  whenever a filter happened to match nothing — which is exactly
                  how a cashier concludes the screen is broken. */}
              <Numeric className="text-num-lg text-text-muted">
                {filter === 'all'
                  ? i18n.int(all.length)
                  : i18n.t('pos.orders.shownOfTotal', {
                      shown: i18n.int(orders.length),
                      total: i18n.int(all.length),
                    })}
              </Numeric>
            </span>
          }
          trailing={
            // A phone has no room beside the title: the filter and the button
            // together were 478px on a 375px screen and widened the whole page.
            // There the filter gets its own row, and deliveries is in the bar.
            <div className="hidden items-center gap-10 md:flex">
              {filterControl}
              {/* Online delivery orders live in their own online screen. */}
              <Button variant="secondary" onClick={() => window.location.assign('/deliveries')}>
                {i18n.t('deliveries.manage')}
              </Button>
            </div>
          }
        />
        <div className="flex-none overflow-x-auto px-16 pt-12 md:hidden">{filterControl}</div>

        <div className="min-h-0 flex-1 overflow-y-auto p-16">
          {orders.length === 0 ? (
            <EmptyState
              title={
                filter === 'all'
                  ? i18n.t('pos.orders.empty')
                  : i18n.t('pos.orders.emptyFiltered', { type: i18n.t(typeLabelKey[filter]) })
              }
              /* The delivery filter is the one that misleads: it matches orders
                 taken at the till, never the ones customers place on the site.
                 An empty screen here does not mean there are no deliveries. */
              hint={filter === 'delivery' ? i18n.t('pos.orders.onlineHint') : undefined}
              icon={<ListOrdered size={30} />}
            />
          ) : (
            <div className="grid grid-cols-tickets content-start gap-14">
              {orders.map((order) => {
                const snapshot = order.toSnapshot();
                const age = ageInfo(snapshot.openedAt, now);
                const items = snapshot.lines
                  .filter((line) => !line.isVoid)
                  .map((line) => `${line.nameAr} ×${i18n.int(line.qty)}`)
                  .join(i18n.locale === 'ar' ? '، ' : ', ');
                return (
                  <OrderCard
                    key={order.id}
                    id={`${i18n.t('print.order')} ${snapshot.number}`}
                    typeLabel={i18n.t(typeLabelKey[order.type])}
                    total={i18n.money(order.total())}
                    items={items}
                    age={i18n.t('pos.orders.age', { count: i18n.int(age.minutes) })}
                    agePercent={age.percent}
                    ageTone={age.tone}
                    /* Nothing on this screen is ever "closed", so the badge
                       read "not synced" on every card including the ones the
                       kitchen was already cooking. What actually matters here
                       is whether the kitchen has the order. */
                    synced={snapshot.status === 'sent'}
                    syncedLabel={i18n.t('pos.orders.sentToKitchen')}
                    unsyncedLabel={i18n.t('pos.orders.notSentYet')}
                    resumeLabel={i18n.t('pos.orders.resume')}
                    cancelLabel={i18n.t('pos.orders.cancel')}
                    onResume={() => {
                      pos.resumeOrder(order.id);
                      router.push('/pos');
                    }}
                    onCancel={() => setPendingCancel(order.id)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingCancel !== null}
        title={i18n.t('pos.orders.cancelConfirm')}
        body={i18n.t('pos.orders.cancelBody')}
        confirmLabel={i18n.t('common.confirm')}
        cancelLabel={i18n.t('common.back')}
        // The reason was always the button's own label ("cancel"), so the log
        // could never say why a bill was dropped.
        reasons={[i18n.t('pos.void.customer'), i18n.t('pos.void.mistake'), i18n.t('pos.orders.cancelDuplicate')]}
        otherReason={{ label: i18n.t('pos.void.other'), placeholder: i18n.t('pos.void.otherPlaceholder') }}
        error={cancelError}
        onCancel={() => {
          setPendingCancel(null);
          setCancelError(null);
        }}
        onConfirm={(reason) => {
          if (!pendingCancel || !reason) return;
          pos
            .cancelOrder(pendingCancel, reason)
            .then(() => {
              setPendingCancel(null);
              setCancelError(null);
            })
            .catch((error: unknown) => {
              // A bill with money on it is refused by the entity: the payments
              // come off first, on the payment screen.
              const code = error instanceof DomainError ? `error.${error.code}` : 'error.unknown';
              setCancelError(i18n.t(code as Parameters<typeof i18n.t>[0]));
            });
        }}
      />
    </div>
  );
}
