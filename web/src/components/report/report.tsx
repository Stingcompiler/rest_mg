'use client';

/**
 * Report components: KpiCard and KpiStrip, LedgerRow, BarChart, StackedShareBar.
 *
 * The charts are drawn with plain flex boxes and token colours — no chart
 * library, nothing to load offline. A bar chart's axis runs LTR even in Arabic
 * (time flows left-to-right on both), so its track is marked `dir="ltr"`.
 */
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Numeric } from '../primitives/indicators';

type KpiTone = 'text' | 'success' | 'credit';

const KPI_TONES: Record<KpiTone, string> = {
  text: 'text-text',
  success: 'text-success',
  credit: 'text-credit',
};

export interface KpiDelta {
  direction: 'up' | 'down' | 'flat';
  /** Already worded, e.g. "+١٢٪ عن الوقت نفسه أمس". */
  text: string;
}

export interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: KpiTone;
  /** How the figure moved against the period before (batch 22). */
  delta?: KpiDelta;
  /** Money's currency, set small after the figure (batch 40). */
  unit?: string;
  /** The figure the ledger opens with, set larger (batch 40). */
  lead?: boolean;
  /** Nothing yet: «—» with words, not «٠», a dot in Arabic-Indic digits (batch 40). */
  zero?: boolean;
  zeroLabel?: string;
}

const DELTA_TONE: Record<KpiDelta['direction'], string> = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-text-muted',
};

const DELTA_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

/**
 * A figure: a cell of a KpiStrip, not a box of its own (batch 40). Each figure
 * was a floating card with a gold top line in an even grid, the pattern every
 * generated dashboard repeats.
 */
export function KpiCard({ label, value, sub, tone = 'text', delta, unit, lead = false, zero = false, zeroLabel }: KpiCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6 bg-surface p-18">
      <span className="text-ar-sm text-text-muted">{label}</span>
      {zero ? (
        <span className="flex items-baseline gap-8">
          <span aria-hidden="true" className={cn('font-semibold text-text-muted', lead ? 'text-num-4xl' : 'text-num-2xl')}>
            —
          </span>
          {zeroLabel ? <span className="text-ar-sm text-text-muted">{zeroLabel}</span> : null}
        </span>
      ) : (
        <span className="flex items-baseline gap-6">
          <Numeric className={cn('font-semibold', lead ? 'text-num-4xl' : 'text-num-2xl', KPI_TONES[tone])}>{value}</Numeric>
          {unit ? <span className="text-ar-xs text-text-muted">{unit}</span> : null}
        </span>
      )}
      {delta ? <Delta delta={delta} /> : null}
      {sub ? <span className="text-ar-sm text-text-muted">{sub}</span> : null}
    </div>
  );
}

/**
 * Figures as one ledger band: cells divided by hairlines (the band's colour
 * showing through a 1px gap), in any number of rows, either direction.
 */
export function KpiStrip({ columns, children }: { columns: 2 | 3 | 4; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line',
        columns === 4 ? 'lg:grid-cols-4' : columns === 3 ? 'lg:grid-cols-3' : '',
      )}
    >
      {children}
    </div>
  );
}

/**
 * A line of a ledger: the label, a dotted leader, the figure; a note under it.
 * The same line the public menu sets its dishes in (batch 35).
 */
export function LedgerRow({ label, value, unit, note, tone = 'text', zero = false }: { label: string; value: string; unit?: string; note?: string; tone?: KpiTone; zero?: boolean }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-12 last:border-b-0">
      <div className="flex items-baseline gap-8">
        <span className="text-ar-base text-text">{label}</span>
        <span aria-hidden="true" className="flex-1 border-b border-dotted border-line-strong" />
        {zero ? (
          // «٠» alone reads as a dot in Arabic-Indic digits.
          <span className="text-num-lg font-semibold text-text-muted">—</span>
        ) : (
          <>
            <Numeric className={cn('text-num-lg font-semibold', KPI_TONES[tone])}>{value}</Numeric>
            {unit ? <span className="text-ar-xs text-text-muted">{unit}</span> : null}
          </>
        )}
      </div>
      {note ? <span className="text-ar-sm text-text-muted">{note}</span> : null}
    </div>
  );
}

export interface BarChartBar {
  /** 0–100, as a percentage of the tallest bar. */
  height: number;
  label?: string;
}

export function BarChart({ bars }: { bars: BarChartBar[] }) {
  return (
    <div className="flex flex-1 items-end gap-10" dir="ltr">
      {bars.map((bar, index) => (
        <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-8">
          <div
            className="w-full rounded-t-xs bg-accent"
            style={{ blockSize: `${Math.max(0, Math.min(100, bar.height))}%` }}
          />
          {bar.label ? <Numeric className="text-num-xs text-text-muted">{bar.label}</Numeric> : null}
        </div>
      ))}
    </div>
  );
}

export interface ShareSegment {
  /** 0–100. */
  percent: number;
  /** A chart token: chart-1 … chart-4. */
  colorClass: string;
  label: string;
  value: string;
}

export function StackedShareBar({ segments }: { segments: ShareSegment[] }) {
  return (
    <div className="flex flex-col gap-12">
      <div className="flex h-bar overflow-hidden rounded-full" dir="ltr">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={segment.colorClass}
            style={{ inlineSize: `${segment.percent}%` }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-6">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between text-ar-base">
            <span className="flex items-center gap-10">
              <span className={cn('inline-block size-12 rounded-xs', segment.colorClass)} />
              <span className="text-text">{segment.label}</span>
            </span>
            <Numeric className="text-num-sm text-text-muted">{segment.value}</Numeric>
          </div>
        ))}
      </div>
    </div>
  );
}

function Delta({ delta }: { delta: KpiDelta }) {
  const Icon = DELTA_ICON[delta.direction];
  return (
    <span className={cn('flex items-center gap-4 text-ar-sm font-medium', DELTA_TONE[delta.direction])}>
      <Icon size={16} aria-hidden="true" />
      {delta.text}
    </span>
  );
}
