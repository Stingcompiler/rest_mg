/**
 * When the page takes no orders (batch 36).
 *
 * The note read «الطلب من الموقع غير متاح حاليًا. يمكنك الطلب عبر واتساب أو
 * بالاتصال.» whatever the restaurant had filled in, as plain text: it promised
 * WhatsApp to a restaurant without a WhatsApp number, and the visitor still had
 * to scroll to the bottom of the page to find the buttons. And every WhatsApp
 * link went to wa.me/0912345678, a local number WhatsApp cannot open: it needs
 * the country code, 249912345678.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { orderingClosedKey, phoneHref, whatsappHref } from '../contact';
import ar from '../../../i18n/messages/ar.json';
import en from '../../../i18n/messages/en.json';

const landing = readFileSync(resolve(__dirname, '../LandingClient.tsx'), 'utf-8');

function fn(name: string): string {
  const body = new RegExp(`function ${name}\\b[\\s\\S]*?\\n\\}`).exec(landing)?.[0];
  expect(body, `function ${name}`).toBeDefined();
  return body!;
}

describe('a WhatsApp link', () => {
  it('carries the country code WhatsApp needs', () => {
    expect(whatsappHref('0912345678')).toBe('https://wa.me/249912345678');
    expect(whatsappHref('+249 91 234 5678')).toBe('https://wa.me/249912345678');
    expect(whatsappHref('00249912345678')).toBe('https://wa.me/249912345678');
    expect(whatsappHref('٠٩١٢٣٤٥٦٧٨')).toBe('https://wa.me/249912345678');
  });

  it('keeps a foreign number as it is, without the 00 or +', () => {
    expect(whatsappHref('+971 50 123 4567')).toBe('https://wa.me/971501234567');
    expect(whatsappHref('00971501234567')).toBe('https://wa.me/971501234567');
  });

  it('is no link at all without a number', () => {
    expect(whatsappHref('')).toBeNull();
    expect(whatsappHref('  ')).toBeNull();
    expect(whatsappHref('واتساب')).toBeNull();
  });

  it('is the one every WhatsApp button uses', () => {
    expect(landing).not.toMatch(/wa\.me/);
    expect(landing).toMatch(/whatsappHref\(/);
  });
});

describe('a phone link', () => {
  it('dials the number, in western digits', () => {
    expect(phoneHref('0912 345 678')).toBe('tel:0912345678');
    expect(phoneHref('٠٩١٢٣٤٥٦٧٨')).toBe('tel:0912345678');
    expect(phoneHref('+249912345678')).toBe('tel:+249912345678');
    expect(phoneHref('')).toBeNull();
  });
});

describe('the note when the page takes no orders', () => {
  it('names only the ways the restaurant actually offers', () => {
    expect(orderingClosedKey({ whatsapp: '0912345678', phone: '0912345678' })).toBe('landing.orderingClosed');
    expect(orderingClosedKey({ whatsapp: '0912345678', phone: '' })).toBe('landing.orderingClosedWhatsapp');
    expect(orderingClosedKey({ whatsapp: '', phone: '0912345678' })).toBe('landing.orderingClosedPhone');
    expect(orderingClosedKey({ whatsapp: '', phone: '' })).toBe('landing.orderingClosedNoContact');
    // A number WhatsApp cannot open is no WhatsApp.
    expect(orderingClosedKey({ whatsapp: 'x', phone: '' })).toBe('landing.orderingClosedNoContact');
  });

  it('says so in both languages, keeping the owner’s sentence', () => {
    expect(ar['landing.orderingClosed']).toBe('الطلب من الموقع غير متاح حاليًا. يمكنك الطلب عبر واتساب أو بالاتصال.');
    for (const key of ['landing.orderingClosedWhatsapp', 'landing.orderingClosedPhone', 'landing.orderingClosedNoContact']) {
      expect(ar, key).toHaveProperty([key]);
      expect(en, key).toHaveProperty([key]);
    }
    expect(ar['landing.orderingClosedWhatsapp']).not.toMatch(/الاتصال/);
    expect(ar['landing.orderingClosedPhone']).not.toMatch(/واتساب/);
    expect(ar['landing.orderingClosedNoContact']).not.toMatch(/واتساب|الاتصال/);
  });

  it('puts the buttons in the note itself, beside the menu', () => {
    const note = fn('OrderingClosedNote');
    expect(note).toMatch(/orderingClosedKey\(/);
    expect(note).toMatch(/whatsappHref\(/);
    expect(note).toMatch(/phoneHref\(/);
    expect(fn('MenuSection')).toMatch(/cart\.ordering \? null : <OrderingClosedNote contact=\{contact\} \/>/);
  });
});
