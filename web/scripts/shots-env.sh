#!/usr/bin/env bash
# A throwaway system for the screenshots (docs/ui-profile.md, part C): a private
# PostgreSQL on :55440, the seed, the review data, and the monolith on :8765
# (gunicorn, four workers: the dev server stalls under parallel captures).
#
#   web/scripts/shots-env.sh up      # build and start; prints when it answers
#   web/scripts/shots-env.sh down    # stop both
#
# Needs `npm run build` done in web/ first. Never points at a real database.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="${SHOTS_STATE:-/tmp/orderak-shots}"
PGBIN="${PGBIN:-/opt/homebrew/bin}"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
export DATABASE_URL=postgres://sudanpos:sudanpos@localhost:55440/sudanpos_dev
export DJANGO_SETTINGS_MODULE=config.settings.dev

case "${1:-up}" in
  up)
    mkdir -p "$STATE"
    if [ ! -f "$STATE/pg/PG_VERSION" ]; then
      "$PGBIN/initdb" -D "$STATE/pg" -U postgres --auth=trust -E UTF8 --locale=en_US.UTF-8 >/dev/null
    fi
    "$PGBIN/pg_isready" -q -h localhost -p 55440 || "$PGBIN/pg_ctl" -D "$STATE/pg" -l "$STATE/pg.log" -o "-p 55440 -k /tmp" start -w >/dev/null
    "$PGBIN/psql" -h /tmp -p 55440 -U postgres -qtc "select 1 from pg_roles where rolname='sudanpos'" | grep -q 1 ||
      "$PGBIN/psql" -h /tmp -p 55440 -U postgres -qc "create role sudanpos login createdb password 'sudanpos'" -c "create database sudanpos owner sudanpos" -c "create database sudanpos_dev owner sudanpos"
    cd "$ROOT/api"
    PY=.venv/bin/python
    $PY manage.py migrate --noinput >/dev/null
    $PY manage.py createcachetable
    if [ "$($PY manage.py shell -c 'from apps.accounts.models import ManagerUser as U; print(U.objects.count())' 2>/dev/null | tail -1)" = "0" ]; then
      $PY manage.py seed >/dev/null
      $PY manage.py shell -c "from apps.profiles.models import RestaurantProfile as R; R.objects.update(online_ordering_enabled=True)" >/dev/null
      $PY manage.py shell < "$ROOT/web/scripts/shots-data.py" | tail -1
    fi
    if ! curl -s -m 3 -o /dev/null http://localhost:8765/healthz; then
      nohup .venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8765 --workers 4 --timeout 60 >"$STATE/gunicorn.log" 2>&1 &
      echo $! > "$STATE/gunicorn.pid"
    fi
    for _ in $(seq 1 60); do curl -s -m 3 -o /dev/null -w "" http://localhost:8765/healthz && { echo "answering on http://localhost:8765"; exit 0; }; sleep 1; done
    echo "the monolith did not answer; see $STATE/gunicorn.log" >&2; exit 1
    ;;
  down)
    [ -f "$STATE/gunicorn.pid" ] && kill "$(cat "$STATE/gunicorn.pid")" 2>/dev/null || true
    "$PGBIN/pg_ctl" -D "$STATE/pg" stop -m fast >/dev/null 2>&1 || true
    ;;
esac
