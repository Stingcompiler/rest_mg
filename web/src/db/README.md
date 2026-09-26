# `src/db` — the device's source of truth

IndexedDB is where the cashier app lives. The UI reads and writes here, always,
online or offline. The network never becomes a second read path — when it is
available, a background engine (phase 10) drains the outbox up and applies pulls
down, but the screens never know the difference.

Everything outside this folder goes through a **repository**. Nothing else opens
the database, names a store, or touches a raw request. That is the rule that
keeps the schema, the migration ladder, and the outbox invariant correct in one
place.

## Layout

| File | What it holds |
|---|---|
| `stores.ts` | Store names, standalone so the ladder can name stores without a cycle. |
| `records.ts` | The stored row shapes. Money is a string of minor units; timestamps are ISO-8601 UTC. |
| `migrations.ts` | The forward-only ladder. Each rung is a pure `(db, tx) => void`. |
| `schema.ts` | Store names + `SCHEMA_VERSION`, derived from the ladder's highest rung. |
| `open.ts` | Opens the database and replays the ladder in one `versionchange` transaction. |
| `idb.ts` | Promise wrappers. `txDone` resolves on **commit**, not last request. |
| `money.ts` | `toMinor` / `fromMinor` — the only bridge between stored strings and `bigint`. |
| `outbox.ts` | The upload queue: enqueue-in-the-same-transaction, due entries, backoff. |
| `pin.ts` | PBKDF2 PIN hashing over WebCrypto. The raw PIN never leaves the device. |
| `repositories/` | One per aggregate. The persistence boundary. |

## The invariants, and where they are proved

- **A closed order and its outbox entry are one write.** `orderRepository.save`
  puts both in a single transaction; a crash between them leaves neither.
  → `__tests__/atomicity.test.ts`
- **The queue is idempotent.** The outbox id is `${type}:${recordId}`, so
  re-saving an order overwrites its one queue row. → `repositories.test.ts`
- **Money survives past 2^53.** Stored as a string, parsed to `bigint`.
  → `repositories.test.ts`
- **A migration never loses data.** Fixtures are written at version N-1, then the
  database is reopened at N. → `__tests__/migrations.test.ts`
- **The PIN is never stored raw.** → `repositories.test.ts`

## Adding a migration

Append a rung to `MIGRATIONS` with the next version number. Never edit a rung
that has shipped — a device that already ran it will not run it again, so a
change to it silently diverges installed databases from fresh ones. Write a
fixture test that populates the previous version and asserts the upgrade
preserves it. There is no down-migration and no manual recovery on a customer's
tablet; the fixture test is the safety net.

## Run the tests

```bash
npm test
```

`fake-indexeddb` supplies a spec-compliant IndexedDB in Node, so the ladder and
the repositories run without a browser.
