/**
 * The bootstrap menu.
 *
 * A device with no menu yet needs one before its first sync. Normally that
 * arrives from the first pull (phase 10); until then this is the offline seed,
 * mirroring the mockup and the Django seed so the screens have real data to work
 * with. It writes only if the menu store is empty, and a later pull supersedes
 * it.
 */
import type { CategoryRecord, MenuItemRecord } from '@/db';

const iso = '2026-08-01T00:00:00.000Z';

interface SeedItem {
  id: string;
  nameAr: string;
  nameEn: string;
  priceMinor: string;
  descriptionAr?: string;
  available?: boolean;
}

interface SeedCategory {
  /** A real UUID: these ids ride on records that reach the server, and the
   *  server requires UUIDs — a readable slug is rejected at the boundary. */
  id: string;
  nameAr: string;
  nameEn: string;
  items: SeedItem[];
}

const SEED: SeedCategory[] = [
  {
    id: '7924a6f7-1043-5f4e-8a8f-287d01b626ef',
    nameAr: 'مشاوي',
    nameEn: 'Grills',
    items: [
      { id: '8d7314d4-1403-5af5-98c5-ea2f24becc48', nameAr: 'شاورما لحم', nameEn: 'Beef shawarma', priceMinor: '12500', descriptionAr: 'عادي · حار' },
      { id: '9c1ddc19-7e8d-5896-b2a8-b3f98f9db1c2', nameAr: 'شاورما دجاج', nameEn: 'Chicken shawarma', priceMinor: '10000', descriptionAr: 'عادي · حار' },
      { id: 'a6003bcd-f6d8-5a72-a230-5361c72cb8b2', nameAr: 'كبدة إسكندراني', nameEn: 'Alexandrian liver', priceMinor: '15000', descriptionAr: 'حارة أو عادية' },
      { id: '1f51325d-1ccc-5d42-acce-dbcd47ad28fb', nameAr: 'كباب لحم', nameEn: 'Beef kebab', priceMinor: '22000', descriptionAr: 'مع أرز أو خبز' },
      { id: 'bd650780-fb78-5751-8b2a-af63b292c42d', nameAr: 'دجاج مشوي نصف', nameEn: 'Half grilled chicken', priceMinor: '18000', descriptionAr: 'على الفحم' },
      { id: '315f658c-21c6-5feb-bad0-9fcbf1350871', nameAr: 'سمك مقلي', nameEn: 'Fried fish', priceMinor: '25000', descriptionAr: 'نفد اليوم', available: false },
    ],
  },
  {
    id: '4d61c992-51ed-5320-b754-e6d3759175af',
    nameAr: 'وجبات',
    nameEn: 'Meals',
    items: [
      { id: '92620a94-eb1d-5719-a201-e430e193fa6f', nameAr: 'أرز باللحم', nameEn: 'Rice with lamb', priceMinor: '20000', descriptionAr: 'طبق كامل' },
      { id: '3c7fcc6b-dad5-5565-8450-95591ea38e59', nameAr: 'فول بالزيت', nameEn: 'Ful with oil', priceMinor: '6000', descriptionAr: 'بالزيت أو بالجبنة' },
      { id: 'c7b5f9e9-e4d3-5de1-aea4-bff8f7cc9c57', nameAr: 'طعمية', nameEn: 'Taamiya', priceMinor: '4500', descriptionAr: '٥ حبات' },
      { id: '6632c3af-b539-521c-a9de-2b7e162036b2', nameAr: 'سلطة خضراء', nameEn: 'Green salad', priceMinor: '5000' },
    ],
  },
  {
    id: '9d671e3e-012b-5e14-a773-15b36a92ae35',
    nameAr: 'مشروبات',
    nameEn: 'Drinks',
    items: [
      { id: '1deed057-754f-53d9-a243-39c128647300', nameAr: 'عصير مانجو', nameEn: 'Mango juice', priceMinor: '8000', descriptionAr: 'طازج' },
      { id: 'ba2adaf9-23b5-5b3b-866c-6128fa2fb9db', nameAr: 'شاي', nameEn: 'Tea', priceMinor: '2000', descriptionAr: 'بالحليب أو سادة' },
    ],
  },
];

export function seedCategories(): CategoryRecord[] {
  return SEED.map((category, index) => ({
    id: category.id,
    nameAr: category.nameAr,
    nameEn: category.nameEn,
    sort: index,
    isActive: true,
    updatedAt: iso,
    syncedAt: null,
  }));
}

export function seedItems(): MenuItemRecord[] {
  return SEED.flatMap((category) =>
    category.items.map((item, index) => ({
      id: item.id,
      categoryId: category.id,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      descriptionAr: item.descriptionAr ?? '',
      descriptionEn: '',
      priceMinor: item.priceMinor,
      isAvailable: item.available ?? true,
      isActive: true,
      sort: index,
      updatedAt: iso,
      syncedAt: null,
    })),
  );
}

/** The 5 note denominations counted at shift close (٥٠٠٠ · ٢٠٠٠ · ١٠٠٠ · ٥٠٠ · معدن). */
/**
 * The notes a drawer is counted in.
 *
 * `key` is the stable identity the counts are stored against — it must not
 * change when the display language or numerals do, or a half-counted drawer
 * would lose its rows. The face value is rendered from `denominationMinor`
 * through the numerals setting, and the coin row through the catalogue, so both
 * follow the toggles instead of being frozen in Arabic-Indic.
 */
export const DENOMINATIONS: { denominationMinor: bigint | null; key: string }[] = [
  { denominationMinor: 5_000n, key: '5000' },
  { denominationMinor: 2_000n, key: '2000' },
  { denominationMinor: 1_000n, key: '1000' },
  { denominationMinor: 500n, key: '500' },
  // 200 and 100 are in every drawer as change. Without a row of their own they
  // had to be lumped into the free "coins" amount, which is how a denomination
  // count stops being a count and becomes a guess.
  { denominationMinor: 200n, key: '200' },
  { denominationMinor: 100n, key: '100' },
  { denominationMinor: null, key: 'coins' },
];
