/**
 * The manager's lists as lines, not boxes (batch 56, from the review,
 * docs/ui-profile.md).
 *
 * Customers, staff, sales and the catalogue drew every row as a bordered box,
 * and the customers and staff rows each carried two outlined buttons where the
 * destructive one («إيقاف») weighed as much as the main one. A long customer
 * name was cut to «شركة الأفق للمقاولات والتجارة ال…». Sales rows broke their
 * date across two lines on a phone. The staff screen opened on a four-field
 * form before the people it is for; the catalogue drew a missing-photo icon on
 * every dish and a tinted box inside the card to confirm a removal.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(SRC, path), 'utf-8');
const customers = read('features/manager/CustomersScreen.tsx');
const staff = read('features/manager/StaffScreen.tsx');
const sales = read('features/manager/ReportsScreen.tsx');
const catalog = read('features/catalog/CatalogScreen.tsx');

const BOX = /rounded-lg border border-line bg-surface p-(?:14|16)/;

describe('the customers screen', () => {
  it('draws no box around its summary, its form or its rows', () => {
    const screen = /export function CustomersScreen[\s\S]*?\n\}\n/.exec(customers)?.[0] ?? '';
    expect(screen).not.toMatch(BOX);
    expect(/function AddCustomerForm[\s\S]*?\n\}\n/.exec(customers)?.[0] ?? '').not.toMatch(BOX);
    expect(/function CustomerRow[\s\S]*?\n\}\n/.exec(customers)?.[0] ?? '').not.toMatch(BOX);
  });

  it('sets each customer as a line, the whole name readable', () => {
    const row = /function CustomerRow[\s\S]*?\n\}\n/.exec(customers)?.[0] ?? '';
    expect(row).toMatch(/border-b border-line py-14/);
    expect(row).not.toMatch(/truncate/);
    expect(row).toMatch(/break-words/);
  });

  it('gives stopping a customer the quiet weight of a risky act', () => {
    expect(customers).toMatch(/<Button variant="quietDanger" onClick=\{\(\) => setConfirming\(true\)\}/) // asks first since batch 58;
  });
});

describe('the staff screen', () => {
  it('shows the people before the form for adding one', () => {
    expect(staff.indexOf('(staff.data ?? []).map')).toBeGreaterThan(0);
    expect(staff.indexOf('(staff.data ?? []).map')).toBeLessThan(staff.indexOf('<AddStaffForm />'));
  });

  it('sets each person as a line and the form under a rule, neither in a box', () => {
    expect(/function StaffRow[\s\S]*?\n\}\n/.exec(staff)?.[0] ?? '').toMatch(/border-b border-line py-14/);
    expect(/function AddStaffForm[\s\S]*?\n\}\n/.exec(staff)?.[0] ?? '').toMatch(/<form onSubmit=\{submit\} className="flex flex-col gap-12 border-t border-line pt-16">/);
    expect(staff).not.toMatch(/function StaffRow[\s\S]*?rounded-lg border border-line bg-surface p-14[\s\S]*?\n\}\n/);
  });

  it('shows the activity log without a box around it', () => {
    expect(staff).not.toMatch(/<div className="rounded-lg border border-line bg-surface px-16">\s*<ActivityLog/);
  });

  it('gives deactivating the quiet weight of a risky act', () => {
    expect(staff).toMatch(/<Button variant="quietDanger" onClick=\{\(\) => setConfirming\(true\)\}/) // asks first since batch 58;
  });
});

describe('the sales list', () => {
  it('is lines, and keeps a date whole on one line', () => {
    expect(sales).toMatch(/border-b border-line py-12/);
    expect(sales).not.toMatch(BOX);
    expect(sales).toMatch(/whitespace-nowrap text-num-sm text-text-muted order-last basis-full sm:order-none sm:basis-auto/);
  });
});

describe('the catalogue', () => {
  it('draws no missing-photo icon on a dish with no photo', () => {
    const row = /function ItemRow[\s\S]*?\n\}\n/.exec(catalog)?.[0] ?? catalog.slice(catalog.indexOf('item.image_url'), catalog.indexOf('item.image_url') + 900);
    expect(row).not.toMatch(/<ImageOff size=\{22\}/);
  });

  it('confirms a removal in plain words under a rule, not in a tinted box', () => {
    expect(catalog).not.toMatch(/rounded-md bg-surface-2 p-8 text-ar-sm/);
    expect(catalog).toMatch(/flex items-center justify-between gap-8 border-t border-line pt-10 text-ar-sm/);
  });
});
