# Orderak (اوردراك) — web

Next.js 15 (App Router) + TypeScript + Tailwind, built as a **static export**
(`output: 'export'`, `trailingSlash: true`) into `web/out`. There is no Next
server in production: Django serves `web/out` and the API on one origin
(`api/config/spa.py`). The deploy runbook is [`docs/DEPLOY.ar.md`](../docs/DEPLOY.ar.md).

## Run it

```bash
npm ci
npm run build        # next build, then stamps the till's worker (scripts/stamp-worker.mjs)
```

Then serve it through Django (see `api/README.md`): the working system is the
monolith, e.g. `http://localhost:8765`. `npm run dev` (port 3000) is for
interface work only — it has no `/api`.

## Checks (what CI runs)

```bash
npm run typecheck    # tsc --noEmit
npm run guardrails   # the project lint rules, zero warnings
npm run test         # vitest
npm run build
```

## The surfaces

| Route | Who | Network | Sign-in |
|---|---|---|---|
| `/` and `/r/<slug>/` | customers | the public API; the server writes the restaurant into the HTML | none |
| `/pos/*` | cashier | IndexedDB first; sync in the background; works offline | staff session |
| `/kitchen/`, `/deliveries/`, `/catalog/` | kitchen, floor | online | staff session |
| `/manager/*` | manager, owner | online (TanStack Query) | staff session |

One sign-in (`/login/`) for every role: a JWT in httpOnly cookies, CSRF on
writes; `role` decides where a person lands (`lib/http.ts`, `destinationAfterLogin`).

## The till offline

- **The service worker** (`public/pos-sw.js`) is served from the root with
  `Service-Worker-Allowed: /pos/` and claims `/pos/` only; it never intercepts
  `/api`, `/manager` or `/r`.
- **Install is all or nothing:** every till screen, its router payload and the
  code they name, or the install fails and the browser keeps the worker it has.
- **Every build is a new worker:** the build id is stamped into its cache
  version, so a deploy re-caches the whole till; the build before's code stays
  for pages still running it.
- **Orders are written to IndexedDB** with their outbox entry in one
  transaction (`src/db`, `src/sync`), and pushed when the network is back.

## Guardrails (`eslint-rules/`)

| Rule | Stops |
|---|---|
| `no-physical-direction` | `ml-`/`pr-`/`text-left`/`left-0` — Arabic is the default and RTL must mirror |
| `no-literal-design-values` | hex/rgb/`[13px]` — design tokens only (`src/styles/design-tokens.css`) |
| `no-raw-strings` | user-facing text in JSX — everything goes through i18n (`src/i18n/messages`) |
| `no-network-in-pos` | `fetch`/`useQuery` under `/pos` — the till reads IndexedDB |
| `domain-purity` | `src/domain` importing db, sync, React or the network |

The design system is documented in [`DESIGN-SYSTEM.md`](../docs/DESIGN-SYSTEM.md).
