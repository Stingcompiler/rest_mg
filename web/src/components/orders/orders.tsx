'use client';

/**
 * OrderCard — one open order on the 3-column open-orders grid.
 *
 * Carries a sync badge (مُزامن / غير مُزامن) and an age bar whose colour
 * escalates success → warning → danger as the order gets older. The resume and
 * cancel actions are passed in so the card stays presentational.
 */
import { cn } from '@/lib/cn';
import { Badge, Numeric, ProgressBar } from '../primitives/indicators';

type AgeTone = 'success' | 'warning' | 'danger';

export interface OrderCardProps {
  id: string;
  typeLabel: string;
  total: string;
  items: string;
  age: string;
  agePercent: number;
  ageTone: AgeTone;
  synced: boolean;
  syncedLabel: string;
  unsyncedLabel: string;
  resumeLabel: string;
  cancelLabel: string;
  onResume?(): void;
  onCancel?(): void;
}

export function OrderCard({
  id,
  typeLabel,
  total,
  items,
  age,
  agePercent,
  ageTone,
  synced,
  syncedLabel,
  unsyncedLabel,
  resumeLabel,
  cancelLabel,
  onResume,
  onCancel,
}: OrderCardProps) {
  return (
    <div className="flex flex-col gap-12 rounded-lg border border-line bg-surface p-16 shadow-card">
      <div className="flex items-center justify-between">
        <Numeric className="text-num-lg font-semibold text-text">{id}</Numeric>
        <Badge label={synced ? syncedLabel : unsyncedLabel} tone={synced ? 'success' : 'warning'} />
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-ar-base font-medium text-text-muted">{typeLabel}</span>
        <Numeric className="text-num-xl font-semibold text-text">{total}</Numeric>
      </div>
      <p className="line-clamp-2 text-ar-base text-text-muted">{items}</p>
      <div className="flex flex-col gap-6">
        <ProgressBar percent={agePercent} tone={ageTone} size="thin" />
        <span
          className={cn(
            'text-ar-sm',
            ageTone === 'success' && 'text-success',
            ageTone === 'warning' && 'text-warning',
            ageTone === 'danger' && 'text-danger',
          )}
        >
          {age}
        </span>
      </div>
      <div className="flex gap-8">
        <button
          type="button"
          onClick={onResume}
          className="inline-flex min-h-control-lg flex-1 items-center justify-center rounded-md bg-accent text-ar-md font-semibold text-text-on-accent outline-none"
        >
          {resumeLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-control-lg w-cancel-btn items-center justify-center rounded-md border border-danger text-ar-md font-medium text-danger outline-none"
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
