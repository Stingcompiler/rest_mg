/**
 * IconButton keeps the 44px touch floor in every variant.
 *
 * Icon-only buttons are routed through it (see styles/__tests__/token-usage),
 * so the floor lives here, once. The quiet variant drops the frame, not the
 * size. Found in the design review (batch 9): bare buttons measured 22px (back),
 * 28px (edit, delete) and 16px (remove from the customer's cart).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
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

/** The opening tag from `at`: up to the first `>` outside braces that is not an arrow. */
function openingTag(text: string, at: number): string {
  let depth = 0;
  for (let i = at; i < text.length; i += 1) {
    const char = text[i];
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0 && text[i - 1] !== '=') return text.slice(at, i + 1);
  }
  return text.slice(at);
}

describe('a round IconButton', () => {
  // The "+" and "−" on the public page asked for `rounded-full` through
  // className, but the button's own `rounded-md` comes later in the
  // stylesheet and won: the hover fill was a square breaking out of the
  // round stepper (owner's screenshot, batch 29). The shape is a prop now.
  it('is round through its shape, with no square corner left in', () => {
    const classes = classesOf({ shape: 'circle' });
    expect(classes).toMatch(/\brounded-full\b/);
    expect(classes).not.toMatch(/\brounded-md\b/);
  });

  it('keeps its square corners by default', () => {
    expect(classesOf({})).toMatch(/\brounded-md\b/);
  });

  it('is never made round through className, where the corner would lose', () => {
    const SRC = resolve(__dirname, '../..');
    const files = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === '__tests__' ? [] : walk(path);
        return path.endsWith('.tsx') ? [path] : [];
      });
    })(SRC);
    const offenders: string[] = [];
    for (const path of files) {
      const text = readFileSync(path, 'utf-8');
      for (let at = text.indexOf('<IconButton'); at !== -1; at = text.indexOf('<IconButton', at + 1)) {
        if (/className="[^"]*\brounded-full\b/.test(openingTag(text, at))) offenders.push(relative(SRC, path));
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the public page stepper', () => {
  it('holds its round buttons inside its border', () => {
    // The shared QtyPill since batch 30.
    const flow = readFileSync(resolve(__dirname, '../../features/landing/OrderFlow.tsx'), 'utf-8');
    expect(flow).toMatch(/<div className="flex flex-none items-center gap-2 rounded-full border border-accent p-2">/);
  });
});
