/**
 * Store names, kept in their own module so the migration ladder can name stores
 * without importing the schema — which in turn derives its version from the
 * ladder. Splitting these out keeps that dependency acyclic.
 */
export const STORES = {
  orders: 'orders',
  categories: 'categories',
  menuItems: 'menuItems',
  priceChanges: 'priceChanges',
  shifts: 'shifts',
  users: 'users',
  settings: 'settings',
  outbox: 'outbox',
  syncState: 'syncState',
  printJobs: 'printJobs',
  customers: 'customers',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];
