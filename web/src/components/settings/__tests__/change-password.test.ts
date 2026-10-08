/**
 * Changing your own password (batch 34).
 *
 * After the first deployment the manager had no way to change the password the
 * server was provisioned with. Now the settings menu, reached from every app,
 * changes it with the current one; the staff screen no longer offers to set your
 * own (the server refuses it: that path skips the current-password check).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authApi } from '@/lib/http';
import ar from '@/i18n/messages/ar.json';
import en from '@/i18n/messages/en.json';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const menu = read('components/settings/SettingsMenu.tsx');
const staff = read('features/manager/StaffScreen.tsx');

describe('the request', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the current and the new password to auth/password/', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('document', { cookie: 'csrftoken=t' });
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ username: 'manager' }), { status: 200 });
    });
    await authApi.changePassword('old-one', 'new-one-long');
    expect(calls[0]!.url).toBe('/api/v1/auth/password/');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ current_password: 'old-one', new_password: 'new-one-long' });
  });
});

describe('the settings menu', () => {
  it('offers it to whoever is signed in', () => {
    expect(menu).toMatch(/\{auth\.user \? <ChangePassword \/> : null\}/);
  });

  it('asks for the current password, the new one twice, and fills them like a password manager expects', () => {
    expect(menu).toMatch(/autoComplete="current-password"/);
    expect(menu.match(/autoComplete="new-password"/g)?.length).toBe(2);
    expect(menu).toMatch(/next !== repeat/);
  });
});

describe('the staff screen', () => {
  it('does not offer to set your own password', () => {
    expect(staff).toMatch(/const isSelf = auth\.user\?\.id === person\.id/);
    expect(staff).toMatch(/\{isSelf \? \(/);
  });
});

describe('the activity log', () => {
  it('says the person changed their own password, not that it was reset', () => {
    expect(read('features/manager/ActivityLog.tsx')).toMatch(/before === 'changed' \? 'manager\.audit\.passwordChanged'/);
  });
});

describe('the words', () => {
  const keys = [
    'settings.password',
    'auth.changePassword',
    'auth.currentPassword',
    'auth.newPassword',
    'auth.repeatPassword',
    'auth.passwordsDiffer',
    'auth.passwordChanged',
    'manager.staff.ownPasswordInSettings',
    'error.wrong_password',
    'error.weak_password',
    'error.same_password',
    'error.use_change_password',
    'manager.audit.passwordChanged',
  ];

  it('exist in both languages', () => {
    for (const key of keys) {
      expect(ar, key).toHaveProperty([key]);
      expect(en, key).toHaveProperty([key]);
    }
  });
});
