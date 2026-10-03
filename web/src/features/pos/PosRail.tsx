'use client';

/**
 * The navigation rail, shared by the top-level cashier screens (order entry,
 * open orders, menu, reports, shift close). Extracted so every destination
 * carries the same rail and highlights its own entry.
 */
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutGrid,
  ListOrdered,
  Truck,
  Utensils,
  BarChart3,
  Clock,
  CloudUpload,
  LogOut,
  MoreHorizontal,
  X,
} from 'lucide-react';

import { IconButton, NavRail, NavRailItem, RailStatus } from '@/components';
import { useArrivalAlert } from '@/features/alerts/useArrivalAlert';
import { ARRIVAL_KEYS } from '@/features/alerts/memory';
import { useI18n } from '@/i18n';
import { useAuth } from '@/features/auth/AuthProvider';
import { useModalDialog } from '@/lib/useModalDialog';
import { usePos } from './PosProvider';
import { RAIL_TARGETS, phoneBar, type RailTarget } from './railItems';

export type { RailTarget } from './railItems';

const ROUTES: Record<RailTarget, string> = {
  order: '/pos',
  orders: '/pos/orders',
  deliveries: '/deliveries',
  menu: '/pos/menu',
  reports: '/pos/report',
  sync: '/pos/sync',
  shift: '/pos/shift-close',
};

export function PosRail({ active }: { active: RailTarget }) {
  const i18n = useI18n();
  const router = useRouter();
  const auth = useAuth();
  // The real connection state. This label used to be the constant string
  // "offline", so a till with a working line was told it was disconnected for
  // as long as it ran — and every sync question started from a false premise.
  const pos = usePos();
  const go = (target: RailTarget) => () => router.push(ROUTES[target]);

  // A customer's order lands on the server without anyone at the till asking,
  // and the cashier is looking at the menu, not at the delivery screen. The
  // count arrives on the sync loop that was already running — `/pos` never
  // fetches anything — and the chime is what actually gets someone's attention.
  const waiting = pos.pendingDeliveries;
  useArrivalAlert({
    ids: waiting ?? [],
    storageKey: ARRIVAL_KEYS.till,
    // Nothing is announced until sync has answered once. Treating "not known
    // yet" as "none waiting" would make the first successful run chime for
    // every order already on the board.
    ready: waiting !== null,
    noticeTitle: i18n.t('alerts.newDeliveryTitle'),
    noticeBody: (count) => i18n.t('alerts.newDeliveryBody', { count: i18n.int(count) }),
  });

  const items: Record<RailTarget, { icon: React.ReactNode; label: string; badge?: string }> = {
    order: { icon: <LayoutGrid size={24} />, label: i18n.t('pos.title') },
    orders: { icon: <ListOrdered size={24} />, label: i18n.t('pos.orders.title') },
    // Customer delivery orders are the till's to confirm and send out.
    deliveries: {
      icon: <Truck size={24} />,
      label: i18n.t('deliveries.title'),
      badge: waiting && waiting.length > 0 ? i18n.int(waiting.length) : undefined,
    },
    menu: { icon: <Utensils size={24} />, label: i18n.t('pos.menu.title') },
    reports: { icon: <BarChart3 size={24} />, label: i18n.t('pos.reports.title') },
    // What has not reached the server yet, and the button that sends it.
    sync: { icon: <CloudUpload size={24} />, label: i18n.t('pos.sync.title') },
    shift: { icon: <Clock size={24} />, label: i18n.t('pos.shift.close') },
  };
  const bar = phoneBar(active);
  const [moreOpen, setMoreOpen] = useState(false);
  const signOut = {
    icon: <LogOut size={24} />,
    // Shift handover: the day cashier signs out, the night cashier signs in,
    // and from then on the orders carry the right name.
    label: auth.user?.display_name || i18n.t('manager.logout'),
    onClick: () => void auth.signOut(),
  };

  return (
    <>
      <NavRail
        footer={
          <div className="hidden md:flex md:flex-col md:items-center md:gap-6">
            {/* On the phone the header carries the same chip. */}
            <RailStatus
              label={i18n.t(pos.online ? 'pos.status.online' : 'pos.status.offline')}
              tone={pos.online ? 'success' : 'warning'}
            />
            <NavRailItem {...signOut} />
          </div>
        }
      >
        {RAIL_TARGETS.map((target) => (
          <NavRailItem
            key={target}
            {...items[target]}
            active={active === target}
            onClick={go(target)}
            // Every cell on the rail; on the phone only the bar's own.
            className={bar.primary.includes(target) ? undefined : 'hidden md:flex'}
          />
        ))}
        <NavRailItem
          icon={<MoreHorizontal size={24} />}
          label={i18n.t('pos.nav.more')}
          active={bar.moreActive}
          expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
          className="md:hidden"
        />
      </NavRail>

      {moreOpen ? (
        <MoreSheet
          title={i18n.t('pos.nav.moreTitle')}
          closeLabel={i18n.t('pos.nav.closeMore')}
          dir={i18n.dir}
          onClose={() => setMoreOpen(false)}
        >
          {bar.more.map((target) => (
            <MoreRow
              key={target}
              {...items[target]}
              active={active === target}
              onClick={() => {
                setMoreOpen(false);
                go(target)();
              }}
            />
          ))}
          <MoreRow {...signOut} />
        </MoreSheet>
      ) : null}
    </>
  );
}

/** The phone's "more": the rest of the rail as a bottom sheet. */
function MoreSheet({
  title,
  closeLabel,
  dir,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  dir: 'rtl' | 'ltr';
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useModalDialog(panel, onClose);
  return (
    <div className="fixed inset-0 z-40 md:hidden" dir={dir}>
      <button type="button" tabIndex={-1} aria-label={closeLabel} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-xl border-t border-line bg-surface px-12 pb-16 pt-8 shadow-overlay"
      >
        <div className="flex items-center justify-between ps-8">
          <span className="text-ar-lg font-semibold">{title}</span>
          <IconButton variant="quiet" label={closeLabel} onClick={onClose}>
            <X size={24} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function MoreRow({
  icon,
  label,
  badge,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={
        'flex min-h-control-xl items-center gap-14 rounded-md px-12 text-start text-ar-md outline-none ' +
        (active ? 'bg-accent-tint text-accent' : 'text-text hover:bg-surface-2')
      }
    >
      <span className="text-text-muted">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge ? <span className="text-num-sm font-bold text-danger">{badge}</span> : null}
    </button>
  );
}
