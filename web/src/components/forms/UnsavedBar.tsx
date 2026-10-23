'use client';

/**
 * «Unsaved changes — save / discard» (batch 62, Design Reference §15.4).
 *
 * Sticks to the top of an edit page while it holds changes the server does not
 * have. `useLeaveGuard` is its other half: closing the tab with changes asks
 * first.
 */
import { useEffect } from 'react';

import { Button } from '../primitives/controls';

export interface UnsavedBarProps {
  message: string;
  saveLabel: string;
  discardLabel: string;
  onSave(): void;
  onDiscard(): void;
  saving?: boolean;
  /** Something stops the save (a field to fix): the button waits, the words stay. */
  saveDisabled?: boolean;
}

export function UnsavedBar({ message, saveLabel, discardLabel, onSave, onDiscard, saving, saveDisabled }: UnsavedBarProps) {
  return (
    <div
      role="region"
      aria-label={message}
      className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-12 border-b border-warning bg-warning-tint px-16 py-10"
    >
      <span className="text-ar-base font-medium text-warning">{message}</span>
      <div className="flex items-center gap-8">
        <Button variant="secondary" onClick={onDiscard} disabled={saving}>
          {discardLabel}
        </Button>
        <Button variant="primary" onClick={onSave} disabled={saving || saveDisabled}>
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}

/** Ask before the tab is closed or reloaded while there are unsaved changes. */
export function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [dirty]);
}
