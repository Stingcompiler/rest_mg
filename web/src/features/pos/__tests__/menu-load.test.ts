/**
 * The cashier's menu (review finding F07).
 *
 * A fresh device started with a built-in demo menu, and the real one from the
 * server appeared only after a reload — next to the demo items, with categories
 * doubled. The demo menu is now a development convenience only, a full snapshot
 * from the server replaces whatever the device held, and the till rebuilds its
 * menu from storage after every pull that changed something.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import '@/db/__tests__/setup';
import { resetConnectionsForTests } from '@/db/open';
import { aCategory, anItem, freshDbName } from '@/db/__tests__/fixtures';
import { MenuRepository } from '@/db';
import { seedCategories, seedItems } from '../seed-data';
import { loadMenu, shouldSeedDemoMenu } from '../menuLoad';

beforeEach(() => resetConnectionsForTests());

describe('the demo menu', () => {
  it('is seeded in development only', () => {
    expect(shouldSeedDemoMenu({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldSeedDemoMenu({ NODE_ENV: 'production' })).toBe(false);
    expect(shouldSeedDemoMenu({ NODE_ENV: 'test' })).toBe(false);
  });

  it('can be asked for explicitly, for a demonstration build', () => {
    expect(shouldSeedDemoMenu({ NODE_ENV: 'production', NEXT_PUBLIC_DEMO_MENU: '1' })).toBe(true);
  });
});

describe('loadMenu', () => {
  it('groups the active items under their active categories', async () => {
    const name = freshDbName();
    const menu = new MenuRepository(name);
    const grills = aCategory({ id: 'cat-grills', nameAr: 'مشاوي', sort: 0 });
    const drinks = aCategory({ id: 'cat-drinks', nameAr: 'مشروبات', sort: 1 });
    await menu.applyPull(
      [grills, drinks],
      [
        anItem({ id: 'kebab', categoryId: grills.id }),
        anItem({ id: 'retired', categoryId: grills.id, isActive: false }),
        anItem({ id: 'tea', categoryId: drinks.id }),
      ],
    );

    const { categories, itemById } = await loadMenu(menu);

    expect(categories.map((category) => category.id)).toEqual(['cat-grills', 'cat-drinks']);
    expect(categories[0].items.map((item) => item.id)).toEqual(['kebab']);
    expect([...itemById.keys()].sort()).toEqual(['kebab', 'tea']);
  });

  it('shows nothing of the demo menu once the server snapshot has replaced it', async () => {
    const name = freshDbName();
    const menu = new MenuRepository(name);
    await menu.applyPull(seedCategories(), seedItems());

    const real = aCategory({ id: 'cat-real', nameAr: 'وجبات' });
    await menu.replaceWithSnapshot([real], [anItem({ id: 'real-item', categoryId: real.id })]);

    const { categories, itemById } = await loadMenu(menu);
    expect(categories.map((category) => category.id)).toEqual(['cat-real']);
    expect([...itemById.keys()]).toEqual(['real-item']);
  });
});
