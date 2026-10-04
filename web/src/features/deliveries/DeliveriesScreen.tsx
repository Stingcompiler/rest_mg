'use client';

/**
 * Delivery orders — where a manager or cashier processes what customers ordered
 * from the public site.
 *
 * Each card carries the customer's own details (name, phone, address, notes) and
 * the order's items, and advances the fulfilment one step at a time. The steps
 * offered here are only the ones front-of-house can actually vouch for —
 * pending → confirmed → out for delivery → delivered, plus cancel while the
 * order is live. **Preparation is not among them**: "preparing" is the kitchen
 * reporting that it started cooking, so it arrives on its own and is shown here
 * as a read-only badge.
 *
 * Taking the money happens at the till (decision D2): once the floor has
 * confirmed an order, "collect at the till" hands the till a copy and opens its
 * payment screen, so the cash or transfer lands in the shift like any bill. An
 * order delivered but not yet paid stays among the live ones until it is.
 *
 * Arabic-first, RTL, Mobile-first.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BellRing, Banknote, Clock, MapPin, Phone, StickyNote, Truck, X } from 'lucide-react';

import { Button, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingList, Pager, SettingsMenu, StatusChip } from '@/components';
import { describeError } from '@/lib/describeError';
import { formatTime, useI18n } from '@/i18n';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiError, homeForRole } from '@/lib/http';
import { pageWindow } from '@/lib/paging';
import { AlertBell } from '@/features/alerts/AlertBell';
import { useArrivalAlert } from '@/features/alerts/useArrivalAlert';
import { ARRIVAL_KEYS } from '@/features/alerts/memory';
import { orderRepository, shiftRepository } from '@/db';
import { useDeliveries, useSetDeliveryStatus } from './hooks';
import { canCollect, collectableRecord } from './collect';
import type { DeliveryOrder, DeliveryStatus } from './api';

// The next step front-of-house may take. Note there is no button that sets
// "preparing": that is the kitchen saying it started cooking, and it arrives on
// its own once the kitchen advances its ticket. From either "confirmed" or
// "preparing" the move front-of-house can make is to send the food out.
//
// Whether that move is *available yet* is a separate question, answered by
// KITCHEN_READY below. The two roles take turns, and the turn only comes back
// to front-of-house once there is food to send.
const NEXT: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  pending: 'confirmed',
  confirmed: 'out_for_delivery',
  preparing: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

// Sending a rider out is a claim that food exists, and only the kitchen can
// make it. Until the ticket reads ready (or served, which is further along, not
// less), it is the kitchen's turn and the dispatch button stays away.
const KITCHEN_READY = new Set(['ready', 'served']);

// The refusals this screen can actually receive, each with a sentence in the
// reader's language. Server error codes are an open set, so anything not listed
// is reported generically rather than leaking "error.some_code" onto the card.
/** Whether this order is sitting with the kitchen rather than with the reader. */
function waitingOnKitchen(order: DeliveryOrder): boolean {
  const ds = (order.delivery_status || 'pending') as DeliveryStatus;
  return NEXT[ds] === 'out_for_delivery' && !KITCHEN_READY.has(order.kitchen_status ?? '');
}

const REFUSAL_KEY = {
  kitchen_not_ready: 'error.kitchen_not_ready',
  kitchen_owned_status: 'error.kitchen_owned_status',
  invalid_transition: 'error.invalid_transition',
  paid_order_cancel: 'error.paid_order_cancel',
  reason_required: 'error.reason_required',
} as const;

const STATUS_KEY = {
  pending: 'deliveries.status.pending',
  confirmed: 'deliveries.status.confirmed',
  preparing: 'deliveries.status.preparing',
  out_for_delivery: 'deliveries.status.outForDelivery',
  delivered: 'deliveries.status.delivered',
  cancelled: 'deliveries.status.cancelled',
} as const;

// The kitchen's own vocabulary, for the read-only badge.
const KITCHEN_KEY: Record<string, 'kitchen.queued' | 'kitchen.preparing' | 'kitchen.ready' | 'kitchen.served'> = {
  queued: 'kitchen.queued',
  preparing: 'kitchen.preparing',
  ready: 'kitchen.ready',
  served: 'kitchen.served',
};

