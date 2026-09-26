# Four fixes: kitchen delivery, display settings, staff admin

Notes on what was wrong and why, because three of the four were real defects
rather than missing features — and two of them would have bitten in production.

## 1. Orders never reached the kitchen — four separate causes

This looked like one bug and was four, each hidden behind the last.

**a. No device token, so sync never ran.** The engine skipped entirely without
one, and nothing in the UI could provision it. Now sync accepts **either** an
enrolled device token **or a signed-in cashier's cookies** — so a tablet works
the moment someone logs in, with nothing to paste by hand. The token remains for
an unattended device with nobody signed in.

**b. `sent` orders were never queued.** The outbox only queued terminal orders
(closed, void), so a fired ticket stayed on the device. `sent` is now pushable —
and the server had to learn that a *live* order may progress (sent → closed)
while a **closed or void one is still never mutated**. That distinction is
tested, including that closing does not reset a ticket the kitchen already
marked ready.

**c. A race: sync fired before the write landed.** `sendToKitchen` persisted
fire-and-forget and called sync immediately, so sync found an empty queue and
the kitchen waited a full interval. The sync now sequences after the write
commits.

**d. The bootstrap menu used readable ids.** `it-shawarma-beef` is not a UUID,
and the server rejected every line: *"item_id: Must be a valid UUID"*. The
project's own rule is that all ids are client-generated UUIDs; the local seed
violated it. Fixed with stable UUIDs.

**Verified end to end:** cashier signs in → pushes a fired order over cookie
auth with no device token → the kitchen board shows `3007 [queued] 1x كبدة
إسكندراني` → advances to preparing.

## 2. Sessions expired after 15 minutes and nothing recovered

Found while chasing the above: the access cookie lasts minutes, the refresh
cookie a week, and **nothing ever called refresh**. A till open for a quarter of
an hour started getting 401s on everything — including its sync — and silently
stopped talking to the server while happily taking orders.

`fetchWithSession` now renews once and retries on a 401, shared by the API
client and the sync transport, with concurrent callers sharing one in-flight
refresh. This was invisible in unit tests and only surfaced in a long-running
browser session.

## 3. The service worker broke the app after every deploy

The shell was cached **cache-first**, and the shell names content-hashed chunks.
After a rebuild, a tablet holding yesterday's shell asked for chunks that no
longer existed and the app failed to boot with a `ChunkLoadError`. That is a
deployment hazard, not a dev annoyance — every tablet would break on every
release.

The shell is now **network-first with a cache fallback**: fresh when there is a
network, cached when there is not. Hashed assets stay cache-first, which is safe
because they are content-addressed.

## 4. Display settings and staff admin (the missing features)

- **Settings menu** — theme, language, numerals, in the header of all three
  apps. They had existed only in a phase-4 harness that a later screen replaced.
  The three are independent on purpose: an Arabic cashier may want Western
  digits. Verified: theme → light, locale → English (direction flipped), and
  numerals → Western, each persisting.
- **Staff admin** — `/manager/staff`, where a manager creates the day cashier,
  the night cashier and the kitchen account, assigns a role, and deactivates
  someone who leaves. Accounts are never deleted, so old orders stay
  attributable. An owner is not assignable here: a manager creates staff, not
  peers above them.

## A note on the `????` names

Creating a user with an Arabic name **through curl on Windows** stored `????`,
because the shell mangled the JSON body before Django saw it. The same creation
**through the browser** stored `حواء` correctly. It was a test-harness artifact,
not an app bug — confirmed by comparing stored codepoints (`0x3f` vs `0x633`).
Both scratch accounts were deactivated afterwards.

## Status

Django **64 tests**, web **106 tests**, lint and typecheck clean.

Two test timeouts were raised rather than papered over: the 500-record sync test
and the PBKDF2 PIN test are both slow *by design*, and were only failing under
parallel load.

## 5. A manager signing in landed on the kitchen board

Reported after the above, and a genuine defect with two halves:

- `LoginScreen` honoured `?next` **unconditionally**, and
- the kitchen guard permits `manager`/`owner` (deliberately — a manager may look
  at the pass), so a manager who arrived there was not bounced back.

The `?next` is written by whoever was bounced to the login page **last**, which
on a shared terminal is usually a different person. A cook signing out of the
kitchen — or anyone opening `/kitchen/` while signed out — leaves
`next=/kitchen/` on the login URL. The manager who signed in next inherited it.

`destinationAfterLogin(next, role)` now honours a `next` only when it lies
inside that role's own area, and otherwise falls back to the role's home. Deep
links a person is entitled to (`/manager/staff`) still work, and a manager can
still *deliberately* navigate to the kitchen board — they simply are not carried
there by someone else's leftover parameter.

The same helper refuses anything scheme- or host-shaped (`//evil.example`,
`https://…`, `javascript:`), closing an open redirect that the parameter would
otherwise have allowed.

Five tests pin it, including the reported case. Verified live: opening
`/kitchen/` signed out produced `/login/?next=%2Fkitchen%2F`; signing in there
as the manager landed on `/manager/`; and the manager could still reach
`/kitchen/` by choosing to.

## 6. Editing users, and an activity log

Two related additions, built together because the log is a by-product of the
edits, not a separate thing.

