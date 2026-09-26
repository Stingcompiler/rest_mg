# Review of the build spec against the extracted design

The spec is strong — the offline contract, the entity/repository split, the immutability and
idempotency rules are the right calls and stated sharply enough to hold up under pressure. What
follows is only what needs changing, in three tiers.

Cross-checked against `DESIGN-SYSTEM.md` and the v2 mockups (now canonical per your decision).

---

## A. Blocking — decide these before step 1

### A1. The design has features the spec has no model for

v2 (canonical) adds six things that do not exist anywhere in the spec's screen list or domain model:

| Design feature | What it needs |
|---|---|
| **Multi-cart tabs** — 3 concurrent open carts on one device + a `+` tab | There is no "active order" concept. Needs a `CartSession` / active-order switch, and `Order` gains a `parked` state distinct from `open`. |
| **Cart quick actions** — خصم · ملاحظة · **تقسيم** · **تعليق** | Split-bill and hold/park are order-level operations absent from `Order`'s method list. |
| **Split payment** — partial payments summing to the total, with a % progress bar and quick-cash buttons | Implied by `amountDue`, but `Order` needs `payments[]`, `amountPaid`, `changeDue`, and `addPayment` with over-tender handling (the mock shows "استلمت ٢٠٬٠٠٠ · الباقي ٥٬٠٠٠"). |
| **Denomination cash count** — 5 note rows × count → line sums → counted total | `Shift.variance` assumes a single counted number. Needs a `CashCount` value object (denomination, count, lineTotal) persisted with the shift. |
| **Favourites row** — "الأكثر طلبًا اليوم", 5 items, 1 tap | Local aggregation over today's orders. Define the window (today? rolling 7 days?) and the tie-break. |
| **Search + category counts** | Local index over the menu; counts per category recomputed on availability change. |

Also drawn but unmodelled: per-order **sync badge** and **age bar** with escalating colour
(`success` → `warning` → `danger`), which means `Order` needs `syncedAt` and an age derived from
`sentAt`, both surfaced in the list.

**Action:** extend the domain model section with `Order.park/resume/split`, `Order.addPayment`,
`Shift.cashCount`, and a `CartSession` aggregate. Otherwise step 5 writes tests for the wrong rules.

### A2. Menu editing has no upward path

The offline contract says the network does exactly three things, and all three are one-way *down*
for menu data. But cashier screen 4 edits prices and applies bulk % changes, and the mockup labels it
"التعديلات تُحفظ محليًا". So either:

