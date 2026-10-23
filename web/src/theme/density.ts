/**
 * Stamp the density on the root element (batch 65). The tokens in
 * `design-tokens.css` key off `data-density`; the pre-paint script in the root
 * layout stamps the same attribute from the stored choice, so the page never
 * jumps. Safe to call only in a browser; a no-op elsewhere.
 */
import type { DensityPreference } from '@/i18n/preferences';

export function applyDensity(density: DensityPreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-density', density);
}
