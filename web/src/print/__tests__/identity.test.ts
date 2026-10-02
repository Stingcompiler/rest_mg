/**
 * The receipt names the restaurant that printed it (review: every receipt said
 * «مطعم وسام الشام», a name baked into the translation file).
 *
 * The name comes from the restaurant's profile, which the till receives with
 * the menu. Before the first sync there is no profile yet, and the receipt says
 * nothing rather than someone else's name.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { buildPrintContext, setRestaurantIdentity } from '../index';

afterEach(() => setRestaurantIdentity(null));

describe('the receipt header', () => {
  it("is the restaurant's own name, in the cashier's language", () => {
    setRestaurantIdentity({ nameAr: 'مطعم النيلين', nameEn: 'Nilein', phone: '0912345678', addressAr: 'أم درمان' });
    expect(buildPrintContext('ar', 'western').labels.restaurantName).toBe('مطعم النيلين');
    expect(buildPrintContext('en', 'western').labels.restaurantName).toBe('Nilein');
  });

  it('falls back to the Arabic name when there is no English one', () => {
    setRestaurantIdentity({ nameAr: 'مطعم النيلين', nameEn: '', phone: '', addressAr: '' });
    expect(buildPrintContext('en', 'western').labels.restaurantName).toBe('مطعم النيلين');
  });

  it("never prints another restaurant's name before the profile arrives", () => {
    const header = buildPrintContext('ar', 'western').labels.restaurantName;
    expect(header).not.toContain('وسام');
  });
});
