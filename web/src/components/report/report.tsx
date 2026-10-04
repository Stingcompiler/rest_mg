'use client';

/**
 * Report components: KpiCard, BarChart, StackedShareBar.
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
}

const DELTA_TONE: Record<KpiDelta['direction'], string> = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-text-muted',
};

const DELTA_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

export function KpiCard({ label, value, sub, tone = 'text', delta }: KpiCardProps) {
  return (
    // A gold hairline on top: the manager's figures carry the same mark as the
    // public page's titles (batch 13).
    <div className="flex flex-col gap-8 rounded-md border border-line border-t-strong border-t-gold-soft bg-surface p-18 shadow-card">
      <span className="text-ar-base text-text-muted">{label}</span>
      <Numeric className={cn('text-num-4xl font-semibold', KPI_TONES[tone])}>{value}</Numeric>
      {delta ? <Delta delta={delta} /> : null}
      {sub ? <span className="text-ar-sm text-text-muted">{sub}</span> : null}
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
      <div className="flex h-bar overflow-hidden rounded-pill" dir="ltr">
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
