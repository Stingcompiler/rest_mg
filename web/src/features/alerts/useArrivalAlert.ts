'use client';

/**
 * Turning "a new row appeared" into something a busy person actually notices.
 *
 * Both screens that need this already poll on a timer; this hook watches the
 * ids they get back and fires once per genuinely new one. It deliberately owns
 * no fetching of its own — the caller keeps its own polling, and this only ever
 * looks at the result.
 *
 * The count it returns is "unseen", not "new since the last poll": a cashier
 * away from the counter for ten minutes comes back to `3`, not to whatever
 * happened to land in the final fifteen seconds.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { detectArrivals, parseSeen } from '@/lib/arrivals';
import { chime, clearTitleMark, markTitle, primeAudio, showNotice } from '@/lib/chime';

const MUTED_KEY = 'sudanpos.alerts.muted';

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A tablet with storage full or blocked still has to take orders. Losing
    // the record of what was seen costs one duplicate chime, nothing more.
  }
}

export interface ArrivalAlertOptions {
  /** Ids currently on screen, in list order. */
  ids: readonly string[];
  /** Where the seen-set is remembered. One key per board. */
  storageKey: string;
  /** False while loading, so an empty first render is not mistaken for a list. */
  ready: boolean;
  /** Shown in the browser notice when the tab is in the background. */
  noticeTitle: string;
  /** Given the number that arrived, the notice's body. */
  noticeBody: (count: number) => string;
}

export interface ArrivalAlert {
  /** How many have arrived and not yet been acknowledged. */
  unseen: number;
  /** Clear the count and the tab mark — the person has looked. */
  acknowledge: () => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export function useArrivalAlert({
  ids,
  storageKey,
  ready,
  noticeTitle,
  noticeBody,
}: ArrivalAlertOptions): ArrivalAlert {
  const [unseen, setUnseen] = useState(0);
  const [muted, setMutedState] = useState(false);

  // Read the preference once on the client. Doing it in state initialisation
  // would run during the static export's render, where there is no window.
  useEffect(() => {
    setMutedState(readStorage(MUTED_KEY) === 'true');
  }, []);

  const setMuted = useCallback((next: boolean) => {
    setMutedState(next);
    writeStorage(MUTED_KEY, String(next));
  }, []);

  // The alert must not re-fire because a parent re-rendered, so the effect
  // depends on the ids themselves rather than on the array's identity.
  const key = ids.join(',');
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const bodyRef = useRef(noticeBody);
  bodyRef.current = noticeBody;

  useEffect(() => {
    if (!ready) return;
    const current = key ? key.split(',') : [];
    const { arrived, seen, firstLook } = detectArrivals(current, parseSeen(readStorage(storageKey)));
    writeStorage(storageKey, JSON.stringify(seen));
    if (firstLook || arrived.length === 0) return;

    setUnseen((count) => count + arrived.length);
    if (!mutedRef.current) chime();
    showNotice(noticeTitle, bodyRef.current(arrived.length));
  }, [key, ready, storageKey, noticeTitle]);

  // The tab mark follows the count, and both clear when the person looks.
  useEffect(() => {
    markTitle(unseen);
    return () => clearTitleMark();
  }, [unseen]);

  const acknowledge = useCallback(() => {
    setUnseen(0);
    clearTitleMark();
  }, []);

  // A browser will not make a sound until the person has touched the page. On a
  // till that is every tap on the menu, so listen once for the first of them
  // rather than making somebody find a button they had no reason to look for.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const wake = () => primeAudio();
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Coming back to the tab *is* looking at it.
    const onFocus = () => acknowledge();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [acknowledge]);

  return { unseen, acknowledge, muted, setMuted };
}
