# Staff accounts, role routing, and the kitchen display

Three apps, one sign-in, four people. This records what changed and — more
usefully — the two design tensions it forced and how they were resolved.

## The surfaces

| URL | Who | How it gets data |
|---|---|---|
| `/` and `/r/<slug>` | anyone (visitors) | public, no auth |
| `/pos` | cashiers | IndexedDB, offline-first |
| `/kitchen` | kitchen | the server, polled |
| `/manager` | manager / owner | the server, TanStack Query |

`/` is now the **public landing page** — what a visitor should see. Staff reach
their own app by signing in at `/login`, which routes them by role
(`homeForRole`, the single place that decision lives). A cook who opens
`/manager` is returned to the kitchen board rather than shown an error.

## Seeded accounts

All with the password given to `manage.py seed --password`:

| Username | Role | Name | Lands on |
|---|---|---|---|
| `manager` | owner | | `/manager` |
| `cashier.day` | cashier | سمية | `/pos` |
| `cashier.night` | cashier | عمر | `/pos` |
| `kitchen` | kitchen | المطبخ | `/kitchen` |

Each cashier's `display_name` is snapshotted onto every order and shift they
take, so the day and night shifts are attributable to the person who worked
them. Handover is the sign-out button at the foot of the cashier rail.

## Tension 1 — staff logins vs. the offline promise

Cashiers signing in against the server conflicts with a tablet that must work
when the line is down. Resolved in `AuthProvider`:

- a successful sign-in **caches the identity locally**;
- on load we ask the server who we are, and a **401 signs you out** — that is a
  real answer;
- but a **network failure is not an answer**, so we keep the cached identity and
  carry on.

So a cashier who signed in this morning keeps working all shift offline. The
cost, stated plainly: **a device must reach the server once to sign a person
in.** The refresh cookie is long-lived for the same reason.

## Tension 2 — the kitchen needs live orders, but closed orders are immutable

The kitchen runs on its own device, so it can only show a ticket the server
knows about — which means orders must now reach the server when **fired**, not
only when paid. Two rules had to bend without breaking:

1. **`sent` orders are pushable.** The device's outbox queues `sent`, `closed`
   and `void`; orders still on the cashier's screen (`open`, `parked`) stay
   local.
2. **A live order may progress; a terminal one may not.** The server treats a
   re-pushed order as a duplicate *unless* the stored one is still live, in
   which case it is replaced by the device's newer truth. A closed or void order
   is history and is never touched — the guarantee that mattered is intact.

And the kitchen's own state is kept **separate from the bill**: `kitchen_status`
(`queued → preparing → ready → served`) is owned by the kitchen; `status`,
totals and payments are owned by the cashier. That separation is what lets a
cook mark food ready without ever mutating a synced order. The close push
carries the kitchen's field across untouched — pinned by a test, because
rebuilding the row from the device payload would otherwise reset a ticket the
kitchen had already marked ready.

## The kitchen display

Deliberately **online**: it polls every 10s, advances a ticket with one large
button, and shows food and timing but never money. Ageing colours escalate at 10
and 20 minutes. If the server cannot be reached it says so and keeps showing the
last board — and **the printed ticket remains the offline guarantee**, which is
why losing this screen is an inconvenience rather than a failure.

## Verified

Both suites green (**64 Django**, **106 web**), lint clean, and driven live on
the monolith:

- each of the four accounts authenticates with the right role and Arabic name;
- login routes kitchen → `/kitchen`, cashier → `/pos` (rail showing سمية),
  manager → `/manager`;
- the role guard returned a kitchen user off `/manager` to their own board;
- a `sent` order pushed from a device appeared on the kitchen board and advanced
  queued → قيد التحضير → جاهز → served, leaving the board;
- `/` renders the public landing (name, hours, menu, Arabic-Indic prices) from
  the no-slug public endpoint.

## Not done

- **The cashier PIN screen** is still absent — sign-in is username/password for
  every role. A fast PIN unlock over a cached identity would suit a busy till
  better, and the hashing for it already exists (`db/pin.ts`).
- **The kitchen has no sound or new-ticket alert**, which a real pass usually
  wants.
- **`/manager/login`** now just forwards to `/login`.
