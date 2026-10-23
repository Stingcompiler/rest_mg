/**
 * Keyboard shortcuts at the till (batch 64, Design Reference §9).
 *
 * Added for a cashier who has a real keyboard; nothing changes for touch. The
 * keys are the reference's, fixed across products: F2 search, F6 discount, F8
 * hold, F9 recall, Enter pay, Esc back; the restaurant adds F3 (send to the
 * kitchen) and F7 (a note). A key does only what its button does, and does
 * nothing while a dialog is open or a field is being typed in.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { shortcutFor, type KeyEventLike } from '../shortcuts';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');

const press = (key: string, extra: Partial<KeyEventLike> = {}, tag = 'BODY', dialogOpen = false) =>
  shortcutFor({ key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, target: { tagName: tag }, ...extra }, dialogOpen);

describe('which key is a shortcut', () => {
  it('takes the function keys the reference fixes, from anywhere, even while typing in a field', () => {
    for (const key of ['F2', 'F3', 'F6', 'F7', 'F8', 'F9']) {
      expect(press(key)).toBe(key);
      expect(press(key, {}, 'INPUT')).toBe(key);
    }
  });

  it('leaves the browser’s own keys alone: reload, full screen, developer tools', () => {
    for (const key of ['F1', 'F4', 'F5', 'F10', 'F11', 'F12']) expect(press(key)).toBeNull();
  });

  it('takes Enter only when it would not press the thing that has focus', () => {
    expect(press('Enter')).toBe('Enter');
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']) expect(press('Enter', {}, tag)).toBeNull();
  });

  it('takes Escape only outside a field, where it has its own meaning', () => {
    expect(press('Escape')).toBe('Escape');
    expect(press('Escape', {}, 'INPUT')).toBeNull();
  });

  it('does nothing with a modifier held: those are the browser’s and the system’s', () => {
    for (const mod of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      expect(press('F2', { [mod]: true })).toBeNull();
      expect(press('Enter', { [mod]: true })).toBeNull();
    }
  });

  it('does nothing while a dialog is open: it has its own keys', () => {
    expect(press('F6', {}, 'BODY', true)).toBeNull();
    expect(press('Enter', {}, 'BODY', true)).toBeNull();
  });

  it('ignores every other key', () => {
    expect(press('a')).toBeNull();
    expect(press(' ')).toBeNull();
  });
});

describe('the till’s screens', () => {
  const entry = read('features/pos/OrderEntryScreen.tsx');
  const payment = read('features/pos/PaymentScreen.tsx');

  it('the order screen binds search, send, discount, note, hold, open orders and pay', () => {
    expect(entry).toMatch(/useShortcuts\(/);
    for (const key of ['F2', 'F3', 'F6', 'F7', 'F8', 'F9', 'Enter']) expect(entry, key).toMatch(new RegExp(`\\b${key}\\b`));
    // Search is found by its mark, so no ref has to travel through the header.
    expect(entry).toMatch(/data-shortcut="search"/);
  });

  it('a key does only what its button does: not with an empty cart, not when the button is disabled', () => {
    expect(entry).toMatch(/hasLines/);
    expect(entry).toMatch(/kitchenChanges > 0/);
  });

  it('the payment screen takes its one main action on Enter, and goes back on Escape', () => {
    expect(payment).toMatch(/useShortcuts\(/);
    expect(payment).toMatch(/Enter:/);
    expect(payment).toMatch(/Escape:/);
  });

  it('a key is shown on its button only where there is a keyboard', () => {
    const indicators = read('components/primitives/indicators.tsx');
    expect(indicators).toMatch(/export function KeyHint/);
    expect(indicators).toMatch(/hidden fine:inline-flex/);
    expect(read('../tailwind.config.ts')).toMatch(/fine:\s*\{\s*raw:\s*'\(hover: hover\) and \(pointer: fine\)'/);
    expect(read('components/cart/cart.tsx')).toMatch(/shortcut\?:/);
  });
});
