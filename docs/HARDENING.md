# Phase 12 — hardening

The final pass: turn the review's open questions into guarded facts, prove the
resilience the offline contract promises, and be honest about what a real
deployment still needs.

## Accessibility — the border-contrast question, answered

The review flagged the design's border tokens as below the WCAG 3:1 non-text
minimum. Rather than argue it, `src/styles/__tests__/contrast.test.ts` now reads
the real token file and measures every pairing in both themes. It settled the
question with data:

- **All text and status colours already clear AA (4.5:1)** on every surface they
  sit on, in light and dark — the design's stated ratios are validated, not
  assumed.
- **`border-strong`** — the boundary of a component you must be able to find
  (secondary buttons, selected chips, add affordances) — was at 1.65:1 (light)
  and 2.21:1 (dark). It has been **raised to ≥3:1** (`#837D73` / `#737A80`),
  and the test holds it there.
- **The plain `border`** — a decorative separator between surfaces that already
  differ in colour — is left subtle by design. WCAG 1.4.11 governs boundaries
  *required* to identify a component; here the surface step conveys the
  separation and the border only refines it. The test measures it but does not
  fail it, and this file records why.

The contrast validator means a future colour change that breaks legibility fails
CI, not review.

## Resilience — soak tests

`src/db/__tests__/soak.test.ts`:

- **Migration from every released version.** A tablet offline for months might be
  two versions behind. The ladder is exercised from v0 (fresh), v1, and v2 — each
  upgrades to the current version with its data intact and every store present.
- **Offline soak / reconcile.** A full shift's work — 40 closed orders, 5 price
  edits, and the closed shift — accumulates in the outbox offline, then one
  reconnect drains all 46 records, the queue empties, and the server holds each
  exactly once. Zero loss, zero duplicates.

These join the earlier headline test: 500 records pushed over a connection that
drops mid-batch, re-sent, zero duplicates.

## The CI gate

`npm run ci` runs `typecheck → guardrails → test → build`. The five custom lint
guardrails (logical direction, no literal design values, no raw strings, no
network under `/pos`, domain purity) fail the build, not a reviewer. The
production build confirms the architecture: **`/pos/*` prerender as static** (the
service-worker-cacheable offline shell) while **`/manager/*` are dynamic**
(cookie-authed) — the split is now enforced by the compiler, not convention.

Totals at the close of the build: **106 unit tests**, plus the 54 Django tests
from phase 1.

## Performance

The sub-200ms budget is met by construction, not by a timer: under `/pos` every
operation mutates an in-memory entity and repaints before the background
IndexedDB write resolves — there is no network and no blocking I/O on the paint
path, and there are no spinners (only skeletons while the first load reads from
IndexedDB). This was observed live in phase 7. A representative on-device
profile is left for the real hardware, where fake-indexeddb timing does not
apply.

## Deliberately not built, and why

- **`/r/[slug]` public landing page** — prepared, not built, exactly as the plan
  says. The route exists and refuses; the API already stores everything it will
  need (`RestaurantProfile`), so building it later is a rendering job, not a
  migration.
- **Visual-regression baselines** — pixel snapshots need a screenshot harness the
  environment here can't drive. Mitigated meanwhile by the logical-direction lint
  rule (RTL/LTR mirror for free) and the live RTL/LTR/theme checks run in phases
  4, 7 and 11.
- **The Capacitor Android shell** — the print transport contract (`TcpPrintService`)
  and the whole print queue are done and tested against a fake; wiring the native
  socket plugin and validating a real thermal printer (including Arabic code
  pages) is on-hardware work.
- **Full SSR prefetch/hydration for `/manager`** — the routes are dynamic shells
  with client Query islands, the common Next + Query shape; server prefetch is a
  refinement.
- **A live cross-process run against real Django** — PostgreSQL is unavailable
  here and SQLite is deliberately not a target. The client was verified end to
  end against a contract-compliant mock; the server's half of that same contract
  is covered by the phase-1 Django suite.
