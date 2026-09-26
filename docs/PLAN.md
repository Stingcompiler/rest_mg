# Implementation plan — Sudan POS

Derived from the build spec, `DESIGN-SYSTEM.md` (v2 canonical), and `PROMPT-REVIEW.md`.

Two changes to the spec's build order, both for the reason given in the review:

- **Printing moves from 7 to phase 0** — the transport choice decides whether this is one Next.js app
  or a Next.js app inside an Android shell.
- **Sync *schema* moves from 9 to phase 3**, sync *engine* stays late. Outbox, `synced_at` and
  idempotency keys are IndexedDB schema; adding them later means a migration on day one.

One phase is added: **design-system components (phase 6)**, before any screen. Screens 7, 9 and 11
all consume it.

---

## Phase 0 — Decisions and scaffolding

### 0.1 Five decisions that gate everything

| # | Decision | Recommended default |
|---|---|---|
| 1 | **Print transport** | Capacitor Android shell with a native TCP socket plugin. One tablet, keeps the PWA and service worker, gives real port 9100. Adds an Android build step. |
| 2 | **Device credentials** | Long-lived device token bound to `branch_id`, issued once from the manager dashboard, stored in IndexedDB, bearer on `/api/v1/sync/*` only. Revocable. User PIN stays local-only. |
| 3 | **Menu edit direction** | Cashier edits push up in the same sync envelope. Manager is authoritative for structure (categories, new items, deletion); cashier may change price and availability only. Conflicts: last-writer-wins on `updated_at`. |
| 4 | **Money on the wire** | Minor units as **strings** in JSON, `BigInt` in TS, `BigIntegerField` in Django. Display via `formatMoney` only. |
| 5 | **Domain additions** | `CartSession`, `Order.park/resume/split`, `Order.addPayment` with over-tender, `Shift.cashCount[]`. Confirmed as in scope. |

Also to fix before phase 1: sync interval (suggest 60 s + on reconnect + on shift close), variance
tolerance (suggest 1 % of expected cash or a flat floor), favourites window (suggest today, ties by
last sold), timezone `Africa/Khartoum`, PIN lockout policy.

### 0.2 Repository layout

```
sudan-pos/
├── api/                          Django
│   ├── config/                   settings, urls, asgi
│   └── apps/
│       ├── core/                 BaseModel, Branch, money fields
│       ├── accounts/             ManagerUser, Device, JWT
│       ├── catalog/              Category, MenuItem, PriceChange
│       ├── orders/               Order, OrderLine, Payment
│       ├── shifts/               Shift, CashCount
│       ├── profiles/             RestaurantProfile
│       └── sync/                 push/pull endpoints, envelope
├── web/                          Next.js
│   ├── src/app/
│   │   ├── (pos)/pos/            client-only
│   │   ├── (manager)/manager/    SSR + TanStack Query
│   │   ├── r/[slug]/             prepared, not built
│   │   └── api/                  thin proxy
│   ├── src/domain/               pure entities, zero imports outward
│   ├── src/db/                   schema, migrations, repositories
│   ├── src/sync/                 outbox, engine, envelope
│   ├── src/i18n/                 catalogs, provider, formatters
│   ├── src/components/           design-system components
│   ├── src/styles/design-tokens.css   ✅ done
│   └── tailwind.config.ts             ✅ done
├── android/                      Capacitor shell (per decision 1)
└── docs/                         DESIGN-SYSTEM.md, PROMPT-REVIEW.md, PLAN.md
```

### 0.3 Guardrails as CI, not as discipline

Custom ESLint rules + a CI check, written in this phase so they fail from the first commit:

- ban `ml-|mr-|pl-|pr-|left-|right-|text-left|text-right` in `web/src/**`
- ban literal hex/rgb and raw `px` values in `src/components/**` and `src/app/**`
- ban string literals in JSX text position (all strings through i18n)
- ban `fetch`/`axios`/`useQuery` under `src/app/(pos)/**`
- ban imports from `src/db/**` or `src/sync/**` inside `src/domain/**`

**Done when:** both apps boot, Postgres connected, Render blueprint committed, `/pos` renders an
empty themed RTL shell with no network calls, all five lint rules fail a deliberate violation.

---

## Phase 1 — Django models, migrations, explicit ViewSets

