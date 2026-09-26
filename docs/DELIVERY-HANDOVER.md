# Who does what to a delivery order

A delivery order is touched by two people who cannot see each other's work: the
person at the front taking the call, and the kitchen. The order moves between
them, and the whole point of the design is that **only one of them has a move to
make at any moment**.

## The turns

| # | Whose turn | What happens | Field |
|---|---|---|---|
| 1 | Front of house | The order arrives from the public site and is **confirmed** | `delivery_status: pending → confirmed` |
| 2 | Kitchen | Starts cooking; front of house sees it, cannot set it | `kitchen_status: queued → preparing` (mirrors to `delivery_status: preparing`) |
| 3 | Kitchen | **Marks it ready.** This is the handover | `kitchen_status: → ready` |
| 4 | Front of house | Sends the rider out | `delivery_status: → out_for_delivery` |
| 5 | Front of house | Marks it delivered | `delivery_status: → delivered` |

Cancelling is available to front of house at any live step, including while the
food is cooking — a customer who rings to cancel must not have to wait for the
kitchen.

## The two rules that keep the roles apart

**Front of house never says food is being cooked.** `preparing` is a statement
about a room the cashier cannot see. It is refused with `kitchen_owned_status`
and instead arrives on its own when the kitchen advances its ticket.

**Front of house never dispatches food the kitchen has not finished.** This was
the gap. Sending a rider out is front-of-house's move, but it is also a claim
that there *is* food to send, and only the kitchen can make that claim. Until
`kitchen_status` reads `ready` (or `served`, which is further along, not less),
the attempt is refused with `kitchen_not_ready`.

Without the second rule the two roles overlapped in time: the cashier could walk
an order from `confirmed` straight to `out_for_delivery` and `delivered` while
the kitchen was still cooking it. Nothing errored, nothing was logged as wrong,
and the first sign of trouble was a customer receiving nothing.

## On the screen

The delivery queue splits the live orders into **دورك الآن** (your turn) and
**عند المطبخ** (with the kitchen). Both stay visible — front of house still
answers the phone about an order that is cooking — but the ones actually waiting
on the reader come first instead of being buried among the ones there is nothing
to do about yet.

On a card that is waiting, the dispatch button is not shown at all. It is not
disabled and it is not an error: it is simply not this person's turn, said in
words, so nobody stands there clicking a dead control.

If the server refuses anyway — two people on two tablets, one of them a moment
behind — the refusal is now shown on the card in the reader's language. It used
to be swallowed silently, which is how the same click gets tried five times.

## What the kitchen does *not* get

The kitchen screen touches `kitchen_status` and nothing else. It has no delivery
controls, no financial controls, and no way to cancel an order. The three
lifecycles stay separate on purpose:

- `status` — the financial life of the bill, the cashier's, immutable once closed
- `kitchen_status` — the preparation life of the ticket, the kitchen's
- `delivery_status` — the fulfilment life, front-of-house's

`KITCHEN_READY_STATUSES` in `apps/orders/views.py` is the one place the second
lifecycle constrains the third, and it constrains exactly one transition.

## Tests

`tests/test_delivery_status.py` holds the boundary:

- dispatching before ready is refused, and the status does not move
- dispatch opens the moment the kitchen says ready
- `preparing` is not `ready` — started is not finished
- an already-`served` ticket can still be dispatched, so nothing strands
- cancelling never waits for the kitchen
