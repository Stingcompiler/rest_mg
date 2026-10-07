'use client';

/**
 * The states the mockups never drew.
 *
 * Every list in the design is shown exactly full, and there is no empty,
 * loading, error, or confirmation anywhere — yet a real till hits all four. They
 * are built here, once, from the same tokens, so no screen has to invent them.
 * All text arrives as props, already translated by the caller.
 */
import { useEffect, useRef, useState } from 'react';

import { Button } from '../primitives/controls';
import { cn } from '@/lib/cn';
import { useModalDialog } from '@/lib/useModalDialog';

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
  /**
   * Ask why before confirming. The choices are offered as one-tap chips, and
   * the last one may open a text field (`otherReason`). Confirm stays disabled
   * until a reason is given: a cancelled order with no reason is one nobody
   * can explain later.
   */
  reasons?: string[];
  otherReason?: { label: string; placeholder: string };
  /** The confirm is in flight: both buttons wait. */
  pending?: boolean;
  /** Shown under the body when the confirm was refused. */
  error?: string | null;
  onConfirm(reason?: string): void;
  onCancel(): void;
}

/**
 * A modal confirmation: the guard in front of cancel, void, close and sign
 * out. Focus moves into it, Tab stays inside, and Escape or the backdrop
 * cancels. It used to render without taking focus, so its Escape handler
 * never fired (user-experience review, batch 11).
 */
export function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) return null;
  return <ConfirmPanel {...props} />;
}

function ConfirmPanel({
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  reasons,
  otherReason,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  useModalDialog(panel, onCancel);
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const otherChosen = otherReason !== undefined && choice === otherReason.label;
  const reason = otherChosen ? other.trim() : choice;
  const needsReason = reasons !== undefined;
  const ready = !pending && (!needsReason || Boolean(reason));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-24">
      <button type="button" tabIndex={-1} aria-label={cancelLabel} onClick={onCancel} className="absolute inset-0 bg-black/50" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex w-full max-w-md flex-col gap-16 rounded-lg border border-line bg-surface p-24 shadow-overlay"
      >
        <div className="flex flex-col gap-8">
          <h2 className="text-ar-lg font-semibold text-text">{title}</h2>
          {body ? <p className="text-ar-base text-text-muted">{body}</p> : null}
        </div>
        {needsReason ? (
          <div className="flex flex-col gap-10">
            <div className="flex flex-wrap gap-8">
              {[...reasons!, ...(otherReason ? [otherReason.label] : [])].map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={choice === option}
                  onClick={() => setChoice(option)}
                  className={cn(
                    'min-h-control-md rounded-md border px-14 text-ar-base outline-none',
                    choice === option ? 'border-accent bg-accent-tint text-accent' : 'border-line text-text hover:bg-surface-2',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            {otherChosen ? (
              <input
                value={other}
                onChange={(event) => setOther(event.target.value)}
                placeholder={otherReason!.placeholder}
                aria-label={otherReason!.label}
                maxLength={200}
                className="min-h-control-xl rounded-md border border-line-strong bg-surface px-14 text-ar-md text-text outline-none"
              />
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-ar-base text-danger-text">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-10">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            disabled={!ready}
            onClick={() => onConfirm(reason ?? undefined)}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface ToastProps {
  message: string;
  /** One action, e.g. "تراجع" right after a ticket was marked served. */
  actionLabel?: string;
  onAction?(): void;
  onDismiss(): void;
  durationMs?: number;
  /** Bottom by default. The till puts "ready in the kitchen" at the top, where
   *  it does not cover the pay button (batch 21). */
  placement?: 'bottom' | 'top';
}

/**
 * A short note at the bottom of the screen that something happened, with an
 * optional undo. It announces itself to screen readers and goes away on its
 * own.
 */
export function Toast({ message, actionLabel, onAction, onDismiss, durationMs = 6_000, placement = 'bottom' }: ToastProps) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const timer = setTimeout(() => dismiss.current(), durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs]);
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed inset-x-0 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-14 rounded-lg border border-line bg-text px-16 py-10 text-ar-base text-bg shadow-overlay',
        placement === 'top' ? 'top-16' : 'bottom-mobile-cart-clear md:bottom-24',
      )}
    >
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={() => {
            onAction();
            dismiss.current();
          }}
          className="min-h-control-md rounded-md px-10 font-semibold text-bg underline outline-none"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
