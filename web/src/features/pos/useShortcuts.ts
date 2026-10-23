'use client';

/**
 * Wire a till screen's keyboard shortcuts (batch 64). The caller passes what
 * each key does *now*; a key not in the map does nothing and is left to the
 * browser. The latest map is read on every press, so a closure over stale
 * state is not a risk.
 */
import { useEffect, useRef } from 'react';

import { shortcutFor, type ShortcutKey } from './shortcuts';

export type ShortcutMap = Partial<Record<ShortcutKey, () => void>>;

export function useShortcuts(bindings: ShortcutMap) {
  const latest = useRef(bindings);
  latest.current = bindings;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // A dialog has its own keys; any of ours would act behind it.
      const dialogOpen = document.querySelector('[role="dialog"]') !== null;
      const key = shortcutFor(event, dialogOpen);
      if (!key) return;
      const action = latest.current[key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** F2: the search field, found by its mark. */
export function focusSearch() {
  document.querySelector<HTMLInputElement>('[data-shortcut="search"]')?.focus();
}
