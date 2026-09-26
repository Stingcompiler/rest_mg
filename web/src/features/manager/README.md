# `src/features/manager` — the dashboard

The online half of the app, and the opposite of `/pos` in every way. Where the
cashier reads and writes IndexedDB and never touches the network, the manager
reads the network through TanStack Query and never touches IndexedDB. Same
tokens, both locales, both themes.

## Auth

Sign-in posts credentials to the API, which sets the JWT in **httpOnly cookies**
— the token never reaches this JavaScript. `middleware.ts` guards `/manager/*`:
no cookie means a redirect to `/manager/login?next=…`. Every request carries
`credentials: 'include'`, so the cookies ride along and the token stays out of
reach. A 401 is never retried; the query owner sends the manager back to sign in.

## The screens

- **Dashboard** — revenue KPIs (collected apart from credit) and a payment-mix
  share bar, from `reports/revenue`.
- **Reports** — the recent orders, read-only; the server never edits an order.
- **Profile** — the restaurant profile editor, the source the future public
  landing page renders from; the publish toggle flips `landing_page_enabled`.
- **Devices** — enrol a tablet (the token is shown exactly once) and revoke a
  lost one (which locks it out of sync immediately).

## The proxy

Requests go to the same-origin Next `/api` route, which attaches nothing of its
own and forwards to Django — the one place errors get a stable shape. Two things
it must get right, both fixed and now covered:

- **Trailing slash.** DRF routers require it; Next strips it (to avoid a 308 on
  the client). So the client calls without one and the proxy adds exactly one
  back before forwarding.
- **`Set-Cookie`.** Login returns two (access + refresh). The Web `Headers` API
  folds multiple `Set-Cookie` into one comma-joined value, which corrupts
  cookies — the proxy relays them with `getSetCookie()` so they arrive intact.

## Verified

Typecheck, lint, and the 88-test suite are green. The whole surface was driven
end to end in the browser through the **real proxy and real cookie auth**,
against a contract-compliant mock standing in for Django (PostgreSQL is
unavailable in this environment; the server's own behaviour is covered by the
phase-1 Django suite):

- unauthenticated `/manager` → redirected to login by the middleware;
- login → cookies set → dashboard renders live KPIs (collected 1,049,000, 74
  orders, avg 14,176, credit 140,000 apart) and the four-method pay mix;
- the profile editor loaded real data, toggled publish, and saved via PUT;
- a device was enrolled (token shown once) and another revoked (→ ملغى).

## Not done here

Full SSR data prefetch/hydration is not wired — the routes are dynamic server
shells with client-side TanStack Query islands, which is the common Next + Query
shape. Refresh-token rotation lives server-side (Django, phase 1); the client
simply re-authenticates on a 401.