**Editing.** The staff screen now edits a person in place — display name,
username, role, or a password reset — alongside the existing create and
deactivate, plus **reactivate** for someone who returns. The edit is a partial
PATCH: the client sends only the fields that changed, and a no-op edit writes
nothing. A username collision is refused, and a manager still cannot deactivate
their own account (which would also orphan the log's actor).

**The activity log** (`apps/audit`). A small, append-only record of who did what
to whom:

- **Append-only and immutable.** An entry is written once; `save()` on an
  existing row and `delete()` both raise. It does not inherit `BaseModel` — it is
  server-born, not a device-owned syncable record — and its pk is a
  `BigAutoField` precisely so insertion order is deterministic even when two
  entries share a timestamp (a random UUID could not order the log).
- **Actor and target by id *and* name snapshot**, so the entry still reads
  correctly after someone is renamed.
- **The edit diff is the log's content.** `update` computes the before/after of
  each changed field and stores it — `{"role": ["cashier", "kitchen"]}` — so the
  log shows exactly what changed with no per-field columns. A password reset is
  recorded as having happened, never with the value.
- **Writing the log never breaks the logged action.** `audit.record` swallows
  and reports its own failure; renaming a cashier will not 500 because the log
  table hiccuped.
- **Manager-only and branch-scoped.** A cashier gets 403; a manager sees only
  their own branch's entries.

It surfaces in two places, one component (`ActivityLog`): the full list under the
staff screen, and the recent tail on the dashboard overview. Each entry renders
as a sentence in the viewer's language — role codes in a diff are themselves
translated (`role.cashier` → كاشير) — with who did it and a Western,
LTR timestamp.

**17 new Django tests** (81 total). Verified live through the UI: editing سمية
recorded *"عدّل بيانات … · بواسطة المدير | الاسم المعروض: سمية → …"* with the
field diff, and the same entry appeared on the dashboard tail.

## 7. Mobile layout

The management and public surfaces now work on a phone, not just a desktop or
tablet. Scoped by who actually holds the device:

- **Manager dashboard** — the real work. The fixed sidebar rail (`lg` and up)
  becomes an **off-canvas drawer** below `lg`: a header hamburger opens it, and a
  tap on the backdrop, on a destination, or Escape closes it. The drawer slides
  from the **start edge** (`start-0`), so it comes from the right in Arabic and
  the left in English with neither hardcoded — verified both ways. The KPI grid
  goes 4 → 2 columns, and every two-column form (add/edit staff, profile)
  collapses to one. A staff row wraps its buttons to a second line rather than
  overflowing.
- **Kitchen** — the ticket grid goes 1 / 2 / 3 columns across phone / tablet /
  wide. The header drops the signed-in name and clock first when space runs
  short, keeping the title, settings, and sign-out.
- **Landing and login** — already mobile-first (`max-w-md`, centred); left as-is.

**The cashier POS was deliberately left as a tablet-first app.** It shows the
menu, a live cart, and a keypad at once, offline — a phone reflow is a real
redesign against its design intent, and a till runs on a fixed tablet. Say the
word if you want it tackled.

Verified live at 375px: no horizontal scroll on any surface; the rail hides and
the hamburger appears; the drawer opens on the correct edge in both languages,
and a tap navigates and closes it; at 1280px the rail is back and the hamburger
is gone. Two i18n keys added (`manager.nav.open`/`close`), catalogs still
key-identical. Web 111 tests, tsc and lint clean.

## 8. Mobile layout — the cashier POS

The cashier was the one surface left as tablet-first in §7. It is now reflowed
for a phone too, without losing the tablet geometry it was designed around.

The hard part is that the till screen is three columns at once — a navigation
rail, the menu, and a live cart — and all three matter. The reflow:

- **The rail becomes a bottom nav bar.** `NavRail` is a vertical side rail from
  `md` up and a fixed, full-width **bottom bar** below it — thumb-reachable, the
  phone convention. Its five destinations plus sign-out share the bar evenly;
  the desktop-only offline label is dropped (the header already carries the
  online/offline chip). One shared component, so all five POS screens get it,
  and each screen's content gains bottom padding to clear the fixed bar.
- **The cart becomes a summary bar + sheet.** On a phone the side cart is
  hidden. In its place a **summary bar** sits just above the bottom nav whenever
  the cart has items — a cart icon with a count badge, the label, and the
  **running total**, which is the one number a cashier must never lose. Tapping
  it opens the **full cart as a bottom sheet**: tabs, line-by-line steppers,
  actions, totals, send-to-kitchen and pay. The sheet's contents are the *same
  JSX* as the desktop panel — one source of truth, so the two never drift.
- **Grids reflow** — the menu goes 2 / 3 / 4 columns across phone / tablet /
  wide; open-orders 1 / 2 / 3; the daily report's KPIs 2 → 4 and its two panels
  stack. The **payment** and **shift-close** sub-flows (which have no rail, just
  a back button) stack their columns and scroll, with payment putting the total
  and confirm on top via `flex-col-reverse` so they lead on a small screen.

Verified live at 375px: no horizontal scroll; the bottom bar is fixed and
full-width with all six items; the side cart is hidden and the menu is two
columns; adding an item raises the summary bar (count ١, total ١٢٬٥٠٠) above the
nav; tapping it opens the sheet with the lines and Pay; Pay reaches the payment
screen, which stacks. At 1280px the original geometry is intact — a 92px side
rail, a 404px cart panel, and no mobile summary. One layout token added
(`--mobile-nav-height`), two i18n keys (`pos.cart.review`/`close`), catalogs
key-identical. Web 111 tests, tsc and lint clean.
