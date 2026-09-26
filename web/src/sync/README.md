# `src/sync` — the background bridge to the server

The cashier has exactly one read/write path: IndexedDB. This module is the
*other* thing the network does — when a connection is available it pushes
finished work up and pulls menu deltas down. It never becomes a second read
path, and it never blocks the UI. It lives outside `src/features/pos`, so it may
use `fetch`; the screens never can.

## Push — draining the outbox

The idempotency guarantee is the whole point. A record is removed from the
outbox only once the server has **acknowledged** it — `accepted` or `duplicate`,
both meaning "it's on the server now". If the connection drops before the
response arrives, nothing is removed; the next run re-sends the whole batch, the
server recognises what it already holds by uuid and answers `duplicate`, and
those clear. **A connection dropped mid-batch therefore produces zero duplicate
rows on the server** — proven with a 500-record test in `__tests__/sync.test.ts`.

A rejected record is backed off and kept, so a bad row never silently vanishes
and never blocks the rows behind it. An accepted order or shift is marked
`syncedAt`, which flips its badge to مُزامن.

## Pull — menu deltas, never orders

The cursor is the server's clock, carried across runs. Deltas apply to the menu
store only; the pull code has no access to the orders store and never opens it.
A price that comes down changes the local menu, never a line already on an
order — that line kept a snapshot when it was rung up.

## Orchestration

`runSync` pushes then pulls, and **never throws** — offline is the normal case.
A network failure returns `online: false` and leaves everything queued; an
un-enrolled tablet (no device token) is skipped cleanly, still reporting the
queue depth. `startSyncPump` runs it on an interval and on reconnect; the
provider also kicks it on shift close, and offers a manual "sync now" that is
never *required*.

## The transport seam

The device talks to Django **directly** with its device token — not through the
Next `/api` proxy, which is for the manager. `HttpSyncTransport` is the real one;
tests use a `FakeServer` that enforces idempotency by uuid and can drop the
connection after N records.

## Verified

Eight unit tests, including the headline drop-mid-batch/zero-duplicate scenario,
plus the offline, skip-when-unenrolled, and rejected-record paths. And end to end
in the browser through the real `HttpSyncTransport` (with `fetch` stubbed to
emulate the idempotent server): the 8-record outbox batched into one push,
acknowledged, drained to zero, both orders marked synced, and the "waiting to
sync" indicator cleared.

A live cross-process run against a running Django was not performed here —
PostgreSQL is unavailable in this environment and SQLite is deliberately not a
target — but the server's half of the contract is itself covered by the Django
suite (54 tests, phase 1), against the same envelope and the same idempotency
rule this engine relies on.
