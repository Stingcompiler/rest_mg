/**
 * Store names and the current schema version.
 *
 * `SCHEMA_VERSION` is derived from the migration ladder, never typed by hand:
 * it is always the highest migration version, so adding a rung is the only way
 * to bump it and the two can't drift apart.
 */
import { MIGRATIONS } from './migrations';
import { STORES, type StoreName } from './stores';

export { STORES, type StoreName };

export const DB_NAME = 'sudan-pos';

export const SCHEMA_VERSION = MIGRATIONS.reduce(
  (highest, migration) => Math.max(highest, migration.version),
  0,
);

/** Keys used in the singleton key/value stores. */
export const SETTINGS_KEYS = {
  locale: 'locale',
  numerals: 'numerals',
  theme: 'theme',
  deviceToken: 'deviceToken',
  activeShiftId: 'activeShiftId',
} as const;

export const SYNC_STATE_KEYS = {
  lastPullCursor: 'lastPullCursor',
  lastPushAt: 'lastPushAt',
} as const;
