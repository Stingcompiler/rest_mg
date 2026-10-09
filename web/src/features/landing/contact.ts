/**
 * The restaurant's own ways to take an order, as links (batch 36).
 *
 * The profile keeps numbers as the restaurant types them, usually the local
 * form ("0912345678"). A call dials that as it is; WhatsApp does not: wa.me
 * needs the country code and nothing else, so wa.me/0912345678 opened an error.
 */
import { westernDigits } from '@/lib/digits';
import { normalizeSudanPhone } from '@/lib/phone';

export interface Contact {
  whatsapp: string;
  phone: string;
}

/** wa.me with the international number, or null when there is none to open. */
export function whatsappHref(raw: string): string | null {
  const local = normalizeSudanPhone(raw);
  if (local) return `https://wa.me/249${local.slice(1)}`;
  const compact = westernDigits(raw).replace(/[\s\-().]/g, '');
  const international = /^(?:\+|00)(\d{8,15})$/.exec(compact);
  return international ? `https://wa.me/${international[1]}` : null;
}

/** A tel: link in western digits, or null without a number. */
export function phoneHref(raw: string): string | null {
  const compact = westernDigits(raw).replace(/[\s\-().]/g, '');
  return /^\+?\d{6,15}$/.test(compact) ? `tel:${compact}` : null;
}

export type OrderingClosedKey =
  | 'landing.orderingClosed'
  | 'landing.orderingClosedWhatsapp'
  | 'landing.orderingClosedPhone'
  | 'landing.orderingClosedNoContact';

/** The note names only the ways the restaurant actually offers. */
export function orderingClosedKey(contact: Contact): OrderingClosedKey {
  const whatsapp = whatsappHref(contact.whatsapp) !== null;
  const phone = phoneHref(contact.phone) !== null;
  if (whatsapp && phone) return 'landing.orderingClosed';
  if (whatsapp) return 'landing.orderingClosedWhatsapp';
  if (phone) return 'landing.orderingClosedPhone';
  return 'landing.orderingClosedNoContact';
}
