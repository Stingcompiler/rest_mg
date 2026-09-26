# Being told something arrived

Two moments in this system happen *to* somebody rather than because they asked:

1. A customer places an order on the public site — **the cashier** needs to know.
2. A cashier sends an order to the kitchen — **the kitchen** needs to know.

Both were already visible if you happened to look at the right screen at the
right time. Neither said anything.

## How it works

No new infrastructure. Both boards already poll on a timer — the delivery queue
every 15 seconds, the kitchen every 10 — so the alert rides on the poll that was
already happening. What was missing was the comparison: *which of these rows was
not here last time.*

That lives in `web/src/lib/arrivals.ts`, free of any screen or browser API, with
two rules that matter more than they look:

- **The first look never announces.** Opening the board must not chime once per
  ticket already on it. With no history there is no news, only a starting point.
- **What was seen outlives the page.** A tablet that went to sleep should be told
  about the order that came in meanwhile, and told *once* — so the seen-set is
  kept in localStorage, capped at 300 ids.

The cap is why paging does not betray it: ids that have left the visible list
stay remembered, so turning to page 2 of the delivery queue and back does not
make page 1 arrive all over again.

## Three channels, because none of them is reliable alone

| Channel | Reaches | Fails when |
|---|---|---|
| Chime (WebAudio, two rising tones) | a cook not looking at the screen | the page has never been touched |
| Browser notice | somebody working in another tab | permission was not granted |
| Tab title `(3) …` + in-screen banner | anyone who glances over | nothing — this always works |

The sound is synthesised, not a shipped file: no asset, no request, no cache
entry on a device that may be offline for days.

## The browser rule that needs a button

A page may not make a sound until the person has interacted with it. A kitchen
tablet propped on a shelf and never touched will therefore stay silent through
an entire service, with nothing on screen explaining why.

That is why `AlertBell` has **three** states, not two: silenced by choice,
silenced by the browser and one tap from working (`فعِّل الصوت` — shown as a
primary button, because it needs pressing), or working. Pressing it is itself
the interaction the browser was waiting for, and the same press is when
permission for notices is requested — never unprompted.

## What counts as news

Only the rows that are genuinely somebody's turn:

- **Deliveries**: orders still `pending`. One already out with a rider is not
  something to be called to.
- **Kitchen**: tickets still `queued`. A ticket the cook is already cooking is
  not new.

## Timing

`sendToKitchen` already nudges the sync as soon as the write commits, so a ticket
reaches the server immediately rather than at the next background interval. The
kitchen board then notices it within its 10-second poll. Worst case from the
cashier's press to the kitchen's chime is about ten seconds; typically less.

## Reaching the cashier at the till

The cashier is not looking at the delivery queue. They are on `/pos` with a
customer in front of them, and that is where a waiting order has to show up.

`/pos` cannot fetch — the `no-network-in-pos` rule forbids it, because the till
is offline-first and its UI never awaits a request before painting. But the
**sync layer** is allowed the network and is already running a loop, so the
signal rides that:

```
customer orders  →  server  →  sync pull  →  PosProvider  →  rail badge + chime
```

The server adds `pending_deliveries` to the pull response: the **ids and numbers
only**, of orders still `pending`, for this branch. Deliberately as small as a
signal can be. `test_the_signal_carries_no_order_detail` will fail if it ever
grows a customer name or a total — that would mean orders had started travelling
*downward*, and the offline-first contract would be broken.

It is **current state, not a delta**. A badge has to be right on every run; sent
only on the poll where it changed, a till that missed one would show nothing.

### Three distinctions that carry the weight

**Unknown is not none.** `pendingDeliveries` is `undefined` when a run never
reached the server, and `null` on the till until sync has answered once. An
offline run reporting `[]` would clear a real count and tell the cashier nobody
is waiting; a first run treating `null` as `[]` would chime for every order
already on the board.

**No history is not empty history.** Opening a board for the first time is
silent — there is nothing to compare against, so there is no news. But *signing
in* writes an **empty** history rather than deleting the key, and an empty
history means everything currently waiting is new. That is what makes the alert
reach a cashier the moment they log in, instead of only for orders that happen
to arrive later. The day cashier's seen-set is not the night cashier's.

**A chime that cannot play is owed, not lost.** Sign-in is a full page
navigation, so the till arrives as a document nobody has touched — and no
browser will play audio in one. The badge and the tab title appear immediately
regardless; the sound is held and plays on the first tap, which on a till is the
first item rung up.

## Timing, end to end

| From | To | Delay |
|---|---|---|
| Cashier presses "send to kitchen" | kitchen chimes | **up to 5s** (push is immediate; the board polls at 5s) |
| Customer places an order online | till badge + chime | up to 30s (the sync loop) |
| Cashier signs in with orders already waiting | badge and title | first sync, ~1s |
| …and the sound | on the first tap | browser rule, unavoidable |

## Where each alert reaches you

| You are on | New customer order | New kitchen ticket |
|---|---|---|
| `/pos` (till) | badge on the rail + chime | — |
| `/deliveries` | banner + chime + notice | — |
| `/kitchen` | — | banner + chime + notice |
| another tab | browser notice, if permitted | browser notice, if permitted |
