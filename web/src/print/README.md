# `src/print` — thermal printing

Network thermal printers, 80mm, ESC/POS, two destinations (cashier + kitchen).
The kitchen ticket prints on send, before payment; the final receipt only once
the amount due reaches zero. The rule that shapes everything here is **persist
before print, always** — a print is never on the critical path, and a dead
printer never blocks a close.

## The transport seam

Browsers cannot open a raw TCP socket, so the real transport is a native socket
in the Capacitor Android shell (decision 1 in `docs/PLAN.md`), reached on port
9100. The app codes against the `PrintService` interface, never a socket:

- `TcpPrintService` — the real one; connects through a Capacitor TCP plugin.
  When the plugin is absent (a plain browser), it fails, so jobs stay queued
  rather than vanish.
- `FakePrintService` — in-memory, for tests and the dev preview. Records what it
  was asked to print and can be told to fail.

`getPrintService()` picks the right one for the environment.

## The queue is the point

`queue.ts` is the phase's real work. A job is rendered to ESC/POS bytes and
written to IndexedDB (`printJobs`, migration v3) **before any send is attempted**:

```
order saved → job enqueued (durable) → send attempted (background)
```

If the printer is unreachable the job stays queued and is retried with
exponential backoff (2ⁿ s, capped at a minute). The pump drains on an interval
and on reconnect. `drainPrintQueue` never throws — the worst case is that a job
waits for the next run.

## ESC/POS and Arabic

`escpos.ts` builds the byte stream (init, code page, alignment, bold, size, feed,
cut); `document.ts` lays out a block model — a `row` justifies a name against an
amount, mirrored by direction, so one template prints correctly in Arabic and
English. Text is UTF-8 by default.

**Arabic on thermal printers is firmware-dependent.** ESC/POS has no bidi engine;
whether Arabic shapes and orders correctly depends on the printer's font and code
page. This layer selects the code page and right-aligns; a CP864 shaping table,
if a given printer needs one, is a per-device concern to validate on hardware —
not baked in here.

## Verified

Unit tests pin the queue's promises — persist-before-print, retry-and-backoff,
drain-on-recovery, and never-throws. And end to end in the browser, with the fake
transport forced offline:

- sending to the kitchen with the printer offline **did not block**; a 158-byte
  ticket was persisted to `printJobs` with `attempts: 1`, `lastError: "printer
  offline"`;
- bringing the printer back and firing a reconnect **drained the queue to zero**
  and sent the ticket;
- the decoded bytes are a real ESC/POS kitchen ticket — `ESC @`, centred
  `المطبخ`, order number, type, time, divider, cut.
