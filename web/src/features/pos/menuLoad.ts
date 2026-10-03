/**
 * The cashier's menu, read from the device's storage (review finding F07).
 *
 * The till never fetches; the sync loop writes the menu into IndexedDB and the
 * till rebuilds its in-memory menu from there — at start-up and again after
 * every pull that changed something, so a new price or a sold-out item shows
 * without a reload. Bills already rung up keep the price on their lines.
 *
 * The demo menu that used to be written on a fresh device is a development
 * convenience only: in production a fresh till waits for the server's menu
 * rather than selling dishes the restaurant does not have.
 */
import { hydrateMenuItem } from '@/db/mappers';
import type { MenuRepository } from '@/db';
import type { MenuItem } from '@/domain';

export interface PosMenuCategory {
  id: string;
  nameAr: string;
  nameEn: string;
  items: MenuItem[];
}

export interface PosMenu {
  categories: PosMenuCategory[];
  itemById: Map<string, MenuItem>;
}

/**
 * Whether a device with no menu gets the demo one. Pass the variables
 * literally (`process.env.NODE_ENV`, …): Next inlines them only when written
 * out in full.
 */
export function shouldSeedDemoMenu(env: { NODE_ENV?: string; NEXT_PUBLIC_DEMO_MENU?: string }): boolean {
  return env.NODE_ENV === 'development' || env.NEXT_PUBLIC_DEMO_MENU === '1';
}

export async function loadMenu(menu: Pick<MenuRepository, 'listCategories' | 'listItemsByCategory'>): Promise<PosMenu> {
  const categories: PosMenuCategory[] = [];
  const itemById = new Map<string, MenuItem>();
  for (const category of await menu.listCategories()) {
    const items = (await menu.listItemsByCategory(category.id)).map((record) => {
      const item = hydrateMenuItem(record);
      itemById.set(item.id, item);
      return item;
    });
    categories.push({ id: category.id, nameAr: category.nameAr, nameEn: category.nameEn, items });
  }
  return { categories, itemById };
}
