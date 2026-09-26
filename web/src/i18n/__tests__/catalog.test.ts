import { describe, expect, it } from 'vitest';

import { translate } from '../catalog';
import { direction } from '../config';
import { resolveTheme } from '../../theme/theme';

describe('translate', () => {
  it('returns the string in the requested locale', () => {
    expect(translate('ar', 'pos.title')).toBe('الكاشير');
    expect(translate('en', 'pos.title')).toBe('Cashier');
  });

  it('interpolates named parameters', () => {
    expect(translate('en', 'pos.status.pendingCount', { count: 12 })).toBe('12 waiting to sync');
    expect(translate('ar', 'pos.cart.itemCount', { count: 3 })).toBe('3 أصناف');
  });

  it('leaves an unsupplied placeholder in place rather than printing undefined', () => {
    expect(translate('en', 'pos.status.pendingCount')).toBe('{count} waiting to sync');
  });
});

describe('direction', () => {
  it('is RTL for Arabic and LTR for English', () => {
    expect(direction('ar')).toBe('rtl');
    expect(direction('en')).toBe('ltr');
  });
});

describe('resolveTheme', () => {
  it('follows the system only when the preference is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('lets an explicit choice win over the system preference', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
