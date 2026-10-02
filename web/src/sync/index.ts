/**
 * Sync: the background bridge between the device's IndexedDB and the server.
 *
 * Exactly one read/write path exists for the cashier — IndexedDB. This module
 * is the *other* thing the network does: when a connection is available it
 * pushes finished work up (draining the outbox, idempotent by uuid) and pulls
 * menu deltas down. It never blocks the UI and never becomes a second read path.
 */
export { runSync, startSyncPump, type SyncResult, type SyncDeps } from './engine';
export { pushOutbox, type PushOutcome } from './push';
export { pullMenu, type PullOutcome } from './pull';
export { RESTAURANT_IDENTITY_KEY, type RestaurantIdentity } from './identity';
export {
  HttpSyncTransport,
  type SyncTransport,
  type PushEnvelope,
  type PushResponse,
  type PullResponse,
} from './transport';
