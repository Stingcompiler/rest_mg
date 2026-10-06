'use client';

/**
 * The kitchen display — its own screen, on its own device.
 *
 * Unlike the cashier this is deliberately **online**: it polls the server for
 * tickets, because the food is ordered on a different device. If the network
 * drops it says so and stops updating; the printed ticket is the fallback that
 * keeps the kitchen working, which is why losing this screen is an
 * inconvenience rather than a failure.
 *
 * The board is big, high-contrast, and touch-first: a cook glances at it from a
 * metre away with their hands full. Each ticket advances queued → preparing →
 * ready → served with a single large button, and leaves the board when served.
 * A step taken by mistake can be taken back: "back" on the ticket, and "undo"
 * for a few seconds after it was served.
 */
import { useCallback, useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';

import { BrandMark, Button, EmptyState, ErrorState, Numeric, SettingsMenu, StatusChip, Toast } from '@/components';
import { AlertBell } from '@/features/alerts/AlertBell';
import { useArrivalAlert } from '@/features/alerts/useArrivalAlert';
import { ARRIVAL_KEYS } from '@/features/alerts/memory';
import { formatTime, useI18n } from '@/i18n';
import { useAuth } from '@/features/auth/AuthProvider';
import { ApiError } from '@/lib/http';
import { kitchenApi, type KitchenStatus, type KitchenTicket } from './api';
import { nextKitchenStatus, previousKitchenStatus } from './steps';

// Five seconds, not ten. The cashier's press pushes the ticket to the server
// straight away, so this interval is the whole of the remaining delay between
// somebody pressing "send" and the kitchen hearing about it.
const POLL_MS = 5_000;

/** The bar along a ticket's edge, in the colour of its age (batch 21). */
const AGE_BAR: Record<'success' | 'warning' | 'danger', string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/** How long a ticket has been waiting, and how alarmed to be about it. */
function age(sentAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(sentAt)) / 60_000));
  const tone: 'success' | 'warning' | 'danger' =
    minutes < 10 ? 'success' : minutes < 20 ? 'warning' : 'danger';
  return { minutes, tone };
}

const ACTION_KEY = {
  queued: 'kitchen.start',
  preparing: 'kitchen.markReady',
  ready: 'kitchen.markServed',
} as const;

const STATUS_KEY = {
  queued: 'kitchen.queued',
  preparing: 'kitchen.preparing',
  ready: 'kitchen.ready',
  served: 'kitchen.served',
} as const;

