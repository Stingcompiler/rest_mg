/**
 * Theme resolution, kept pure so it can be tested without a DOM.
 *
 * A preference of "system" resolves against the OS setting; "light" and "dark"
 * are explicit and win over it. Semantic tokens are defined independently per
 * mode in `design-tokens.css` — this module only decides which mode is active
 * and stamps `data-theme`, which those tokens key off.
 */
import type { ThemePreference } from '@/i18n/preferences';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemPrefersDark ? 'dark' : 'light';
}

/** Stamp the resolved mode onto the root element. Safe to call only in a browser. */
export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
}
