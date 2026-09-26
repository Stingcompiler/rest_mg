/**
 * Noticing that something new turned up.
 *
 * Both alerts in this system are the same problem wearing different clothes: a
 * list is polled on a timer, and the question is which rows were not there last
 * time. A customer's delivery order appearing for the cashier, a ticket
 * appearing for the kitchen — same arithmetic, so it lives here once, free of
 * any screen or browser API and therefore testable on its own.
 *
 * Two rules matter more than they look:
 *
 *   **The first look never announces.** Opening the board must not chime for
 *   every ticket already on it. With no history to compare against there is no
 *   news, only a starting point.
 *
 *   **What was seen is remembered across reloads.** A cook whose tablet went to
 *   sleep should be told about the order that came in meanwhile — and told once,
 *   not once per poll — so the record of what has been seen outlives the page.
 */

/**
 * How many ids to remember. Comfortably more than a busy service, and bounded
 * so a till left running for a month does not grow a list without end.
 */
export const SEEN_LIMIT = 300;

export interface ArrivalResult {
  /** Ids present now that were not in the remembered set, in list order. */
  arrived: string[];
  /** The set to remember next time. Capped, most recent first. */
  seen: string[];
  /** True when there was no history, so nothing should be announced. */
  firstLook: boolean;
}

/**
 * Compare what is on screen now against what has been seen before.
 *
 * `seen` is null the very first time — no history at all — which is different
 * from an empty array (history exists and was empty; everything now is new).
 */
export function detectArrivals(
  current: readonly string[],
  seen: readonly string[] | null,
): ArrivalResult {
  if (seen === null) {
    return { arrived: [], seen: capped(current), firstLook: true };
  }
  const known = new Set(seen);
  return {
    arrived: current.filter((id) => !known.has(id)),
    // Current ids first: they are the most recent, so they are the ones that
    // survive the cap. Ids that have left the list stay remembered for a while,
    // which is what stops a paged list re-announcing page 1 on the way back.
    seen: capped([...current, ...seen]),
    firstLook: false,
  };
}

function capped(ids: readonly string[]): string[] {
  const out: string[] = [];
  const taken = new Set<string>();
  for (const id of ids) {
    if (taken.has(id)) continue;
    taken.add(id);
    out.push(id);
    if (out.length >= SEEN_LIMIT) break;
  }
  return out;
}

/**
 * Read a remembered set back, tolerating anything that is not one.
 *
 * The value comes from localStorage, which any extension or a half-written
 * write can leave as rubbish. Rubbish must read as "no history" — the screen
 * then goes quiet for one cycle — rather than throwing on a kitchen board
 * mid-service.
 */
export function parseSeen(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return null;
    return value.filter((id): id is string => typeof id === 'string');
  } catch {
    return null;
  }
}
