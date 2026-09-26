# Running on a public domain through a Cloudflare tunnel

The app is a monolith: one Django process serves the API and the exported
frontend on one origin. A tunnel therefore needs to reach exactly one port, and
nothing about the frontend build changes — it calls the API with relative paths,
so it is correct on `127.0.0.1:8000` and on the public hostname alike, with no
rebuild and no `NEXT_PUBLIC_API_URL`.

## Run it

```powershell
.\scripts\run-tunnel.ps1
```

Then point the tunnel at `http://127.0.0.1:8000`.

Another hostname: `.\scripts\run-tunnel.ps1 -PublicHost other.example.com`.

## Why not the dev settings

A tunnel is not a shortcut to the machine; it is a door to the internet. With
`DEBUG = True` any unhandled error answers with a page carrying the traceback,
the loaded settings and the `SECRET_KEY` — to whoever asked for it. So the script
runs `config.settings.tunnel`: production-shaped, but on the SQLite database dev
already uses, because the point of a tunnel is to show *this* machine's data.
Actual deployment stays PostgreSQL under `config.settings.prod`.

Consequences worth knowing before you rely on it:

- **The auth cookies are `Secure`.** Signing in works over `https://<host>`, and
  no longer over plain `http://192.168.x.x` on the restaurant's own network. If
  the tills need to keep working on the LAN without the tunnel, they need the dev
  settings or a certificate — not this module.
- **`/gallery` returns 404.** It is the development component bench and is gated
  out whenever `DEBUG` is off. That is the intended behaviour, not a fault.
- **A real `SECRET_KEY` is generated once** into `api/.secret-key` and reused, so
  sessions survive a restart. It is gitignored. Deleting it signs everyone out.

## How Django knows it is HTTPS

TLS terminates at Cloudflare, which then speaks plain HTTP to this process. The
only evidence of HTTPS is the `X-Forwarded-Proto` header the tunnel sets, so
`SECURE_PROXY_SSL_HEADER` trusts it.

That trust is safe **only because the server binds to loopback**, which is why
the script passes `127.0.0.1:8000` rather than `0.0.0.0`. On a publicly reachable
socket anyone could send that header and Django would believe them.

## Two settings that must name the host

Both are read from the environment by `config/settings/base.py`, and the script
fills them in:

- `ALLOWED_HOSTS` — without the hostname, every request is a `400`.
- `CSRF_TRUSTED_ORIGINS` — with the scheme (`https://…`). The DRF endpoints are
  CSRF-exempt, so the dashboard works without it; the Django admin does not.
