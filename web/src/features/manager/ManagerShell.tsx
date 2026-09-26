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
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, History, LayoutDashboard, Menu, MonitorSmartphone, Store, Users, Utensils, Wallet, LogOut } from 'lucide-react';

import { SettingsMenu } from '@/components';
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

  // Escape closes the drawer, matching the settings menu and every other overlay.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const nav = (
    <nav className="flex h-full flex-col gap-8">
      <div className="px-10 pb-12 pt-6 text-ar-lg font-bold">{i18n.t('manager.title')}</div>
      {NAV.map((entry) => {
        const active = pathname === entry.href;
        return (
          <button
            key={entry.href}
            type="button"
            onClick={() => go(entry.href)}
            className={
              active
                ? 'flex min-h-control-lg items-center gap-10 rounded-md bg-surface-2 px-14 text-ar-base font-medium text-accent'
                : 'flex min-h-control-lg items-center gap-10 rounded-md px-14 text-ar-base text-text-muted'
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
        className="mt-auto flex min-h-control-lg items-center gap-10 rounded-md px-14 text-ar-base text-text-muted"
      >
        <LogOut size={20} />
        {i18n.t('manager.logout')}
      </button>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-bg text-text" dir={i18n.dir}>
      {/* The rail — from lg up only. */}
      <aside className="hidden w-manager-sidebar flex-none border-e border-line bg-surface p-14 lg:block">
        {nav}
      </aside>

      {/* The drawer — below lg. Backdrop plus an off-canvas panel from the start edge. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label={i18n.t('manager.nav.close')}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="absolute inset-y-0 start-0 w-manager-sidebar max-w-[80vw] border-e border-line bg-surface p-14 shadow-xl">
            {nav}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-header flex-none items-center justify-between gap-12 border-b border-line bg-surface px-16 sm:px-24">
          <div className="flex min-w-0 items-center gap-12">
            <button
              type="button"
              aria-label={i18n.t('manager.nav.open')}
              onClick={() => setDrawerOpen(true)}
              className="flex min-h-control-md items-center rounded-md text-text-muted lg:hidden"
            >
              <Menu size={24} />
            </button>
            <h1 className="truncate text-ar-xl font-semibold sm:text-ar-2xl">{title}</h1>
          </div>
          <SettingsMenu />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-16 sm:p-24">{children}</main>
      </div>
    </div>
  );
}
