'use client';

/**
 * The states the mockups never drew.
 *
 * Every list in the design is shown exactly full, and there is no empty,
 * loading, error, or confirmation anywhere — yet a real till hits all four. They
 * are built here, once, from the same tokens, so no screen has to invent them.
 * All text arrives as props, already translated by the caller.
 */
import { Button } from '../primitives/controls';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}

export function EmptyState({ title, hint, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-8 p-24 text-center">
      {icon ? <div className="text-text-disabled">{icon}</div> : null}
      <p className="text-ar-lg font-semibold text-text">{title}</p>
      {hint ? <p className="text-ar-base text-text-muted">{hint}</p> : null}
    </div>
  );
}

/** A shimmering placeholder block, sized by the caller via className. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} />;
}

export interface LoadingListProps {
  rows?: number;
  rowClassName?: string;
}

export function LoadingList({ rows = 4, rowClassName }: LoadingListProps) {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className={cn('h-control-2xl', rowClassName)} />
      ))}
    </div>
  );
}

export interface ErrorStateProps {
  title: string;
  detail?: string;
  retryLabel?: string;
  onRetry?(): void;
  icon?: React.ReactNode;
}

export function ErrorState({ title, detail, retryLabel, onRetry, icon }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-12 rounded-lg border border-danger bg-danger-tint p-24 text-center">
      {icon ? <div className="text-danger">{icon}</div> : null}
      <p className="text-ar-lg font-semibold text-danger">{title}</p>
      {detail ? <p className="text-ar-base text-danger-text">{detail}</p> : null}
      {retryLabel && onRetry ? (
        <Button variant="danger" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: 'danger' | 'accent';
  onConfirm(): void;
  onCancel(): void;
}

/**
 * A modal confirmation — the guard in front of cancel, void, and close. Renders
 * an overlay with a centred panel; the design has no dialog, so this is built
 * from the token set. Escape and a backdrop click both cancel.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-24"
      onClick={onCancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onCancel();
      }}
    >
      <div
        className="flex w-full max-w-md flex-col gap-16 rounded-lg border border-line bg-surface p-24"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-8">
          <h2 className="text-ar-lg font-semibold text-text">{title}</h2>
          {body ? <p className="text-ar-base text-text-muted">{body}</p> : null}
        </div>
        <div className="flex justify-end gap-10">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
