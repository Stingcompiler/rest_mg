/**
 * What the Design Reference v2.2 asked of the screens (batch 62).
 *
 * The comparison (docs/DECISIONS.md) kept our identity and took the reference's
 * behaviour. These hold the parts that were taken: forms that say what is
 * optional and answer on the field; an edit page that says it has unsaved
 * changes; a waiting record that looks different from a settled one without
 * relying on colour; figures that say when they were read; a 44px floor on
 * every control; and a chart colour that is not read as a warning.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { contrastRatio, hexToRgb } from '../../styles/contrast';

const SRC = resolve(__dirname, '../..');
const ROOT = resolve(SRC, '../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const css = read('styles/design-tokens.css');

/** The value a token has in the light block (first declaration) or the dark one (the explicit [data-theme='dark'] block). */
const tokenIn = (block: 'light' | 'dark', name: string) => {
  const start = block === 'light' ? css.indexOf(":root,\n[data-theme='light']") : css.indexOf("[data-theme='dark'] {");
  const rest = css.slice(start);
  return rest.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1];
};

const hue = (hex: string) => {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe('forms say what is optional, and answer on the field', () => {
  it('the customer form marks the phone optional, answers on the name, and has no label inside a label', () => {
    const screen = read('features/manager/CustomersScreen.tsx');
    expect(screen).toMatch(/requirement="optional"/);
    expect(screen).toMatch(/useFieldErrors/);
    expect(screen).not.toMatch(/<label[^>]*>\s*\{i18n\.t\('customers\.name'\)\}\s*<TextField/);
  });

  it('the dish and category forms mark the optional fields and check the price', () => {
    const screen = read('features/catalog/CatalogScreen.tsx');
    expect(screen.match(/requirement="optional"/g)?.length).toBeGreaterThanOrEqual(3);
    expect(screen).toMatch(/positiveAmount\(/);
    expect(screen).toMatch(/useFieldErrors/);
  });

  it('the staff forms check username, name and password length on the field', () => {
    const screen = read('features/manager/StaffScreen.tsx');
    expect(screen).toMatch(/useFieldErrors/);
    expect(screen).toMatch(/minLength\(8/);
    expect(screen).toMatch(/requirement="optional"/); // the password on an edit: leave blank to keep
  });

  it('changing a password checks the length and the repeat on the field', () => {
    const menu = read('components/settings/SettingsMenu.tsx');
    expect(menu).toMatch(/useFieldErrors/);
    expect(menu).toMatch(/sameAs\(/);
  });

  it('the restaurant profile marks its one required field', () => {
    expect(read('features/manager/ProfileScreen.tsx')).toMatch(/requirement="required"/);
  });

  it('a field is checked when it is left, not at every key', () => {
    const controls = read('components/primitives/controls.tsx');
    expect(controls).toMatch(/requirement\??:/);
    const hook = read('components/forms/useFieldErrors.ts');
    expect(hook).toMatch(/blur/);
    expect(hook).toMatch(/focus/); // a failed submit takes the person to the first field to fix
  });

  it('every new message exists in both languages', () => {
    for (const locale of ['ar', 'en']) {
      const text = read(`i18n/messages/${locale}.json`);
      for (const key of [
        'form.optional',
        'form.required',
        'form.unsaved',
        'form.discard',
        'form.passwordShort',
        'report.updatedAt',
        'report.updateFailed',
        'customers.nameRequired',
        'catalog.nameRequired',
        'catalog.priceInvalid',
        'catalog.categoryNameRequired',
        'manager.staff.usernameRequired',
        'manager.staff.displayNameRequired',
        'manager.profile.nameRequired',
        'pos.sync.sending',
      ]) {
        expect(text, `${locale}: ${key}`).toContain(`"${key}"`);
      }
    }
  });
});

describe('an edit page that has unsaved changes says so', () => {
  it('the restaurant profile shows the bar, and warns before the tab is closed', () => {
    const screen = read('features/manager/ProfileScreen.tsx');
    expect(screen).toMatch(/<UnsavedBar/);
    expect(screen).toMatch(/useLeaveGuard\(/);
    expect(read('components/forms/UnsavedBar.tsx')).toMatch(/beforeunload/);
  });
});

describe('a record waiting to be sent looks different, and is not a warning', () => {
  const screen = read('features/pos/SyncQueueScreen.tsx');

  it('draws a waiting record with a dashed line, a refused one with the danger line', () => {
    expect(screen).toMatch(/border-dashed/);
    expect(screen).toMatch(/border-danger/);
  });

  it('calls waiting a neutral state, and names the one being sent', () => {
    expect(screen).not.toMatch(/tone=\{isRefused \? 'danger' : 'warning'\}/);
    expect(screen).toMatch(/pos\.sync\.sending/);
  });
});

describe('figures say when they were read', () => {
  const screen = read('features/manager/DashboardScreen.tsx');

  it('shows the time of the last read next to the period', () => {
    expect(screen).toMatch(/<StaleNote/);
    expect(screen).toMatch(/dataUpdatedAt/);
  });

  it('keeps the last figures on screen when a refresh fails, instead of an error in their place', () => {
    expect(screen).toMatch(/revenue\.isError && !revenue\.data|!revenue\.data && revenue\.isError|revenue\.data\s*\?/);
    expect(screen).not.toMatch(/revenue\.isError \|\| !revenue\.data/);
  });
});

describe('every control clears 44px', () => {
  it('has no control size under the touch floor', () => {
    const sizes = [...css.matchAll(/--control-([a-z0-9]+):\s*(\d+)px/g)].map((match) => [match[1], Number(match[2])] as const);
    expect(sizes.length).toBeGreaterThan(4);
    for (const [name, px] of sizes) expect(px, `--control-${name}`).toBeGreaterThanOrEqual(44);
  });
});

describe('a chart colour is not read as a warning', () => {
  it('chart-3 is not in the amber band, and still reads against the page, in both themes', () => {
    for (const [block, surface] of [
      ['light', tokenIn('light', 'color-surface')],
      ['dark', tokenIn('dark', 'color-surface')],
    ] as const) {
      const colour = tokenIn(block, 'color-chart-3')!;
      const h = hue(colour);
      expect(h < 20 || h > 70, `${block} chart-3 ${colour} hue ${Math.round(h)}`).toBe(true);
      expect(contrastRatio(colour, surface!), `${block} contrast`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the reference is recorded, with what was kept and why', () => {
  it('logs each exception in the reference’s own format', () => {
    const decisions = readFileSync(resolve(ROOT, 'docs/DECISIONS.md'), 'utf-8');
    for (const heading of ['D-0001', 'D-0002', 'D-0003', 'D-0004', 'D-0005']) expect(decisions).toContain(heading);
    for (const field of ['التاريخ', 'النطاق', 'ماذا', 'لماذا', 'الأثر', 'كيف يُعكس', 'الحالة']) expect(decisions).toContain(field);
  });

  it('maps our token names to the reference’s', () => {
    const profile = readFileSync(resolve(ROOT, 'docs/ui-profile.md'), 'utf-8');
    expect(profile).toMatch(/Design Reference/);
    expect(profile).toMatch(/`--color-bg`[^\n]*`canvas`/);
    expect(profile).toMatch(/`--color-accent`[^\n]*`brand`/);
  });
});
