/**
 * The number printed on a till's bill.
 *
 * Every till used to count from 1048 on its own, so two tablets printed the
 * same numbers on the same day, and a till's number could equal a website
 * order's. Each device now draws a two-character code once and keeps it, and
 * its numbers read "K7-1048": unique across tills, and never a plain number
 * like the website's. The alphabet leaves out 0/O and 1/I, which are easily
 * misread on a ticket or over the phone.
 */
import type { SettingsRepository } from '@/db';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_KEY = 'deviceCode';
const SEQUENCE_KEY = 'orderSeq';
const FIRST_NUMBER = 1048;

type Settings = Pick<SettingsRepository, 'get' | 'set'>;

async function deviceCode(settings: Settings): Promise<string> {
  const held = await settings.get<string>(CODE_KEY);
  if (held) return held;
  const random = crypto.getRandomValues(new Uint8Array(2));
  const code = Array.from(random, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
  await settings.set(CODE_KEY, code);
  return code;
}

export async function nextOrderNumber(settings: Settings): Promise<string> {
  const code = await deviceCode(settings);
  const current = (await settings.get<number>(SEQUENCE_KEY)) ?? FIRST_NUMBER;
  await settings.set(SEQUENCE_KEY, current + 1);
  return `${code}-${current}`;
}