- those edits push up (a **fourth** network job, and the contract's "exactly three" is wrong), or
- they are device-local and the next pull silently overwrites them.

There is no conflict rule anywhere in the spec. **Action:** state it explicitly. Recommended —
menu edits are pushed in the same batched, idempotent envelope as orders; conflicts resolve
last-writer-wins on `updated_at`; the manager dashboard is authoritative for structure (categories,
new items) while the cashier may only change price and availability.

### A3. The device has no credentials

"Auth is a local PIN… No JWT, no cookies, no network. Ever." is correct for the *user*. But the
device still has to authenticate its sync pushes to Django, and nothing in the spec issues it
anything. **Action:** add device provisioning — a long-lived device token bound to `branch_id`,
issued once from the manager dashboard, stored in IndexedDB, sent as a bearer on `/api/sync` only.
Rotation and revocation need a story too (a stolen tablet is the realistic threat).

Related: there is **no PIN unlock screen and no cashier-switch screen** in the mockups, yet the
header shows "الكاشير: سمية" and shifts are owned by a cashier. Two screens are missing from both
the spec and the design.

### A4. Printing is decided at step 7 but constrains step 1

You already flag that browsers can't open raw TCP. The resolution changes the shape of the whole
app, so it can't wait until step 7:

| Approach | Cost |
|---|---|
| **Capacitor/TWA Android shell with a native socket plugin** | Recommended. One tablet, already a PWA; gives real TCP to port 9100, keeps the SW and install story, adds an Android build pipeline. |
| Local print bridge (small HTTP→TCP service on the tablet or a Pi) | Extra device to provision and keep running; another failure mode offline. |
| WebUSB / Web Bluetooth | Changes the hardware requirement to USB/BT printers; kills "network thermal printers, two destinations". |
| Server-side printing | Breaks offline outright. Non-starter. |

**Action:** pick before step 1 and write it into the stack section. If it's Capacitor, "one Next.js
app" becomes "one Next.js app + an Android shell", and the build order needs that step.

### A5. Money: bigint is right, but the transport isn't specified

`BigIntegerField` in minor units is correct for SDG. Two concrete traps:

1. `JSON.stringify` throws on `BigInt`. If amounts ever exceed `Number.MAX_SAFE_INTEGER`
   (9.007e15 — reachable in minor units under severe inflation), they must be transported as
   **strings** and parsed to `BigInt` on both sides. Decide now; retrofitting is a schema and
   serializer rewrite.
2. The design shows **no currency unit anywhere** and all prices are whole thousands. Do minor units
   exist in practice? Recommend storing ×100 anyway and never displaying them.

**Action:** state the wire format (string), the display format (grouped, `U+066C ٬` in Arabic-Indic,
`,` in Western), and the currency label.

---

## B. Contradictions and gaps to tighten

### B1. "No screen ever renders differently because the network is up" — overstated

The design contradicts this in three places beyond the connection indicator you already carve out:
the "بانتظار المزامنة ١٢" counter, per-order **مُزامن / غير مُزامن** badges, and the payment header
changing to "غير متصل · يُحفظ محليًا". **Reword to:** network state may drive *status affordances*
only — never data availability, never layout, never a blocking wait.

### B2. Shift close has two blocking conditions, not one

Spec: "Shift cannot close while any order is open." Design: close is disabled because of an
**unexplained cash variance** (the mock shows 6 open orders *and* a variance, with a reason field).
Both rules are fine, but the UI must say which one is blocking. **Action:** add "variance beyond
tolerance requires a written reason before close" as a named rule, and define the tolerance.

### B3. Sync schema is needed at step 3, not step 9

An outbox table, `synced_at` on every store, and client-UUID idempotency keys are IndexedDB *schema*
decisions. Building them at step 9 means a migration on day one of sync. **Action:** move the sync
schema into step 3; leave the engine at step 9.

### B4. Theming rule is right; the mockup violates it

"Semantic tokens defined independently per mode, not derived by inversion" is exactly correct — and
the mockup does the opposite (a literal dark→light hex map). That's why light mode has **no hover and
no pressed accent** and no focus ring. Already fixed in `src/styles/design-tokens.css`; keep the rule
in the spec so it doesn't regress.

### B5. Numerals won't align

`'IBM Plex Mono','Cairo'` has no Arabic-Indic glyphs in the mono face, so `٠١٢٣` falls back to Cairo
and renders proportionally. Prices, totals and denomination sums will not line up in a column.
Handled in the tokens via `--numeric-tabular`, but it needs verification against real Cairo metrics.
**Action:** add "financial columns must be verified for tabular alignment in both numeral systems"
to the i18n section.

### B6. Touch targets contradict the design's own rule

The design states "44px min target" and then draws segmented-control items at 40px and header chips
at 38–40px. **Action:** state the floor in the spec (44) and accept that the header grows ~4px.

### B7. Nothing is specified for full lists

Every list in the mockups is drawn exactly full with `overflow:hidden` — 12 items, 6 orders, 4 cart
lines. A real menu is 200+ items. Undefined: scrolling vs pagination, virtualisation, and the
"no spinners under /pos" rule when a category renders 300 cards. Also **no empty, loading, or error
states exist in the design at all**, and no modals or confirmations — yet "cancel order" and "void"
clearly need one. **Action:** name these as design gaps to be filled from the token set.

### B8. PWA scope in a single Next app

One app serving `/pos` (offline shell), `/manager` (SSR) and `/r/[slug]` (SSR, cached) means the
service worker must be scoped to `/pos/` only, and must never intercept `/manager` or `/api`.
**Action:** state the SW scope, and that `/pos/layout.tsx` is a data-free server component with
`'use client'` on everything beneath it.

---

## C. Smaller notes

- **Screen list matches v1, not v2.** Screens 1–6 read like the v1 mockups. With v2 canonical, order
  entry gains the rail, search and favourites; payment gains split progress and quick cash; open
  orders becomes a 3-column card grid, not a list; shift close gains denominations. Menu management
  and daily report are v1-only and are being back-ported to v2 geometry.
- **Three viewports, one token set:** cashier 1280×800 fixed landscape (lock orientation, no
  breakpoints), manager 1440×900, landing 390 mobile-first.
- **"No mixins, no ModelViewSet"** is defensible but costs real boilerplate across ~8 models; the
  serializers still carry the weight. Worth stating it's a deliberate trade, not an oversight.
- **Unstated constants:** sync interval, variance tolerance, favourites window, session/PIN lockout
  policy, timezone (Africa/Khartoum), and where "sub-200ms" is measured (input → paint).
- **`User.can(action)`** implies roles, but no role administration exists in any mockup. Presumably
  manager-only; say so.
- **Credit (آجل/ذمم)** is well handled in the spec and matches the design, which gives it a dedicated
  purple token family and marks it "لا يُحتسب إيرادًا" in the shift totals. No change needed — this
  one is already right.