### Models

All inherit `BaseModel`: `id` (UUID, **client-generated**, no default on the server),
`created_at`, `updated_at`, `synced_at`, `branch_id`, `status` where applicable. No hard deletes.

| App | Model | Notes |
|---|---|---|
| core | `Branch` | Root scope for every record. |
| accounts | `ManagerUser` | Django auth user + role. JWT via httpOnly cookies. |
| accounts | `Device` | `token_hash`, `label`, `branch`, `enrolled_at`, `revoked_at`. |
| catalog | `Category` | `name_ar`, `name_en`, `sort`, `is_active`. |
| catalog | `MenuItem` | `category`, `name_ar/en`, `description_ar/en`, `price_minor` (bigint), `is_available`, `sort`. |
| catalog | `PriceChange` | Append-only: `item`, `old_price_minor`, `new_price_minor`, `source_device`, `applied_at`. Bulk % changes emit one row per item. |
| orders | `Order` | `number`, `type` (dine_in/takeaway/delivery), `table_id`, `customer_id`, `status` (open/parked/sent/closed/void), `subtotal_minor`, `discount_minor`, `total_minor`, `opened_at`, `sent_at`, `closed_at`, `cashier`, `shift`, `device`. |
| orders | `OrderLine` | `item_id`, `name_snapshot_ar/en`, `unit_price_minor` **snapshotted**, `qty`, `modifiers_text`, `line_total_minor`, `is_void`. |
| orders | `Payment` | `method` (cash/bank/wallet/credit), `amount_minor`, `tendered_minor`, `change_minor`, `reference`, `customer_id`. |
| shifts | `Shift` | `cashier`, `opened_at`, `closed_at`, `opening_float_minor`, `expected_cash_minor`, `counted_cash_minor`, `variance_minor`, `variance_reason`, `status`. |
| shifts | `CashCount` | `shift`, `denomination_minor`, `count`, `line_total_minor`. |
| profiles | `RestaurantProfile` | name, description, address, phone, whatsapp, `hours` JSON, `map_url`, photos, `delivery_links` JSON, `slug`, `landing_page_enabled`. Stored now, unrendered. |

### Endpoints — explicit `ViewSet`s on routers, actions written by hand

```
POST /api/v1/sync/push          batched envelope; idempotent by record uuid
GET  /api/v1/sync/pull?since=   catalog + settings + profile deltas
POST /api/v1/devices/enroll     manager-auth; returns the device token once
POST /api/v1/auth/token         manager login → httpOnly cookies
POST /api/v1/auth/refresh       rotation
GET  /api/v1/orders/            manager, read-only, filtered
GET  /api/v1/shifts/            manager, read-only
GET  /api/v1/reports/revenue    aggregates
CRUD /api/v1/catalog/items/     manager-authoritative
CRUD /api/v1/profile/           manager
```

**Push envelope:**

```jsonc
{ "device_id": "...", "batch_id": "uuid",
  "records": [ { "type": "order", "id": "uuid", "updated_at": "...", "payload": { } } ] }
```

Response returns per-record `{ id, accepted | duplicate | rejected, reason }`. A replayed batch
returns `duplicate` for every record and changes nothing. Closed orders are never mutated —
a correction arrives as a new reversing record.

**Tests:** replaying a batch twice writes once · a push touching a closed order is rejected ·
`since` cursor returns only changed rows · money round-trips as a string without precision loss ·
every model rejects a server-generated UUID.

**Done when:** migrations apply to a clean Postgres, the endpoint suite passes, and a hand-rolled
curl of the push envelope twice produces one order.

---

## Phase 2 — Next.js route skeleton and the /pos ↔ /manager split

- `(pos)/pos/layout.tsx` — server component, **zero data access**; `'use client'` on everything
  beneath. Static shell so the service worker can cache it whole.
- `(manager)/manager/**` — SSR + TanStack Query, JWT cookies, `middleware.ts` guarding it and
  explicitly skipping `/pos` and `/api`.
- `app/api/**` — thin proxy: attach auth, normalise errors, no business logic.
- Service worker registered with **scope `/pos/`** only; never intercepts `/manager`, `/r`, `/api`.
- PWA manifest with `start_url: /pos`, landscape orientation lock.

