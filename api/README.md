# Orderak (اوردراك) — API

Django 5 + DRF on PostgreSQL 16. One process serves the API, the exported web
app (`web/out`, via `config/spa.py`) and uploaded media. Production runs on the
VPS behind Caddy and deploys on every merge to `main` — see
[`docs/DEPLOY.ar.md`](../docs/DEPLOY.ar.md) §11.

## Run it

```bash
pip install -r requirements.txt
export DATABASE_URL=postgres://user:pass@localhost:5432/sudanpos
export DJANGO_SETTINGS_MODULE=config.settings.dev
python manage.py migrate
python manage.py createcachetable
python manage.py seed --password 'something-long'   # a branch, staff, a device and a sample menu
python manage.py runserver 8765                     # after `npm run build` in web/
```

`seed` gives every seeded account the password you pass, and prints the
device token once.

## Tests

```bash
REQUIRE_POSTGRES_FOR_TESTS=1 \
DATABASE_URL=postgres://user:pass@localhost:5432/sudanpos \
DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test --noinput
```

`REQUIRE_POSTGRES_FOR_TESTS=1` refuses to fall back to SQLite; CI sets it. Some
tests read `web/out`, so build the web app first.

## Who signs in, and how

| Who | Credential | Reaches |
|---|---|---|
| staff (owner, manager, cashier, kitchen) | JWT in httpOnly cookies from `/api/v1/auth/login/`; CSRF on writes | their role's endpoints |
| a till tablet | `Authorization: Device <token>` | `/api/v1/sync/push`, `/api/v1/sync/pull` |
| customers | none | `/api/v1/public/…` (rate limited) |

Sync accepts a device token **or** a cashier's or manager's session. Changing a
password, deactivating someone or «sign out everywhere» raises the person's
`session_version` and ends every session they had; only an owner changes an
owner's account.

Every ViewSet is a plain `viewsets.ViewSet` with hand-written actions — what an
endpoint does is in the method body.

## Rules the API enforces, not just the client

- Client-generated UUID primary keys; no hard deletes (`delete()` raises).
- Money is `BigIntegerField` in minor units and crosses the wire as a string.
- An order record is read, checked and written under a row lock: two tills
  cannot both collect the same website order.
- A repayment carries an `Idempotency-Key`; a retry is recorded once.
- A pushed record already on the server is a `duplicate`, except a live order
  that may still progress; a closed or void order is never changed.
- One transaction per record: a rejected row never wedges the rest of a batch.
- The pull cursor is the server's clock, never a device's.
- `/healthz` checks the database and the built frontend (503 naming the part
  that failed); the deploy rolls back and the monitor alerts on it.
