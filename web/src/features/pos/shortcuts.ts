/**
 * Which key presses are till shortcuts (batch 64, Design Reference §9).
 *
 * Pure, so the rules are tested without a keyboard. A shortcut does only what
 * a button on the screen does; the screen decides whether that button is
 * available. Here: only which keys count, and where.
 */
export type ShortcutKey = 'F2' | 'F3' | 'F6' | 'F7' | 'F8' | 'F9' | 'Enter' | 'Escape';

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | { tagName?: string; isContentEditable?: boolean } | null;
}

/** Function keys the reference fixes across products, plus F3 and F7 for the restaurant. The browser's (F1, F4, F5, F10–F12) are never taken. */
const FUNCTION_KEYS = new Set(['F2', 'F3', 'F6', 'F7', 'F8', 'F9']);
/** Things that already do something with Enter, or take typing. */
const OWN_ENTER = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']);
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function shortcutFor(event: KeyEventLike, dialogOpen: boolean): ShortcutKey | null {
  if (dialogOpen) return null;
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = target?.tagName?.toUpperCase() ?? '';
  const editable = Boolean(target?.isContentEditable);
  if (FUNCTION_KEYS.has(event.key)) return event.key as ShortcutKey;
  if (event.key === 'Enter') return OWN_ENTER.has(tag) || editable ? null : 'Enter';
  if (event.key === 'Escape') return TYPING.has(tag) || editable ? null : 'Escape';
  return null;
}
