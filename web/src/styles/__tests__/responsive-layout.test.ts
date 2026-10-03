/**
 * Card grids follow the space they sit in, and wide screens keep a measure.
 *
 * The till's menu grid counted columns from the *viewport*: four from 1024px
 * up. At 1024 the menu area is what is left beside the rail and the cart —
 * about 500px — so a tablet got four 108px cards and clipped the dish names,
 * while a 1920px screen got four 332×112 strips. Columns now come from the
 * area itself, with a floor on the card and a ceiling on the count. Tickets
 * (open orders, kitchen) do the same. The manager's pages had no measure at
 * all and ran 1684px wide. Found in the design review (batch 9).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import config from '../../../tailwind.config';

const SRC = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const tokens = read('styles/design-tokens.css');

const columns = (config.theme?.extend?.gridTemplateColumns ?? {}) as Record<string, string>;

describe('card grids', () => {
  it.each(['menu', 'tickets'])('the %s grid fills its container, with a floor and a ceiling', (name) => {
    const template = columns[name];
    expect(template, `gridTemplateColumns.${name}`).toBeDefined();
    expect(template).toMatch(/auto-fill/);
    // The ceiling: a column is never narrower than the container split N ways.
    expect(template).toMatch(/max\(/);
  });

  it('the till menu uses it instead of viewport breakpoints', () => {
    const screen = read('features/pos/OrderEntryScreen.tsx');
    expect(screen).toMatch(/\bgrid-cols-menu\b/);
    expect(screen).not.toMatch(/lg:grid-cols-4/);
  });

  it.each(['features/pos/OpenOrdersScreen.tsx', 'features/kitchen/KitchenScreen.tsx'])(
    '%s lays tickets out by their own width',
    (path) => {
      expect(read(path)).toMatch(/\bgrid-cols-tickets\b/);
    },
  );
});

describe('wide screens', () => {
  it("keep the manager's pages to a readable measure", () => {
    // The pages render inside a wrapper that carries a max width.
    expect(read('features/manager/ManagerShell.tsx')).toMatch(
      /<main[^>]*>[\s\S]{0,400}?<div className="[^"]*\bmax-w-[^"]*">\{children\}<\/div>/,
    );
  });
});

describe('cards', () => {
  it('stand off the page in the light theme too', () => {
    // A card and the page differ by 1.1:1 and the border by 1.5:1; with no
    // shadow at all, a card on a tablet in daylight melts into the page.
    const light = /:root,\s*\[data-theme='light'\]\s*\{([\s\S]*?)\}/.exec(tokens)?.[1] ?? '';
    expect(light).toMatch(/--shadow-card:/);
    expect(light).not.toMatch(/--shadow-card:\s*none/);
  });
});
