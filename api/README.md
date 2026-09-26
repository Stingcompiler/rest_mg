# Sudan POS — API

Django 5 + DRF. PostgreSQL only.

## Run it

```bash
pip install -r requirements.txt
cp .env.example .env          # then point DATABASE_URL at your PostgreSQL
export DJANGO_SETTINGS_MODULE=config.settings.dev
python manage.py migrate
python manage.py seed --password 'something-long'
python manage.py runserver
```

`seed` prints a device token exactly once — that is the tablet's credential.

## Tests

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/sudanpos \
DJANGO_SETTINGS_MODULE=config.settings.test python manage.py test tests
```

With no PostgreSQL reachable the suite falls back to in-memory SQLite and says
so. That fallback is a local convenience; CI and pre-merge runs must point at
PostgreSQL.

## Shape of the thing

Two audiences, two authentication schemes, and they never mix:

| Surface | Who | Credential |
|---|---|---|
| `/api/v1/sync/push`, `/api/v1/sync/pull` | cashier tablets | `Authorization: Device <token>` |
| everything else | manager dashboard | JWT in httpOnly cookies |

The cashier's PIN never reaches this API. It is checked on the device against a
hash in IndexedDB. What the server authenticates is the *tablet*, so a lost one
can be revoked without touching anyone's login.

Every ViewSet is a plain `viewsets.ViewSet` with hand-written actions — no
mixins, no `ModelViewSet`. What an endpoint does is in the method body.

## Rules the API enforces, not just the client

- Client-generated UUID primary keys. A record without an id is refused.
- No hard deletes: `delete()` raises on the instance and on the queryset.
- Money is `BigIntegerField` in minor units and crosses the wire as a **string**
  — a JSON number loses precision past 2^53, which severe inflation reaches.
- Only closed or void orders are accepted; an order cannot close while an amount
  is due; credit (آجل) settles the balance but is excluded from expected cash.
- A pushed record whose id already exists is reported `duplicate` and nothing is
  written. Replaying a batch after a dropped connection is normal.
- A closed order is never mutated. Corrections arrive as new reversing records.
- One transaction per record: a rejected row never wedges the rest of a batch.
- The pull cursor is the *server's* clock. Tablets sit offline for days and their
  clocks drift; filtering on a device timestamp would silently skip rows.
