# `src/domain` — the business rules

Pure TypeScript. Entities guard their own invariants and know nothing about
persistence, printing, the network, or React. The `domain-purity` lint rule
enforces that: a domain file that imports `@/db`, `@/sync`, `react`, or `next`
fails CI. Everything else in the app depends inward on this; this depends on
nothing outward.

All money is `bigint` minor units, end to end — `number` never touches a money
value.

## Entities

| Entity | Guards |
|---|---|
| `Order` | The bill. Cannot close with an amount due; immutable once closed (corrections are new reversing orders); discount ≤ subtotal; over-tender → change, never negative due; voided lines stay as audit records; `split` for the "تقسيم" action. |
| `OrderLine` | Name and price **snapshotted at sale** — a later menu change never rewrites it. |
| `Payment` | Bank/wallet need a reference; credit needs a customer; only cash counts toward the drawer. |
| `MenuItem` | `toLine` copies a price snapshot onto an order; nothing here can reach back into a sold line. |
| `CartSession` | The multi-cart tabs — several open orders on one device, one active. |
| `CashCount` | One counted denomination row; the shift's counted total is a sum of rows. |
| `Shift` | Cannot close with an open order **or** an unexplained variance beyond tolerance; expected cash excludes credit. |
| `User` | `can(action)` — one permission matrix, cashier vs manager. |

## Snapshots and the persistence boundary

Every entity has `toSnapshot()` / `fromSnapshot()` returning plain data with
`bigint` money. The domain never imports the IndexedDB record types (that would
break purity), so a thin mapper — added in phase 7, outside this folder —
bridges snapshots (bigint) to storage records (string minor units). That mapper
is the single place money crosses between the two representations on the client,
mirroring `MoneyField` on the server.

## The rules, and the tests that pin them

Each rule from the plan has a named test in `__tests__/`:

- order cannot close while an amount is due — `order.test.ts`
- closed order refuses every mutation; a correction is a new reversing order — `order.test.ts`
- discount cannot exceed subtotal — `order.test.ts`
- over-tender produces change, amount due floors at zero — `order.test.ts`
- a voided line stays as an audit record; a sent line must be voided, not removed — `order.test.ts`
- money stays bigint and exact past 2^53 — `order.test.ts`
- bank/wallet need a reference; credit needs a customer; only cash is drawer cash — `payment-menu.test.ts`
- a price change never touches a line already on an order — `payment-menu.test.ts`
- shift cannot close with an open order — `shift-cart-user.test.ts`
- shift cannot close on an unexplained variance beyond tolerance — `shift-cart-user.test.ts`
- credit is excluded from expected cash — `shift-cart-user.test.ts`
- the cart session holds, switches, parks and closes tabs — `shift-cart-user.test.ts`
- cashier vs manager permissions — `shift-cart-user.test.ts`

```bash
npm test
```
