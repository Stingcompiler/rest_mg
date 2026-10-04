/**
 * Motion that respects the visitor's system setting (batch 18).
 *
 * The CSS rule in globals.css stops transitions and animations under
 * `prefers-reduced-motion: reduce`, but an explicit
 * `scrollIntoView({ behavior: 'smooth' })` overrides it. Scrolling asks here.
 */
const REDUCE = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(REDUCE).matches;
}

/** `smooth`, unless the visitor asked for less motion or we cannot tell. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}
