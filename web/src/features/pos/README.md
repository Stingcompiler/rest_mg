# `src/features/pos` — the cashier screens

Order entry, payment, and shift close, wired to the domain and IndexedDB. No
network on any path here — the `no-network-in-pos` lint rule enforces it, and the
only way finished work reaches the server is the background outbox (phase 10).

## How state flows

`PosProvider` is the hub. It loads once from IndexedDB on mount — the menu, any
open carts left on the device, and the active shift with its closed orders
re-attached so expected cash is correct after a reload. It holds the live domain
entities (`CartSession`, `Shift`) in refs and re-renders by bumping a version.

Every action follows the same shape: **mutate the entity, repaint, then persist
in the background.** The screen updates from the in-memory entity the instant a
tap lands; the write to IndexedDB happens after, off the paint path. The two
durability-critical transitions — closing an order and closing the shift — do
await their write, so a receipt is never printed before the record is safe.

```
tap → entity method (guards the rule) → setState (instant paint) → repository.save (background)
```

The money boundary is `src/db/mappers.ts`: entities reason in `bigint`, records
store strings. Entity → record on save, record → entity on load.

## The three screens

- **OrderEntryScreen** — rail · item grid · cart. Search, category tabs,
  multi-cart tabs, a live cart with quantity steppers, totals, send-to-kitchen
  and pay. Tapping an item merges into the existing line rather than duplicating.
- **PaymentScreen** — method cards, quick cash, keypad; a running bill with
  split-payment progress, recorded payments, remaining and change. The close is
  disabled until the balance is covered.
- **ShiftCloseScreen** — denomination count on the start side; expected cash and
  the variance callout on the end side. The close is disabled while any order is
  open or a variance beyond tolerance has no reason — the `Shift` entity decides,
  the button reflects it.

## Verified in the browser

A full order was driven end to end:

- the seeded menu rendered from IndexedDB; adding items updated the cart and
  persisted (money as strings, `itemCount` denormalised);
- the open order survived a full page reload — rehydrated through
  `Shift.fromSnapshot` and the order mapper;
- a split payment of 20,000 + 20,000 settled a 40,000 bill; the progress went
  0% → 100%, and the close button enabled exactly when the remaining hit zero;
- closing the bill wrote the order as `closed` **and queued exactly one outbox
  entry in the same transaction** — the terminal-order sync invariant, working
  through the whole stack.

## Known simplifications, to revisit

- **Bank/wallet references and the credit customer are placeholders.** Cash and
  credit are one-tap; a proper reference / customer-picker dialog is a small
  follow-up. The split-payment maths and the close gate are fully real.
- **Order type** is display-only for now; the `Order` entity supports it, the
  setter wiring is pending.
- **No PIN unlock / cashier-switch screen yet** — a default cashier is used.
  Flagged in the review as missing from both spec and mockups.
- **Dev-mode Fast Refresh** performs a full reload when `PosProvider` is edited
  (it exports both a component and the `usePos` hook), which transiently drops
  the context. This is a dev-only artifact; in-app navigation and production
  builds are unaffected. Splitting the hook into its own module would smooth the
  dev experience.
