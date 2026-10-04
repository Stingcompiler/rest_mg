'use client';

/**
 * The manager chrome: a sidebar of destinations and a header. Shared by every
 * dashboard page. Uses the same tokens, both locales, and both themes as the
 * cashier — the only difference underneath is that this half is online.
 *
 * Responsive by breakpoint. From `lg` up the sidebar is a fixed rail, as it has
 * always been — an owner at a desk. Below that (a phone in the hand) the rail
 * becomes an off-canvas drawer opened by a header button and closed by a tap on
 * the backdrop, on the destination, or on Escape. The drawer slides in from the
 * start edge, so it comes from the right in Arabic and the left in English
 * without either being hardcoded.
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, History, LayoutDashboard, Menu, MonitorSmartphone, Store, Users, Utensils, Wallet, LogOut } from 'lucide-react';

import { IconButton, SettingsMenu } from '@/components';
import { useModalDialog } from '@/lib/useModalDialog';
import { useI18n } from '@/i18n';
import { useAuth } from '@/features/auth/AuthProvider';

interface NavEntry {
  href: string;
  labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0];
  icon: React.ReactNode;
}

// Deliberately no "deliveries" entry: taking and dispatching customer orders is
// front-of-house work and lives on the cashier's rail. A manager still *may*
// open /deliveries (small shops run one person), but their dashboard is for
// oversight — the day's numbers, the menu, the staff — not for standing in for
// the till.
const NAV: NavEntry[] = [
  { href: '/manager', labelKey: 'manager.nav.overview', icon: <LayoutDashboard size={20} /> },
  { href: '/catalog', labelKey: 'manager.nav.catalog', icon: <Utensils size={20} /> },
  { href: '/manager/reports', labelKey: 'manager.nav.reports', icon: <BarChart3 size={20} /> },
  { href: '/manager/profile', labelKey: 'manager.nav.profile', icon: <Store size={20} /> },
  { href: '/manager/customers', labelKey: 'manager.nav.customers', icon: <Wallet size={20} /> },
  { href: '/manager/staff', labelKey: 'manager.nav.staff', icon: <Users size={20} /> },
  { href: '/manager/activity', labelKey: 'manager.nav.activity', icon: <History size={20} /> },
  { href: '/manager/devices', labelKey: 'manager.nav.devices', icon: <MonitorSmartphone size={20} /> },
];

export function ManagerShell({ title, children }: { title: string; children: React.ReactNode }) {
  const i18n = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const auth = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sign-out is shared: it clears the cookie and the cached identity, then
  // returns to the one login screen.
  const signOut = () => void auth.signOut();

  const go = (href: string) => {
    router.push(href);
    setDrawerOpen(false); // a chosen destination closes the drawer on mobile
  };


  const nav = (
    <nav className="flex h-full flex-col gap-8">
      <div className="flex flex-col gap-10 px-10 pb-14 pt-6">
        <span className="font-display text-ar-xl font-semibold text-on-ink">{i18n.t('manager.title')}</span>
        <span aria-hidden="true" className="h-px w-thumb-sm bg-gold-soft" />
      </div>
      {NAV.map((entry) => {
        // The export serves every page with a trailing slash ("/manager/"), so
        // a plain comparison never matched and no page was ever marked current.
        const active = (pathname.replace(/\/+$/, '') || '/') === entry.href;
        return (
          <button
            key={entry.href}
            type="button"
            onClick={() => go(entry.href)}
            className={
              // On ink (batch 13): ivory labels, the current page lifted with a
              // gold edge on its start side.
              active
                ? 'flex min-h-control-lg items-center gap-10 rounded-sm border-s-strong border-gold-soft bg-ink-2 px-14 text-ar-base font-medium text-on-ink'
                : 'flex min-h-control-lg items-center gap-10 rounded-sm border-s-strong border-transparent px-14 text-ar-base text-on-ink-muted hover:bg-ink-2 hover:text-on-ink'
            }
          >
            {entry.icon}
            {i18n.t(entry.labelKey)}
          </button>
        );
      })}
      <button
        type="button"
        onClick={signOut}
        className="mt-auto flex min-h-control-lg items-center gap-10 rounded-sm px-14 text-ar-base text-on-ink-muted hover:bg-ink-2 hover:text-on-ink"
      >
        <LogOut size={20} />
        {i18n.t('manager.logout')}
      </button>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-bg text-text" dir={i18n.dir}>
      {/* The rail — from lg up only. */}
      <aside className="hidden w-manager-sidebar flex-none bg-ink p-14 lg:block">
        {nav}
      </aside>

      {/* The drawer — below lg. Backdrop plus an off-canvas panel from the start edge. */}
      {drawerOpen ? (
        <Drawer label={i18n.t('manager.nav.open')} closeLabel={i18n.t('manager.nav.close')} onClose={() => setDrawerOpen(false)}>
          {nav}
        </Drawer>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-header flex-none items-center justify-between gap-12 border-b border-line bg-surface px-16 sm:px-24">
          <div className="flex min-w-0 items-center gap-12">
            <IconButton
              variant="quiet"
              label={i18n.t('manager.nav.open')}
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden"
            >
              <Menu size={24} />
            </IconButton>
            <h1 className="truncate font-display text-ar-xl font-semibold sm:text-ar-2xl">{title}</h1>
          </div>
          <SettingsMenu />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-16 sm:p-24">
          {/* A measure for wide screens: at 1920 the pages ran 1684px across,
              and a row of four figures or a chart that wide is hard to read. */}
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * The navigation drawer below lg. It is a modal while open: focus moves in,
 * Tab stays inside, Escape closes it (batch 15).
 */
function Drawer({
  label,
  closeLabel,
  onClose,
  children,
}: {
  label: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useModalDialog(panel, onClose);
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <button type="button" tabIndex={-1} aria-label={closeLabel} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="absolute inset-y-0 start-0 w-manager-sidebar max-w-[80vw] bg-ink p-14 shadow-overlay"
      >
        {children}
      </aside>
    </div>
  );
}
