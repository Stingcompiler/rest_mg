/**
 * The persistence boundary.
 *
 * Everything outside `db/` goes through a repository. Nothing else opens the
 * database, names a store, or touches a raw request — that rule is what lets the
 * schema, the migration ladder and the outbox invariant live in one place and
 * stay correct.
 */
export { openDatabase } from './open';
export { DB_NAME, SCHEMA_VERSION, STORES, SETTINGS_KEYS, SYNC_STATE_KEYS } from './schema';
export { toMinor, fromMinor } from './money';
export { hydrateOrder, orderToRecord, orderRecordToSnapshot } from './mappers';
export { hashPin, verifyPin } from './pin';
export * from './records';

export { orderRepository, OrderRepository } from './repositories/orderRepository';
export { menuRepository, MenuRepository } from './repositories/menuRepository';
export { customerRepository, CustomerRepository } from './repositories/customerRepository';
export { shiftRepository, ShiftRepository } from './repositories/shiftRepository';
export { userRepository, UserRepository } from './repositories/userRepository';
export {
  settingsRepository,
  SettingsRepository,
  syncStateRepository,
  SyncStateRepository,
} from './repositories/settingsRepository';

export {
  enqueue,
  dueEntries,
  acknowledge as acknowledgeOutboxEntry,
  discard as discardOutboxEntry,
  backoff as backoffOutboxEntry,
  pendingCount,
  rejectedEntries,
  allEntries as allOutboxEntries,
  retryNow as retryOutboxNow,
  outboxId,
} from './outbox';
