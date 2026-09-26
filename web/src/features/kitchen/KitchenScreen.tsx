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
 */
import { useCallback, useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';

import { Button, EmptyState, Numeric, SettingsMenu, StatusChip } from '@/components';
import { AlertBell } from '@/features/alerts/AlertBell';
import { useArrivalAlert } from '@/features/alerts/useArrivalAlert';
import { ARRIVAL_KEYS } from '@/features/alerts/memory';
import { formatTime, useI18n } from '@/i18n';
import { useAuth } from '@/features/auth/AuthProvider';
import { kitchenApi, type KitchenStatus, type KitchenTicket } from './api';

// Five seconds, not ten. The cashier's press pushes the ticket to the server
// straight away, so this interval is the whole of the remaining delay between
// somebody pressing "send" and the kitchen hearing about it.
const POLL_MS = 5_000;

/** How long a ticket has been waiting, and how alarmed to be about it. */
function age(sentAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(sentAt)) / 60_000));
  const tone: 'success' | 'warning' | 'danger' =
    minutes < 10 ? 'success' : minutes < 20 ? 'warning' : 'danger';
  return { minutes, tone };
}

const NEXT_STATUS: Partial<Record<KitchenStatus, KitchenStatus>> = {
  queued: 'preparing',
  preparing: 'ready',
  ready: 'served',
};

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
  const [online, setOnline] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const data = await kitchenApi.tickets();
      setTickets(data.tickets);
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
    noticeBody: (count) => i18n.t('alerts.newTicketBody', { count: i18n.int(count) }),
  });

  const advance = async (ticket: KitchenTicket) => {
    const next = NEXT_STATUS[ticket.kitchen_status];
    if (!next) return;
    // Optimistic: the board reacts under the cook's hand, then reconciles.
    setTickets((current) =>
      (current ?? []).flatMap((entry) =>
        entry.id !== ticket.id
          ? [entry]
          : next === 'served'
            ? []
            : [{ ...entry, kitchen_status: next }],
      ),
    );
    try {
      await kitchenApi.setStatus(ticket.id, next);
    } catch {
      setOnline(false);
    }
    void load();
  };

  return (
    <div className="flex h-screen flex-col bg-bg text-text" dir={i18n.dir}>
      <header className="flex h-header flex-none items-center justify-between gap-10 border-b border-line bg-surface px-16 sm:px-20">
        <div className="flex items-baseline gap-12">
          <h1 className="text-ar-lg font-semibold sm:text-ar-xl">{i18n.t('kitchen.title')}</h1>
          <Numeric className="text-num-base text-text-muted">
            {i18n.int(tickets?.length ?? 0)}
          </Numeric>
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
              {i18n.t('alerts.newBanner', { count: i18n.int(alert.unseen) })}
            </span>
            <span className="text-ar-sm font-normal text-text-muted">{i18n.t('alerts.dismiss')}</span>
          </button>
        ) : null}
        {tickets === null ? null : tickets.length === 0 ? (
          <EmptyState title={i18n.t('kitchen.empty')} />
        ) : (
          <div className="grid grid-cols-1 content-start gap-14 sm:grid-cols-2 xl:grid-cols-3">
            {tickets.map((ticket) => {
              const { minutes, tone } = age(ticket.sent_at, now);
              const action = ACTION_KEY[ticket.kitchen_status as keyof typeof ACTION_KEY];
              return (
                <article
                  key={ticket.id}
                  className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-16"
                >
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
                      {i18n.t('kitchen.minutesAgo', { count: i18n.int(minutes) })}
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
                    <Button variant="primary" size="xl" onClick={() => void advance(ticket)}>
                      {i18n.t(action)}
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
