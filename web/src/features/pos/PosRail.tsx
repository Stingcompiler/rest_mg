'use client';

/**
 * The navigation rail, shared by the top-level cashier screens (order entry,
 * open orders, menu, reports, shift close). Extracted so every destination
 * carries the same rail and highlights its own entry.
 */
import { useRouter } from 'next/navigation';
import { LayoutGrid, ListOrdered, Truck, Utensils, BarChart3, Clock, CloudUpload, LogOut } from 'lucide-react';

import { NavRail, NavRailItem, RailStatus } from '@/components';
import { useArrivalAlert } from '@/features/alerts/useArrivalAlert';
import { ARRIVAL_KEYS } from '@/features/alerts/memory';
import { useI18n } from '@/i18n';
import { useAuth } from '@/features/auth/AuthProvider';
import { usePos } from './PosProvider';

export type RailTarget = 'order' | 'orders' | 'deliveries' | 'menu' | 'reports' | 'sync' | 'shift';

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

  return (
    <NavRail
      footer={
        <div className="flex items-center md:flex-col md:gap-6">
          {/* Desktop-only; on the phone the header carries the same chip. */}
          <div className="hidden md:block">
            <RailStatus
              label={i18n.t(pos.online ? 'pos.status.online' : 'pos.status.offline')}
              tone={pos.online ? 'success' : 'warning'}
            />
          </div>
          {/* Shift handover: the day cashier signs out, the night cashier signs
              in, and from then on the orders carry the right name. */}
          <NavRailItem
            icon={<LogOut size={24} />}
            label={auth.user?.display_name || i18n.t('manager.logout')}
            onClick={() => void auth.signOut()}
          />
        </div>
      }
    >
      <NavRailItem icon={<LayoutGrid size={24} />} label={i18n.t('pos.title')} active={active === 'order'} onClick={go('order')} />
      <NavRailItem icon={<ListOrdered size={24} />} label={i18n.t('pos.orders.title')} active={active === 'orders'} onClick={go('orders')} />
      {/* Customer delivery orders are the till's to confirm and send out. */}
      <NavRailItem
        icon={<Truck size={24} />}
        label={i18n.t('deliveries.title')}
        active={active === 'deliveries'}
        onClick={go('deliveries')}
        badge={waiting && waiting.length > 0 ? i18n.int(waiting.length) : undefined}
      />
      <NavRailItem icon={<Utensils size={24} />} label={i18n.t('pos.menu.title')} active={active === 'menu'} onClick={go('menu')} />
      <NavRailItem icon={<BarChart3 size={24} />} label={i18n.t('pos.reports.title')} active={active === 'reports'} onClick={go('reports')} />
      {/* What has not reached the server yet, and the button that sends it. */}
      <NavRailItem icon={<CloudUpload size={24} />} label={i18n.t('pos.sync.title')} active={active === 'sync'} onClick={go('sync')} />
      <NavRailItem icon={<Clock size={24} />} label={i18n.t('pos.shift.close')} active={active === 'shift'} onClick={go('shift')} />
    </NavRail>
  );
}
