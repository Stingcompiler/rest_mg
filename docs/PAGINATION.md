# Paging the lists that have no ceiling

Seven lists in this system grow forever. Every one of them used to answer with a
hard slice — the newest 50, 100, 200 — and no way to ask for anything older. That
is not a page. It is a truncation the reader cannot see, and it quietly puts
history out of reach: an order from last month, a debt from before the cut-off,
the activity entry that explains what went wrong.

## What is paged, and what is not

| Surface | Where | Grows with |
|---|---|---|
| Activity log | `/manager/activity` | every action anyone takes |
| Sales / orders | `/manager/reports` | every bill |
| Delivery queue | `/deliveries` | every online order |
| Customers | `/manager/customers` | every credit customer |
| Customer statement | statement sheet | one customer's whole history |
| Sync queue | `/pos/sync` | records waiting while offline |
| Reprint receipts | `/pos/report` | bills closed today |

Deliberately **not** paged, because each is bounded by something real: staff and
devices (the people who work there), menu items and categories (the size of the
menu — and the till needs all of them offline anyway), kitchen tickets (only what
is open), the restaurant profile (one).

## The envelope

Every paged endpoint answers the same shape, built by `page()` in
`apps/core/query.py`:

```json
{ "results": [...], "total": 8431, "limit": 50, "offset": 100, "next_offset": 150 }
```

`total` is what makes it a page rather than a slice — without it the screen
cannot say "101–150 of 8,431", and cannot know whether to offer another page.
`next_offset` is `null` on the last page, so no caller does that arithmetic
itself.

The customers list carries one extra field, `outstanding_minor`: the debt across
**every customer the filter matched**, not the ones on this page. The screen
shows it as a single headline figure, and summing the visible rows — correct
while the list was unpaged — would have quietly started understating the debt by
everything on page 2.

## Offset, not a cursor

A cursor needs one stable ordering key per endpoint, and these lists are ordered
by whatever the screen asked for: a balance, a date, an order number. Offset
paging costs one known thing — a row inserted while the manager is between pages
can shift the window and repeat or skip an entry. For a single restaurant's
history, read by one person at a time, that is the right trade.

## Paging that would have been cosmetic

The customers list computed each balance in Python, one pair of queries per
customer, then sorted the result in memory. Paging the *response* alone would
have hidden the cost while doing exactly as much work — reading every customer in
the branch to show fifty.

So the balances are annotated in SQL (`_with_balances`) and the ordering is the
database's. A page is now a fixed number of queries regardless of how many
customers exist, and page 2 continues page 1 instead of re-sorting a fresh
slice. `test_reading_a_page_does_not_cost_a_query_per_customer` holds that line.

The customer statement is the deliberate exception: charges and settlements come
from two tables and must be merged before they can be ordered, so that one slices
after the merge. It is bounded by a single customer's history, which is a fair
size to hold in memory.

## On the client

`web/src/lib/paging.ts` holds the arithmetic, deliberately free of any screen —
`pageWindow` for a server envelope, `pageLocal` for a list already in memory, so
a screen paging IndexedDB is written the same way as one paging Django. Both hand
the same `PageWindow` to one `<Pager>`.

Two details worth keeping:

- **`clampOffset`.** The sync queue drains and the day's bills accumulate while
  somebody is looking at them. Staying on a page that no longer exists shows an
  empty list with no way back, so the offset steps to the last page that exists.
- **`keepPreviousData`.** The current page stays on screen while the next one
  loads, so paging does not flash an empty list between clicks — and the delivery
  queue's 15-second poll never blanks the page a cashier is reading.

## Why the sync queue in particular

A till that has been off the line through a busy day can hold thousands of
queued records. Rendering all of them at once is how a cheap Android tablet stops
responding — on the very screen someone opened *because* sync was already going
wrong.
