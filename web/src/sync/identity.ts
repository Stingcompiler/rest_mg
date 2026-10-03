/**
 * The restaurant's identity, as the till keeps it: the name, phone and address
 * a receipt prints. It arrives with the menu (the pull's `profile`) and is
 * stored on the device, so a receipt names the restaurant with the line down.
 */
export const RESTAURANT_IDENTITY_KEY = 'restaurantIdentity';

export interface RestaurantIdentity {
  nameAr: string;
  nameEn: string;
  phone: string;
  addressAr: string;
}

export function identityFromProfile(profile: unknown): RestaurantIdentity | null {
  if (!profile || typeof profile !== 'object') return null;
  const row = profile as Record<string, unknown>;
  const text = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : '');
  if (!text('name_ar')) return null;
  return { nameAr: text('name_ar'), nameEn: text('name_en'), phone: text('phone'), addressAr: text('address_ar') };
}
