# Orderak (اوردراك) — web

Next.js 15 (App Router) + TypeScript + Tailwind. One app, three surfaces that
never blur into each other.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000/pos
```

Point it at the API with `API_BASE_URL` (defaults to `http://localhost:8000`).

## Checks

```bash
npm run typecheck    # tsc --noEmit
npm run guardrails   # the five project lint rules, zero tolerance
npm run build        # /pos must build as Static, /manager as Dynamic
```

## The three surfaces

| Route | Rendering | Network | Auth |
|---|---|---|---|
| `/pos/*` | **Static** shell, client components below | IndexedDB only; sync is background | local PIN (phase 5) |
| `/manager/*` | **Dynamic** (SSR) | TanStack Query (phase 11) | JWT in httpOnly cookies |
| `/r/[slug]` | prepared, returns 404 | — | public (later) |
| `/api/*` | proxy to Django | — | passes through |

The build output is the proof: `/pos` prints `○ (Static)`, everything else
`ƒ (Dynamic)`. If a fetch or a dynamic API ever leaks into `/pos`, the
`force-static` in its layout turns that into a build failure rather than a
silent network dependency on the till's critical path.

## Why the boundaries are where they are

- **`middleware.ts` matches `/manager/:path*` and nothing else.** `/pos` is
  absent on purpose — the cashier authenticates locally against a PIN hash in
  IndexedDB, on a tablet in a restaurant with no internet. It must never wait on
  an edge round trip to decide whether it may paint.
- **The service worker scopes to `/pos/`.** It is served from the root (so it
  updates independently) with `Service-Worker-Allowed: /pos/`, and never
  intercepts `/manager`, `/r` or `/api`: a cached API response is
  indistinguishable from a fresh one, and the dashboard must not be served a
  stale shell.
- **The `/api` proxy attaches credentials and normalises errors, nothing more.**
  No business rule lives in two places. `/pos` never calls it.

## Guardrails (`eslint-rules/`)

Five rules, each fired against a deliberate violation before being trusted:

| Rule | Stops |
|---|---|
| `no-physical-direction` | `ml-`/`pr-`/`text-left`/`left-0` in `className` — Arabic is default and RTL must mirror |
| `no-literal-design-values` | hex/rgb/`[13px]` in `className` or `style` — literals ignore the theme |
| `no-raw-strings` | user-facing text in JSX — everything goes through i18n |
| `no-network-in-pos` | `fetch`/`useQuery`/axios under `/pos` — the till reads IndexedDB |
| `domain-purity` | `src/domain` importing db, sync, React or the network |

## Not built yet

Theme and locale here are the minimum the skeleton needs — a blocking script that
sets `data-theme` before first paint, `dir`/`lang` on `<html>`, and a tiny `t()`
over JSON catalogues. Phase 4 replaces the *mechanism* (locale detection,
provider, numeral and money formatters) but not the discipline: no user-facing
string is written into a component, starting now.
