'use client';

/**
 * The screen frame: AppHeader and NavRail.
 *
 * Both are built with logical properties (`border-inline-start`, `ps`/`pe`) so
 * they mirror between Arabic and English without a second layout. The rail sits
 * on the start edge in both directions.
 */
import { cn } from '@/lib/cn';
import { ConnectionDot } from '../primitives/indicators';

export interface AppHeaderProps {
  title: React.ReactNode;
  /** Right-hand cluster: status chips, clock, actions. */
  trailing?: React.ReactNode;
  /** Leading element before the title, e.g. a back button. */
  leading?: React.ReactNode;
}

export function AppHeader({ title, trailing, leading }: AppHeaderProps) {
  return (
    <header className="flex h-header flex-none items-center justify-between gap-12 border-b border-line bg-surface px-20">
      <div className="flex min-w-0 items-center gap-14">
        {leading}
        <div className="truncate text-ar-xl font-semibold text-text">{title}</div>
      </div>
      {trailing ? <div className="flex flex-none items-center gap-10">{trailing}</div> : null}
    </header>
  );
}

export interface NavRailItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?(): void;
  /** A count riding on the icon — already formatted for the reader's numerals. */
  badge?: string;
  /** Where the cell shows — e.g. `md:hidden` for the phone's "more". */
  className?: string;
  /** For a cell that opens a menu rather than a screen. */
  expanded?: boolean;
}

export function NavRailItem({ icon, label, active, onClick, badge, className, expanded }: NavRailItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      className={cn(
        // Mobile: share the bottom bar's width evenly. Desktop: the fixed rail cell.
        'flex min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-sm outline-none',
        'md:h-rail-item-h md:w-rail-item-w md:flex-none md:gap-6',
        // The rail sits on ink (batch 13): ivory labels, and the current
        // screen lifted with a gold edge.
        'border-b-strong md:border-b-0 md:border-e-strong',
        active
          ? 'border-gold-soft bg-ink-2 text-on-ink'
          : 'border-transparent text-on-ink-muted hover:bg-ink-2 hover:text-on-ink',
        className,
      )}
    >
      <span className="relative flex items-center justify-center">
        {icon}
        {badge ? (
          <span className="absolute -top-8 -end-10 min-w-icon-sm rounded-full border border-danger bg-danger-tint px-4 text-center text-ar-xs font-bold text-danger">
            {badge}
          </span>
        ) : null}
      </span>
      {/* Two lines rather than an ellipsis: "الطلبات المفتوحة" and
          "بانتظار المزامنة" do not fit on one, and half a word is not a
          label. */}
      <span className="line-clamp-2 max-w-full text-center text-ar-xs leading-snug">{label}</span>
    </button>
  );
}

export interface NavRailProps {
  children: React.ReactNode;
  /** The offline/online footer indicator. */
  footer?: React.ReactNode;
}

export function NavRail({ children, footer }: NavRailProps) {
  return (
    <nav
      className={cn(
        // Mobile: a fixed bottom bar — thumb-reachable, the phone convention.
        'fixed inset-x-0 bottom-0 z-30 flex h-mobile-nav w-full flex-none flex-row items-stretch',
        'gap-2 border-t border-ink-2 bg-bg-rail px-8',
        // Desktop: the vertical rail on the start edge, as before.
        'md:static md:h-auto md:w-rail md:flex-col md:items-center md:gap-6 md:border-s md:border-t-0 md:px-0 md:py-12',
      )}
    >
      {children}
      {footer ? (
        <div className="flex items-center md:mt-auto md:flex-col md:gap-4 md:pt-10">{footer}</div>
      ) : null}
    </nav>
  );
}

/** The rail's offline footer: a dot over a short label. */
export function RailStatus({ label, tone = 'warning' }: { label: string; tone?: 'warning' | 'success' }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <ConnectionDot tone={tone} />
      <span className="text-center text-ar-xs text-on-ink-muted">
        {label}
      </span>
    </div>
  );
}
