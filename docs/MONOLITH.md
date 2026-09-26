# The monolith — one server, Django serves

The app now runs as a single process. Django serves the frontend, the API, and
the public landing page on one origin; there is no separate Node server.

## How it fits together

Django can't run Next's Node SSR, so the frontend is built as a **static export**
(`output: 'export'` → `web/out`) — a client-rendered SPA — and Django serves it:

```
Browser ─▶ Django (one origin)
             ├─ /admin/                    Django admin
             ├─ /healthz                   health check
             ├─ /api/v1/…                  the API (DRF)
             └─ everything else            web/out (config/spa.py)
                  ├─ /                      → /pos
                  ├─ /pos/…                 cashier PWA (offline, IndexedDB)
                  ├─ /manager/…             manager dashboard (TanStack Query)
                  └─ /r/<slug>/             public landing (client-fetched)
```

Being one origin **removed** three things: the Next `/api` proxy, CORS, and the
edge middleware. The browser calls Django directly with `credentials: 'include'`,
so the httpOnly auth cookies just work. The manager auth gate moved from
middleware to a client guard (`RequireManagerAuth`); `/r/<slug>` reads its slug
from the URL and fetches the published profile client-side, so any restaurant
works without a rebuild.

`config/spa.py` maps a request path to a file in `web/out` (directory routes →
`index.html`), serves one shell for every `/r/<slug>`, and sets the
`Service-Worker-Allowed` header on `pos-sw.js`.

## Run it (development)

Two steps — build the frontend once, then run the one server:

```bash
cd web && npm run build          # produces web/out
cd ../api && python manage.py runserver
```

Then open **http://127.0.0.1:8000** — it redirects to `/pos`. The manager is at
`/manager`, the landing at `/r/wisam-al-sham`. Rebuild the frontend (`npm run
build`) whenever you change UI code; Django serves the new `web/out` with no
restart. (For live UI hot-reload while developing, you can still run the old
two-server setup — `npm run dev` in `web/` — but that path uses a dev proxy and
is not the monolith.)

## Deploy (production)

One Render web service (see `render.yaml`): build the frontend, install and
migrate Django, `collectstatic`, and run gunicorn. PostgreSQL is the deploy
database; SQLite is dev-only. WhiteNoise serves Django admin's static in prod
(the product itself has no `/static` dependency).

## Trade-offs of the monolith

- **The landing page lost server-side rendering** — it is client-rendered now.
  Crawlers that run JavaScript still index it, but the initial HTML is a shell.
  This is the one real cost of Django serving a static export.
- **No Next dev server in the monolith path** — UI changes need a rebuild. The
  two-server dev workflow still exists for hot-reload during development.
- **The manager was already client-data** (TanStack Query), so it lost nothing
  functionally by becoming a static shell.

## Verified

Everything was driven on the single origin (port 8000): the root redirect,
`/pos`, the manager **login → dashboard** (cookie auth, real data), sidebar
navigation, the logout button, and the `/r/<slug>` landing rendering the
restaurant, hours, menu and Arabic-Indic prices — plus the service-worker header
and static assets. The web test suite (106) and lint stay green.
