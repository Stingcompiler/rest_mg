/**
 * Scrolling that respects "reduce motion" (batch 18).
 *
 * `scrollIntoView({ behavior: 'smooth' })` glides even when the visitor asked
 * the system for less motion: an explicit option wins over the CSS rule. The
 * page asks this helper instead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prefersReducedMotion, scrollBehavior } from '@/lib/motion';

function stubMedia(reduce: boolean | null) {
  vi.stubGlobal(
    'window',
    reduce === null
      ? {}
      : { matchMedia: (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' && reduce }) },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('scrollBehavior', () => {
  it('glides for a visitor who did not ask otherwise', () => {
    stubMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('jumps for a visitor who asked for less motion', () => {
    stubMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe('auto');
  });

  it('jumps where it cannot ask (no matchMedia)', () => {
    stubMedia(null);
    expect(scrollBehavior()).toBe('auto');
  });
});
