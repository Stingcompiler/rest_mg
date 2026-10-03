/**
 * Where the cashier's navigation goes, and what of it fits a phone.
 *
 * The rail beside a tablet holds every destination. A phone's bottom bar
 * cannot: eight cells on 375px left about 40px each, labels broke and ran into
 * one another, and the delivery badge sat on the next icon. The bar keeps the
 * destinations a sale moves between, and the rest open from "more".
 */
export type RailTarget = 'order' | 'orders' | 'deliveries' | 'menu' | 'reports' | 'sync' | 'shift';

/** Rail order, top to bottom. */
export const RAIL_TARGETS: readonly RailTarget[] = [
  'order',
  'orders',
  'deliveries',
  'menu',
  'reports',
  'sync',
  'shift',
];

/** Cells the phone bar may hold, "more" included. */
export const PHONE_BAR_MAX = 5;

const PHONE_PRIMARY: readonly RailTarget[] = ['order', 'orders', 'deliveries'];

export interface PhoneBar {
  primary: RailTarget[];
  more: RailTarget[];
  /** The current screen is one of those behind "more". */
  moreActive: boolean;
}

export function phoneBar(active: RailTarget): PhoneBar {
  const primary = RAIL_TARGETS.filter((target) => PHONE_PRIMARY.includes(target));
  const more = RAIL_TARGETS.filter((target) => !PHONE_PRIMARY.includes(target));
  return { primary, more, moreActive: more.includes(active) };
}
