'use client';

/**
 * Non-interactive display primitives: Numeric, StatusChip, ConnectionDot,
 * Badge, SyncBadge, ProgressBar, Divider.
 *
 * `Numeric` is the one every money and count value flows through — it applies
 * the mono, tabular numeral treatment so columns line up in both numeral
 * systems (verified in phase 4). Callers pass an already-formatted string.
 */
import { cn } from '@/lib/cn';

export function Numeric({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('numeric', className)}>{children}</span>;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'credit' | 'accent';

const DOT_TONES: Record<Tone, string> = {
  neutral: 'bg-text-muted',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  credit: 'bg-credit',
  accent: 'bg-accent',
};

export function ConnectionDot({ tone = 'neutral' }: { tone?: Tone }) {
  return <span className={cn('inline-block size-dot rounded-pill', DOT_TONES[tone])} />;
}

export interface StatusChipProps {
  label: string;
  tone?: Tone;
  /** A trailing numeric badge, e.g. the "بانتظار المزامنة 12" counter. */
  count?: string;
  dot?: boolean;
}

const CHIP_TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 border-line text-text-muted',
  success: 'bg-success-tint border-success text-success',
  warning: 'bg-warning-tint border-warning text-warning',
  danger: 'bg-danger-tint border-danger text-danger',
  credit: 'bg-credit-tint border-credit text-credit-text',
  accent: 'bg-accent-tint border-accent-tint-border text-accent',
};

export function StatusChip({ label, tone = 'neutral', count, dot }: StatusChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-control-sm items-center gap-8 rounded-md border px-12 text-ar-sm',
        CHIP_TONES[tone],
      )}
    >
      {dot ? <ConnectionDot tone={tone} /> : null}
      <span>{label}</span>
      {count ? <Numeric className="text-num-sm text-text">{count}</Numeric> : null}
    </span>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <span className={cn('inline-flex items-center rounded-sm border px-10 py-4 text-ar-sm', CHIP_TONES[tone])}>
      {label}
    </span>
  );
}

/** The circular in-cart count on a menu card. */
export function CountBadge({ count }: { count: string }) {
  return (
    <span className="inline-flex min-w-badge items-center justify-center rounded-xl bg-accent px-8 text-num-base text-text-on-accent">
      <Numeric>{count}</Numeric>
    </span>
  );
}

export interface ProgressBarProps {
  /** 0–100. */
  percent: number;
  tone?: Tone;
  /** The thin age bar is 6px; the payment progress bar is 12px. */
  size?: 'thin' | 'thick';
}

export function ProgressBar({ percent, tone = 'accent', size = 'thick' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'w-full overflow-hidden rounded-pill bg-surface-3',
        size === 'thick' ? 'h-12' : 'h-6',
      )}
    >
      <div
        className={cn('h-full rounded-pill', DOT_TONES[tone])}
        style={{ inlineSize: `${clamped}%` }}
      />
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line', className)} />;
}