const TONE: Record<DeliveryStatus, 'neutral' | 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  confirmed: 'neutral',
  preparing: 'neutral',
  out_for_delivery: 'warning',
  delivered: 'success',
  cancelled: 'danger',
};

/** A screenful of delivery cards; the rest are one click away. */
const PAGE_SIZE = 20;

export function DeliveriesScreen() {
  const i18n = useI18n();
  const auth = useAuth();
  // The queue is worked from the top; older orders stay reachable by paging
  // rather than being cut off at a fixed ceiling.
  const [offset, setOffset] = useState(0);
  const deliveries = useDeliveries({ limit: PAGE_SIZE, offset });

  const goHome = () => window.location.assign(homeForRole(auth.user?.role ?? 'cashier'));
  const orders = deliveries.data?.results ?? [];
  const win = pageWindow(deliveries.data?.total ?? 0, PAGE_SIZE, offset);
  // Active orders first, each group newest first. Delivered is not done while
  // the money is still to be collected — it stays in front of the reader.
  const isDone = (o: DeliveryOrder) =>
    o.delivery_status === 'cancelled' || (o.delivery_status === 'delivered' && !canCollect(o));
  const active = orders.filter((o) => !isDone(o));
  const done = orders.filter(isDone);

  // Split the live orders by whose turn it is. Both halves stay visible — front
  // of house still answers the phone about an order that is cooking — but the
  // ones actually waiting on this person come first and are not buried among
  // the ones there is nothing to do about yet.
  const mine = active.filter((o) => !waitingOnKitchen(o));
  const theirs = active.filter((o) => waitingOnKitchen(o));

  // A customer's order lands here without anyone asking for it, so the screen
  // has to speak up. Only orders still awaiting confirmation count as news —
  // one already out with a rider is not something to be called to.
  const alert = useArrivalAlert({
    ids: orders.filter((o) => o.delivery_status === 'pending').map((o) => o.id),
    storageKey: ARRIVAL_KEYS.deliveries,
    ready: !deliveries.isLoading && !deliveries.isError,
    noticeTitle: i18n.t('alerts.newDeliveryTitle'),
    noticeBody: (count) => i18n.plural('alerts.newDeliveryBody', count),
  });

  return (
    <div className="flex h-screen flex-col bg-bg text-text" dir={i18n.dir}>
      <header className="flex h-header flex-none items-center justify-between gap-12 border-b border-line bg-surface px-16 sm:px-20">
        <div className="flex min-w-0 items-center gap-12">
          <IconButton variant="quiet" label={i18n.t('catalog.back')} onClick={goHome}>
            <ArrowRight size={22} className="rtl:rotate-180" />
          </IconButton>
          <h1 className="flex items-center gap-10 truncate text-ar-lg font-semibold sm:text-ar-xl">
            <Truck size={22} className="text-accent" />
            {i18n.t('deliveries.title')}
          </h1>
        </div>
        <div className="flex items-center gap-8">
          <AlertBell muted={alert.muted} onMutedChange={alert.setMuted} />
          <SettingsMenu />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-16">
        {deliveries.isLoading ? (
          <LoadingList rows={4} rowClassName="h-item-card" />
        ) : deliveries.isError ? (
          <ErrorState
                title={i18n.t('common.loadFailed')}
                detail={i18n.t(describeError(deliveries.error))}
                onRetry={() => void deliveries.refetch()}
                retryLabel={i18n.t('common.retry')}
              />
        ) : orders.length === 0 ? (
          <EmptyState title={i18n.t('deliveries.empty')} icon={<Truck size={30} />} />
        ) : (
          <div className="mx-auto flex max-w-5xl flex-col gap-16">
            {alert.unseen > 0 ? (
              <button
                type="button"
                onClick={alert.acknowledge}
                role="status"
                aria-live="polite"
                className="flex items-center justify-between gap-12 rounded-lg border border-accent bg-accent-tint px-14 py-12 text-ar-base"
              >
                <span className="flex items-center gap-8">
                  <BellRing size={18} className="text-accent" />
                  {i18n.plural('alerts.newBanner', alert.unseen)}
                </span>
                <span className="text-ar-sm text-text-muted">{i18n.t('alerts.dismiss')}</span>
              </button>
            ) : null}

            {mine.length ? (
              <section className="flex flex-col gap-10">
                <h2 className="text-ar-md font-medium">
                  {i18n.t('deliveries.yourTurn')} · {i18n.int(mine.length)}
                </h2>
                <div className="grid grid-cols-1 gap-14 lg:grid-cols-2">
                  {mine.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </section>
            ) : null}

            {theirs.length ? (
              <section className="flex flex-col gap-10">
                <h2 className="text-ar-md font-medium text-text-muted">
                  {i18n.t('deliveries.withKitchen')} · {i18n.int(theirs.length)}
                </h2>
                <div className="grid grid-cols-1 gap-14 lg:grid-cols-2">
                  {theirs.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </section>
            ) : null}
            {done.length ? (
              <details className="rounded-lg border border-line bg-surface">
                <summary className="cursor-pointer px-16 py-12 text-ar-base font-medium text-text-muted">
                  {i18n.t('deliveries.completed', { count: i18n.int(done.length) })}
                </summary>
                <div className="grid grid-cols-1 gap-14 p-14 pt-0 lg:grid-cols-2">
                  {done.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </details>
            ) : null}
            <Pager window={win} onOffset={setOffset} busy={deliveries.isFetching} />
          </div>
        )}
      </main>
    </div>
  );
}

function OrderCard({ order }: { order: DeliveryOrder }) {
  const i18n = useI18n();
  const auth = useAuth();
  const router = useRouter();
  const setStatus = useSetDeliveryStatus();
  const [collecting, setCollecting] = useState(false);
  const [collectFailed, setCollectFailed] = useState(false);
  // Cancelling a customer's order took one tap and recorded no reason; a
  // mis-tap dropped the order for good (user-experience review, batch 11).
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // Hand the till a copy of the order and open its payment screen there.
  const collect = async () => {
    setCollecting(true);
    setCollectFailed(false);
    try {
      const shift = await shiftRepository.activeShift();
      await orderRepository.adopt(
        collectableRecord(order, {
          shiftRef: shift?.id ?? null,
          cashierId: auth.user?.id ?? null,
          cashierName: auth.user?.display_name ?? '',
        }),
      );
      router.push(`/pos/payment/?order=${order.id}`);
    } catch (error) {
      console.error('[deliveries] collect', error);
      setCollectFailed(true);
      setCollecting(false);
    }
  };
  // Money and counts follow the viewer's numeral setting like everywhere else;
  // this screen used to force Arabic-Indic and ignore the toggle.
  const money = (minor: string) => i18n.money(BigInt(minor));
  const ds = (order.delivery_status || 'pending') as DeliveryStatus;
  const next = NEXT[ds];
  const terminal = ds === 'delivered' || ds === 'cancelled';
  // The only step that waits on somebody else.
  const waiting = waitingOnKitchen(order);
  const refusal = !setStatus.error
    ? null
    : i18n.t(
        (setStatus.error instanceof ApiError
          ? (REFUSAL_KEY[setStatus.error.code as keyof typeof REFUSAL_KEY] ?? 'error.unknown')
          : 'error.unknown') as Parameters<typeof i18n.t>[0],
      );

  return (
    <article className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-16">
      <div className="flex items-center justify-between gap-8">
        <span className="numeric text-num-lg font-bold" dir="ltr">#{order.number}</span>
        <div className="flex items-center gap-6">
          {/* What the kitchen reports, shown but never editable here. */}
          {order.kitchen_status && !terminal ? (
            <span className="rounded-full bg-surface-2 px-8 py-2 text-ar-xs text-text-muted">
              {i18n.t('deliveries.kitchen')}: {i18n.t(KITCHEN_KEY[order.kitchen_status] ?? 'deliveries.kitchen')}
            </span>
          ) : null}
          {order.status === 'closed' ? <StatusChip label={i18n.t('deliveries.paid')} tone="success" /> : null}
          <StatusChip label={i18n.t(STATUS_KEY[ds])} tone={TONE[ds]} dot />
        </div>
      </div>

      {/* Customer details — the point of a delivery order. */}
      <div className="flex flex-col gap-6 rounded-md bg-surface-2 p-12 text-ar-sm">
        <span className="text-ar-base font-semibold">{order.customer_name}</span>
        <a href={`tel:${order.customer_phone}`} className="flex items-center gap-6 text-accent">
          <Phone size={14} />
          <span className="numeric" dir="ltr">{order.customer_phone}</span>
        </a>
        <span className="flex items-start gap-6 text-text-muted">
          <MapPin size={14} className="mt-2 flex-none" />
          <span>
            {order.customer_address}
            {order.customer_area ? ` · ${order.customer_area}` : ''}
          </span>
        </span>
        {order.customer_notes ? (
          <span className="flex items-start gap-6 text-warning">
            <StickyNote size={14} className="mt-2 flex-none" />
            {order.customer_notes}
          </span>
        ) : null}
      </div>

      {/* Items */}
      <ul className="flex flex-col gap-4 text-ar-base">
        {order.lines.map((line) => (
          <li key={line.id} className="flex justify-between">
            <span>
              <span className="numeric">{i18n.int(line.qty)}</span> × {line.name_ar}
            </span>
            <span className="numeric text-text-muted">{money(line.line_total_minor)}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-line pt-10">
        <span className="text-ar-sm text-text-muted">
          <span className="numeric" dir="ltr">{formatTime(new Date(order.created_at))}</span>
        </span>
        <span className="numeric text-num-base font-bold text-accent">{money(order.total_minor)}</span>
      </div>

      {canCollect(order) ? (
        <Button variant={terminal ? 'primary' : 'secondary'} onClick={() => void collect()} disabled={collecting}>
          <span className="flex items-center gap-6">
            <Banknote size={16} />
            {i18n.t('deliveries.collect')}
          </span>
        </Button>
      ) : null}

      {!terminal ? (
        <div className="flex flex-wrap items-center gap-8">
          {next && !waiting ? (
            <Button
              variant="primary"
              onClick={() => setStatus.mutate({ id: order.id, status: next })}
              disabled={setStatus.isPending}
            >
              {i18n.t(`deliveries.advance.${next}` as never)}
            </Button>
          ) : null}
          {waiting ? (
            /* Not an error and not a disabled button — simply not this role's
               turn, said plainly so nobody stands there clicking. */
            <span className="flex items-center gap-6 rounded-md bg-surface-2 px-12 py-8 text-ar-sm text-text-muted">
              <Clock size={16} />
              {i18n.t('deliveries.awaitingKitchen')}
            </span>
          ) : null}
          <Button variant="secondary" onClick={() => setConfirmingCancel(true)} disabled={setStatus.isPending}>
            <span className="flex items-center gap-6">
              <X size={16} />
              {i18n.t('deliveries.cancel')}
            </span>
          </Button>
          {refusal && !confirmingCancel ? (
            <span role="status" aria-live="polite" className="w-full text-ar-sm text-danger">
              {refusal}
            </span>
          ) : null}
          {collectFailed ? (
            <span role="alert" className="w-full text-ar-sm text-danger">
              {i18n.t('deliveries.collectFailed')}
            </span>
          ) : null}
          <ConfirmDialog
            open={confirmingCancel}
            title={i18n.t('deliveries.cancelTitle', { number: order.number })}
            body={i18n.t('deliveries.cancelBody')}
            confirmLabel={i18n.t('deliveries.cancel')}
            cancelLabel={i18n.t('common.back')}
            reasons={[
              i18n.t('deliveries.reason.noAnswer'),
              i18n.t('deliveries.reason.customerCancelled'),
              i18n.t('deliveries.reason.outOfArea'),
              i18n.t('deliveries.reason.unavailable'),
            ]}
            otherReason={{ label: i18n.t('pos.void.otherReason'), placeholder: i18n.t('pos.void.otherPlaceholder') }}
            pending={setStatus.isPending}
            error={confirmingCancel ? refusal : null}
            onCancel={() => {
              setConfirmingCancel(false);
              setStatus.reset();
            }}
            onConfirm={(reason) =>
              setStatus.mutate(
                { id: order.id, status: 'cancelled', reason },
                { onSuccess: () => setConfirmingCancel(false) },
              )
            }
          />
        </div>
      ) : null}
    </article>
  );
}