**Done when:** `/pos` loads with the network disabled from a cold cache, `/manager` 302s to login,
and DevTools shows zero requests from `/pos` after install.

---

## Phase 3 — IndexedDB schema, migration runner, repositories, sync schema

**Stores** (embedded lines and payments so an order is one atomic read):

| Store | Key | Indexes |
|---|---|---|
| `orders` | uuid | `status`, `shiftId`, `openedAt`, `syncedAt` |
| `menuItems` | uuid | `categoryId`, `isAvailable` |
| `categories` | uuid | `sort` |
| `shifts` | uuid | `status`, `openedAt`, `syncedAt` |
| `priceChanges` | uuid | `syncedAt` |
| `users` | uuid | PIN hash (Argon2id or PBKDF2 via WebCrypto), role |
| `settings` | key | locale, numerals, theme, deviceToken, schemaVersion |
| `outbox` | uuid | `type`, `attempts`, `nextAttemptAt` |
| `syncState` | key | `lastPullCursor`, `lastPushAt`, `pendingCount` |

**Migration runner:** forward-only ladder in `onupgradeneeded`, each step a pure function with its
own test and a fixture database at the previous version. Customers are offline — a failed migration
has no human fallback, so every step is tested against real prior-version data.

**Repositories** return domain entities and are the only code that touches IndexedDB.
`src/domain/**` may not import them (enforced by the lint rule from phase 0).

**Done when:** a v1 fixture DB upgrades to vN with data intact, repositories round-trip an order in
< 20 ms, and every write appends to the outbox.

---

## Phase 4 — i18n and theming infrastructure (before any UI)

- Message catalogs `src/i18n/messages/{ar,en}.json`, namespaced by screen. `next-intl` for the SSR
  routes; the same catalogs loaded through a client provider under `/pos`.
- `<html dir>` and `lang` from locale; theme applied by a tiny blocking inline script reading
  `localStorage` before first paint — no flash.
- `formatMoney(minor: bigint, { numerals, locale })` — grouping with `U+066C ٬` for Arabic-Indic,
  `,` for Western. `formatTime`, `formatDate` always LTR.
- Numerals are a **user setting independent of locale**, per spec and per the prototype.
- Verify tabular alignment of `٠١٢٣` in Cairo (see review B5); if it fails, swap the numeric face.

**Done when:** switching locale mid-order re-renders in the other direction and loses nothing;
switching theme causes no flash; a money column of mixed-width values aligns in both numeral systems.

---

## Phase 5 — Domain entities and unit tests

Pure TypeScript, no persistence, no network, no printing.

```
Order         addLine removeLine changeQty applyDiscount addPayment
              park resume split send close void
              subtotal total amountDue amountPaid changeDue canBeModified canClose
OrderLine     lineTotal canBeRemoved            (name + price snapshotted at sale)
CartSession   open switch list park close       (multi-cart tabs)
MenuItem      isAvailable raisePrice
Payment       requiresReference isValid isCash countsTowardExpectedCash
Shift         addOrder expectedCash countedCash variance canClose close
CashCount     lineTotal
User          can(action)
```

One named test per business rule:

- order cannot close while `amountDue > 0`
- credit payment settles the balance but is excluded from `expectedCash`
- closed order rejects every mutation; corrections are new reversing records
- price pulled from the server changes `MenuItem`, never an open order's line
- shift cannot close while any order is open **or** while variance exceeds tolerance without a reason
- over-tender produces `changeDue`, never a negative `amountDue`
- money arithmetic stays `BigInt` end to end; no `number` in any path
- discount cannot exceed subtotal
- voided line leaves an audit record, never disappears

**Done when:** every rule above has a failing-then-passing test and `src/domain` imports nothing
from `src/db`, `src/sync`, or React.

---

## Phase 6 — Design-system components (added phase)

Build the 31 components catalogued in `DESIGN-SYSTEM.md` §6 against the tokens, in both themes and
both directions, with the gaps the mockups never drew: empty, loading, error, and confirmation.

Priority order: Button · Input · SegmentedControl · StatusChip · QtyStepper · CartLine · MenuItemCard
· CategoryTab · Keypad · AmountRow · CalloutPanel · ProgressBar · Toggle · KpiCard · NavRail ·
OrderCard · BarChart.

