/**
 * The screens the first review pass had not reached (batch 59, from the
 * screenshots of 16 October, docs/ui-review-2026-10-15.md).
 *
 *   - Devices on a phone: «تسجيل جهاز جديد» was cut off at the screen's edge,
 *     its label broken over three lines, because the form row never wrapped;
 *     each device was a box with an outlined «إلغاء» that cut a tablet off at
 *     once.
 *   - The till's menu screen on a 768px tablet gave its category list 430px (the
 *     width of the shift-close count panel) and left the prices 222px.
 *   - Opening hours drew each period in a box inside the hours' own box.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import ar from '@/i18n/messages/ar.json';
import en from '@/i18n/messages/en.json';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const devices = read('features/manager/DevicesScreen.tsx');
const menu = read('features/pos/MenuManagementScreen.tsx');
const profile = read('features/manager/ProfileScreen.tsx');

describe('the devices screen', () => {
  it('wraps its form, so the enrol button stays on the screen', () => {
    expect(devices).toMatch(/<div className="flex flex-wrap items-end gap-12 border-b border-line pb-16">/);
    expect(devices).toMatch(/<label className="flex min-w-0 flex-1 basis-field-min flex-col gap-6">/);
  });

  it('sets each device as a line, not a box', () => {
    expect(devices).toMatch(/flex flex-wrap items-center gap-x-16 gap-y-8 border-b border-line py-14/);
    expect(devices).not.toMatch(/gap-16 rounded-lg border border-line bg-surface p-14/);
  });

  it('asks before revoking a device, which cuts that tablet off at once', () => {
    expect(devices).toMatch(/<Button variant="quietDanger" onClick=\{\(\) => setRevoking\(device\.id\)\}/);
    expect(devices).toMatch(/title=\{i18n\.t\('manager\.devices\.revokeTitle', \{ name: revokingDevice\?\.label \?\? '' \}\)\}/);
    expect(devices).toMatch(/onConfirm=\{\(\) => revoking && revoke\.mutate\(revoking, \{ onSuccess: \(\) => setRevoking\(null\) \}\)\}/);
    expect(devices).not.toMatch(/onClick=\{\(\) => revoke\.mutate\(device\.id\)\}/);
  });

  it('words the question in both languages', () => {
    for (const key of ['manager.devices.revokeTitle', 'manager.devices.revokeBody']) {
      expect(ar).toHaveProperty([key]);
      expect(en).toHaveProperty([key]);
    }
    expect(ar['manager.devices.revokeBody']).toMatch(/يتوقف|لن يستطيع/);
  });
});

describe('the till’s menu screen on a tablet', () => {
  it('gives its category list the width of a list, not of a count panel', () => {
    expect(menu).toMatch(/<nav className="[^"]*\bmd:w-menu-sidebar\b/);
    expect(menu).not.toMatch(/<nav className="[^"]*denomination-panel/);
  });
});

describe('opening hours', () => {
  it('separates the periods with a rule, not a box inside the box', () => {
    expect(profile).not.toMatch(/<div key=\{index\} className="flex flex-col gap-10 rounded-md border border-line p-12">/);
    expect(profile).toMatch(/<div key=\{index\} className="flex flex-col gap-10 border-t border-line pt-12 first:border-t-0 first:pt-0">/);
  });
});
