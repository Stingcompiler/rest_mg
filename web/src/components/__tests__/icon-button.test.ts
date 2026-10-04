/**
 * IconButton keeps the 44px touch floor in every variant.
 *
 * Icon-only buttons are routed through it (see styles/__tests__/token-usage),
 * so the floor lives here, once. The quiet variant drops the frame, not the
 * size. Found in the design review (batch 9): bare buttons measured 22px (back),
 * 28px (edit, delete) and 16px (remove from the customer's cart).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { IconButton } from '../primitives/controls';

const FLOOR = /\bsize-control-(stepper|lg|xl|2xl)\b/;

function classesOf(props: Record<string, unknown>): string {
  const html = renderToStaticMarkup(createElement(IconButton, { label: 'x', ...props } as never, 'i'));
  return /class="([^"]*)"/.exec(html)?.[1] ?? '';
}

describe('IconButton', () => {
  it('is at least 44px framed', () => {
    expect(classesOf({})).toMatch(FLOOR);
  });

  it('is at least 44px quiet', () => {
    const classes = classesOf({ variant: 'quiet' });
    expect(classes).toMatch(FLOOR);
    expect(classes).not.toMatch(/\bborder\b/);
  });

  it.each(['solid', 'accent'])('is at least 44px %s', (variant) => {
    // The public page's "+" and its counter (batch 19).
    expect(classesOf({ variant })).toMatch(FLOOR);
  });

  it('keeps the floor when a caller adds classes', () => {
    expect(classesOf({ variant: 'quiet', className: 'text-danger' })).toMatch(FLOOR);
  });
});
