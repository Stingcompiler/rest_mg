/**
 * Stopping a customer or a staff member asks first (batch 58).
 *
 * The review of 15 October: both buttons acted at once. Since batch 56 they are
 * quiet text buttons, which is right for a risky act beside the main one, and
 * also easy to press by mistake. A one-line confirmation, in the same dialog
 * the till uses before it cancels or voids, names the person and says what
 * stopping does and what it does not.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import ar from '@/i18n/messages/ar.json';
import en from '@/i18n/messages/en.json';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const customers = read('features/manager/CustomersScreen.tsx');
const staff = read('features/manager/StaffScreen.tsx');

describe('stopping a customer', () => {
  it('asks first, naming them, and acts only on the confirmation', () => {
    expect(customers).toMatch(/<Button variant="quietDanger" onClick=\{\(\) => setConfirming\(true\)\}/);
    expect(customers).toMatch(/<ConfirmDialog[\s\S]*?title=\{i18n\.t\('customers\.retireTitle', \{ name: person\.name \}\)\}/);
    expect(customers).toMatch(/onConfirm=\{\(\) => retire\.mutate\(person\.id, \{ onSuccess: \(\) => setConfirming\(false\) \}\)\}/);
    expect(customers).not.toMatch(/onClick=\{\(\) => retire\.mutate\(person\.id\)\}/);
  });
});

describe('stopping a staff member', () => {
  it('asks first, naming them, and acts only on the confirmation', () => {
    expect(staff).toMatch(/<Button variant="quietDanger" onClick=\{\(\) => setConfirming\(true\)\}/);
    expect(staff).toMatch(/<ConfirmDialog[\s\S]*?title=\{i18n\.t\('manager\.staff\.deactivateTitle', \{ name: person\.display_name \|\| person\.username \}\)\}/);
    expect(staff).toMatch(/onConfirm=\{\(\) => deactivate\.mutate\(person\.id, \{ onSuccess: \(\) => setConfirming\(false\) \}\)\}/);
    expect(staff).not.toMatch(/onClick=\{\(\) => deactivate\.mutate\(person\.id\)\}/);
  });
});

describe('the words', () => {
  it.each(['customers.retireTitle', 'customers.retireBody', 'manager.staff.deactivateTitle', 'manager.staff.deactivateBody'])('%s exists in both languages', (key) => {
    expect(ar).toHaveProperty([key]);
    expect(en).toHaveProperty([key]);
  });

  it('say what stopping does, and that nothing is deleted', () => {
    expect(ar['customers.retireBody']).toMatch(/فواتير/);
    expect(ar['manager.staff.deactivateBody']).toMatch(/الدخول/);
    expect(ar['manager.staff.deactivateBody']).toMatch(/تبقى|لا تُحذف|لا يُحذف/);
  });
});
