/**
 * What each board has already announced, and when to forget it.
 *
 * The seen-set lives in localStorage so a tablet that slept is not told twice
 * about the same order. But it belongs to the *browser*, not to the person, and
 * that distinction matters at sign-in: the day cashier goes home having seen
 * three waiting orders, the night cashier signs in on the same tablet, and
 * those three are news to them.
 *
 * So signing in clears the memory. Clearing it means writing an **empty**
 * history, not deleting the key — `detectArrivals` treats "no history at all"
 * as a starting point and stays silent, which is right when a board first
 * opens and exactly wrong here. An empty history says: everything currently
 * waiting is new, announce it.
 */

/** One key per board, so the till and the delivery queue count separately. */
export const ARRIVAL_KEYS = {
  till: 'sudanpos.alerts.seen.till',
  deliveries: 'sudanpos.alerts.seen.deliveries',
  kitchen: 'sudanpos.alerts.seen.kitchen',
} as const;

/**
 * Announce whatever is already waiting, next time each board looks.
 *
 * Called on sign-in. The badge and the tab mark appear on the first sync; the
 * sound follows as soon as the new page is touched, because a browser will not
 * play audio in a document nobody has interacted with yet.
 */
export function announceWhatIsWaiting(): void {
  if (typeof window === 'undefined') return;
  for (const key of Object.values(ARRIVAL_KEYS)) {
    try {
      window.localStorage.setItem(key, '[]');
    } catch {
      // Storage blocked or full. The worst case is the old behaviour — the
      // board stays quiet about orders that arrived before this sign-in — and
      // that is never a reason to fail a login.
    }
  }
}