export function KitchenScreen() {
  const i18n = useI18n();
  const auth = useAuth();
  const [tickets, setTickets] = useState<KitchenTicket[] | null>(null);
  const [total, setTotal] = useState(0);
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const data = await kitchenApi.tickets();
      setTickets(data.tickets);
      setTotal(data.total ?? data.tickets.length);
      setOnline(true);
    } catch {
      // Keep showing the last board rather than blanking the screen; the cooks
      // are mid-service and stale tickets beat no tickets.
      setOnline(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    // A separate, faster tick so the ageing colours move without re-fetching.
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [load]);

  // The board is propped up across the kitchen and nobody is watching it. A
  // ticket landing has to be *heard*, which is the whole reason the sound
  // exists — the count and the banner are for whoever does glance over.
  const alert = useArrivalAlert({
    ids: (tickets ?? []).filter((t) => t.kitchen_status === 'queued').map((t) => t.id),
    storageKey: ARRIVAL_KEYS.kitchen,
    ready: tickets !== null,
    noticeTitle: i18n.t('alerts.newTicketTitle'),
    noticeBody: (count) => i18n.plural('alerts.newTicketBody', count),
  });

  // Tickets with a step in flight. Their buttons wait, so a double tap on
  // "start" no longer marks the ticket ready.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<{ text: string; undo?: KitchenTicket } | null>(null);

  const move = async (ticket: KitchenTicket, to: KitchenStatus) => {
    if (busy.has(ticket.id)) return;
    setBusy((current) => new Set(current).add(ticket.id));
    // Optimistic: the board reacts under the cook's hand, then reconciles.
    setTickets((current) =>
      (current ?? []).flatMap((entry) =>
        entry.id !== ticket.id ? [entry] : to === 'served' ? [] : [{ ...entry, kitchen_status: to }],
      ),
    );
    try {
      await kitchenApi.setStatus(ticket.id, to);
      setOnline(true);
      if (to === 'served') {
        setNotice({ text: i18n.t('kitchen.servedNotice', { number: ticket.number }), undo: ticket });
      }
    } catch (error) {
      // A refusal is not a dropped line: say what the server said (a cancelled
      // order, say) instead of showing "offline" and quietly putting it back.
      if (error instanceof ApiError && error.status < 500) {
        setNotice({
          text: i18n.t(error.code === 'order_cancelled' ? 'kitchen.refusedCancelled' : 'kitchen.refused', {
            number: ticket.number,
          }),
        });
      } else {
        setOnline(false);
      }
    } finally {
      setBusy((current) => {
        const rest = new Set(current);
        rest.delete(ticket.id);
        return rest;
      });
    }
    void load();
  };

  const advance = (ticket: KitchenTicket) => {
    const next = nextKitchenStatus(ticket.kitchen_status);
    if (next) void move(ticket, next);
  };

  const stepBack = (ticket: KitchenTicket) => {
    const previous = previousKitchenStatus(ticket.kitchen_status);
    if (previous) void move(ticket, previous);
  };

  return (
    // Dark whatever the rest of the app is set to: less glare in a lit kitchen,
    // and the age colours stand out on it (batch 21).
    <div className="flex h-screen flex-col bg-bg text-text" dir={i18n.dir} data-screen="kitchen" data-theme="dark">
      <header className="flex h-header flex-none items-center justify-between gap-10 border-b border-line bg-surface px-16 sm:px-20">
        <div className="flex items-baseline gap-12">
          <span className="hidden border-e border-line pe-12 sm:flex"><BrandMark inline /></span>
          <h1 className="text-ar-lg font-semibold sm:text-ar-xl">{i18n.t('kitchen.title')}</h1>
          <Numeric className="text-num-base text-text-muted">
            {i18n.int(tickets?.length ?? 0)}
          </Numeric>
          {/* The board shows the oldest tickets; more are waiting behind them. */}
          {tickets && total > tickets.length ? (
            <span role="status" className="text-ar-sm font-medium text-warning">
              {i18n.t('kitchen.moreWaiting', { count: i18n.int(total - tickets.length) })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-10">
          {!online ? <StatusChip label={i18n.t('kitchen.offline')} tone="warning" dot /> : null}
          {/* Identity and clock are reassurance, not function — drop them first
              when the header runs out of room on a phone. */}
          <span className="hidden text-ar-sm text-text-muted sm:inline">
            {i18n.t('auth.signedInAs', { name: auth.user?.display_name ?? '' })}
          </span>
          <Numeric className="hidden text-num-base sm:inline">{formatTime(new Date(now))}</Numeric>
          <AlertBell muted={alert.muted} onMutedChange={alert.setMuted} />
          <SettingsMenu />
          <Button variant="secondary" onClick={() => void auth.signOut()}>
            {i18n.t('manager.logout')}
          </Button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-16">
        {alert.unseen > 0 ? (
          <button
            type="button"
            onClick={alert.acknowledge}
            role="status"
            aria-live="polite"
            className="mb-14 flex w-full items-center justify-between gap-12 rounded-lg border border-accent bg-accent-tint px-16 py-14 text-ar-lg font-semibold"
          >
            <span className="flex items-center gap-10">
              <BellRing size={22} className="text-accent" />
              {i18n.plural('alerts.newBanner', alert.unseen)}
            </span>
            <span className="text-ar-sm font-normal text-text-muted">{i18n.t('alerts.dismiss')}</span>
          </button>
        ) : null}
        {tickets === null && !online ? (
          // The first load failed: say so, rather than a blank board that
          // looks like a quiet night.
          <ErrorState
            title={i18n.t('kitchen.loadFailed')}
            detail={i18n.t('error.network')}
            retryLabel={i18n.t('common.retry')}
            onRetry={() => void load()}
          />
        ) : tickets === null ? null : tickets.length === 0 ? (
          <EmptyState title={i18n.t('kitchen.empty')} />
        ) : (
          <div className="grid grid-cols-tickets content-start gap-14">
            {tickets.map((ticket) => {
              const { minutes, tone } = age(ticket.sent_at, now);
              const action = ACTION_KEY[ticket.kitchen_status as keyof typeof ACTION_KEY];
              return (
                <article
                  key={ticket.id}
                  data-age={tone}
                  className="relative flex flex-col gap-12 overflow-hidden rounded-lg border border-line bg-surface p-16 ps-20"
                >
                  {/* Readable from across the kitchen, where the minutes are not. */}
                  <span aria-hidden="true" className={`absolute inset-y-0 start-0 w-4 ${AGE_BAR[tone]}`} />
                  <div className="flex items-center justify-between">
                    <Numeric className="text-num-xl font-bold">{ticket.number}</Numeric>
                    <StatusChip
                      label={i18n.t(STATUS_KEY[ticket.kitchen_status])}
                      tone={ticket.kitchen_status === 'ready' ? 'success' : 'neutral'}
                    />
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-ar-base text-text-muted">
                      {i18n.t(
                        ticket.type === 'takeaway'
                          ? 'pos.orderType.takeaway'
                          : ticket.type === 'delivery'
                            ? 'pos.orderType.delivery'
                            : 'pos.orderType.dineIn',
                      )}
                    </span>
                    <span
                      className={
                        tone === 'danger'
                          ? 'text-ar-base font-semibold text-danger'
                          : tone === 'warning'
                            ? 'text-ar-base font-semibold text-warning'
                            : 'text-ar-base text-success'
                      }
                    >
                      {i18n.plural('kitchen.minutesAgo', minutes)}
                    </span>
                  </div>

                  {/* The part that matters: what to cook, at a glance. */}
                  <ul className="flex flex-col gap-8">
                    {ticket.lines.map((line) => (
                      <li key={line.id} className="flex flex-col">
                        <span className="text-ar-lg font-semibold">
                          <Numeric>{i18n.int(line.qty)}</Numeric>
                          {' × '}
                          {line.name_ar}
                        </span>
                        {line.modifiers_text ? (
                          <span className="text-ar-base text-warning">{line.modifiers_text}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {action ? (
                    <div className="flex gap-10">
                      <Button
                        variant="primary"
                        size="xl"
                        className="flex-1"
                        disabled={busy.has(ticket.id)}
                        onClick={() => advance(ticket)}
                      >
                        {i18n.t(action)}
                      </Button>
                      {previousKitchenStatus(ticket.kitchen_status) ? (
                        <Button
                          variant="secondary"
                          size="xl"
                          disabled={busy.has(ticket.id)}
                          aria-label={i18n.t('kitchen.stepBackLabel', { number: ticket.number })}
                          onClick={() => stepBack(ticket)}
                        >
                          {i18n.t('kitchen.stepBack')}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </main>
      {notice ? (
        <Toast
          message={notice.text}
          actionLabel={notice.undo ? i18n.t('kitchen.undo') : undefined}
          onAction={notice.undo ? () => void move({ ...notice.undo!, kitchen_status: 'served' }, 'ready') : undefined}
          onDismiss={() => setNotice(null)}
          durationMs={notice.undo ? 8_000 : 6_000}
        />
      ) : null}
    </div>
  );
}