Raise every interactive control to the 44 px floor the design states but violates (review B6).

**Done when:** a component gallery renders all 31 in ar/en × dark/light, no literal values survive
lint, and keyboard focus is visible in both themes.

---

## Phase 7 — Order entry, payment, shift close (v2 geometry)

- **Order entry** — rail 92 | content | cart 404. Search, favourites row, category tabs with counts,
  4-column grid of 112 px cards, multi-cart tabs, quick actions, totals footer.
- **Payment** — 2-up method cards, quick cash, 3-column keypad, right panel 470 with split-payment
  progress, recorded payments, remaining/change, receipt actions.
- **Shift close** — denomination panel 430, sales by method, variance callout with mandatory reason,
  blocked close.

Every screen reads and writes IndexedDB only. No `fetch` on any interactive path.

**Done when:** a full order — add, modify, park, resume, split payment, close — completes with the
device in airplane mode, and every local operation measures under 200 ms input-to-paint.

---

## Phase 8 — Printing

- ESC/POS builder: 80 mm, Arabic encoding (CP864 or UTF-8 per printer), right-alignment for RTL,
  logo, cut. Templates render in both directions.
- Two destinations: kitchen ticket **on send**, receipt **only once `amountDue === 0`**.
- Persist before printing, always. Failures queue and retry with backoff; never block the flow.
- Transport per decision 1; a `PrintService` interface keeps the transport swappable and lets tests
  run against a fake.

**Done when:** killing the printer mid-order loses nothing, the queue drains on reconnect, and no
print failure ever blocks a close.

---

## Phase 9 — Open orders, menu management, daily report

- **Open orders** — 3-column card grid, sync badge, age bar escalating success → warning → danger,
  resume and cancel.
- **Menu management** — category sidebar, price edit, bulk % change emitting one `PriceChange` per
  item, availability toggle, local-first with the push path from decision 3.
- **Daily report** — KPI row, hourly bars, top items, all computed locally.

Resolve review B7 here: scrolling/virtualisation for a 200+ item menu, and empty states.

---

## Phase 10 — Sync engine

Background only, never on an interactive path. Runs on interval, on reconnect, and on shift close;
a manual "sync now" exists but is never required.

1. **Push** — drain the outbox in batches, idempotent by uuid, exponential backoff, mark `syncedAt`
   from the server response.
2. **Pull** — `since` cursor, apply catalog and settings deltas to the local menu, **never** to open
   orders.
3. Surface connection state and unsynced count; per-order sync badges.

**Done when:** a 500-record outbox pushed over a connection dropped mid-batch produces zero
duplicates, and a soak test of 72 h offline followed by reconnect reconciles cleanly.

---

## Phase 11 — Manager dashboard

SSR + TanStack Query, JWT httpOnly cookies with refresh rotation. Revenue dashboard (1440×900 layout
from `1e`), reports, restaurant profile editor including the landing-page fields and the
`landing_page_enabled` flag. Same tokens, both locales, both themes. Device enrolment and revocation
live here.

---

## Phase 12 — Hardening

Perf budget enforced in CI (200 ms local ops, no spinner under `/pos`), migration ladder tested from
every released version, offline soak, RTL/LTR visual regression, accessibility pass (the design's own
border tokens sit at 1.5:1 and 1.7:1 — below the 3:1 non-text minimum; decide whether to raise them).

**Public landing page `/r/[slug]` stays unbuilt.** The requirement is only that the API already
stores everything it will need — satisfied in phase 1 by `RestaurantProfile`.

---

## Risks

| Risk | Mitigation |
|---|---|
| Print transport forces an Android shell late | Decision 1 in phase 0, `PrintService` interface from the start |
| IndexedDB migration fails on a customer device with no support path | Every step tested against real prior-version fixtures; forward-only; schema version recorded |
| Arabic-Indic numerals don't align in money columns | Verified in phase 4, before any screen is drawn |
| Menu edit conflicts silently overwrite | Decision 3 + `PriceChange` as an append-only audit trail |
| BigInt precision lost at a JSON boundary | Strings on the wire, enforced by serializer tests |
| Design gaps (empty/loading/error/confirm) invented ad hoc per screen | Built once in phase 6 from the token set |
