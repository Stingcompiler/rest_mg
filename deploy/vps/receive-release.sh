#!/bin/bash
# Receive a release on the server and make it live (batch 37).
#
# Installed as /opt/orderak/bin/receive-release (root, 0755). Run by the deploy
# workflow through deploy-entry, with the archive (api/ and the built web/out)
# on standard input:
#
#   receive-release <commit> < orderak-<commit>.tgz
#
# Layout (docs/DEPLOY.ar.md, the VPS section): each release in
# /opt/orderak/releases/<commit>, `current` pointing at the live one, one venv,
# one env file, media outside the releases. Every check runs before the switch;
# after it, a release that does not answer /healthz is rolled back.
set -euo pipefail

REL="${1:-}"
if ! [[ "$REL" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "refused: release must be a commit hash" >&2
  exit 2
fi

BASE=/opt/orderak
DIR="$BASE/releases/$REL"
KEEP=5
HEALTH="http://127.0.0.1:8200/healthz"

log() { echo "[deploy $REL] $*"; }

# One deploy at a time, even if two arrive together.
exec 9>/run/lock/orderak-deploy.lock
flock -w 600 9

ARCHIVE=$(mktemp /tmp/orderak-release.XXXXXX)
trap 'rm -f "$ARCHIVE"' EXIT
cat > "$ARCHIVE"
[ -s "$ARCHIVE" ] || { echo "refused: empty archive" >&2; exit 2; }

log "unpacking"
rm -rf "$DIR.new"
mkdir -p "$DIR.new"
tar -xzf "$ARCHIVE" -C "$DIR.new" --no-same-owner
[ -f "$DIR.new/api/manage.py" ] && [ -f "$DIR.new/web/out/index.html" ] || { echo "refused: archive lacks api/ or web/out" >&2; rm -rf "$DIR.new"; exit 2; }
rm -rf "$DIR"
mv "$DIR.new" "$DIR"
chown -R orderak:orderak "$DIR"

log "installing requirements"
"$BASE/venv/bin/pip" install -q -r "$DIR/api/requirements.txt"

manage() {
  sudo -u orderak bash -c "set -a; . $BASE/env; set +a; cd $DIR/api && $BASE/venv/bin/python manage.py $*"
}
log "checking and migrating"
manage check --deploy --fail-level ERROR >/dev/null
manage migrate --noinput
manage collectstatic --noinput >/dev/null
manage createcachetable
manage check --tag single_branch
manage flushexpiredtokens

PREV=$(readlink -f "$BASE/current" || true)
log "switching from ${PREV##*/} to $REL"
ln -sfn "$DIR" "$BASE/current"
systemctl restart orderak-web

healthy=false
for _ in $(seq 1 15); do
  sleep 2
  if curl -sf -H "Host: orderak.stingdev.pro" -H "X-Forwarded-Proto: https" "$HEALTH" >/dev/null; then
    healthy=true
    break
  fi
done

if ! $healthy; then
  log "health check failed — rolling back to ${PREV##*/}"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$BASE/current"
    systemctl restart orderak-web
  fi
  exit 1
fi

# Keep the newest releases (and always the live one); the rest only fill the disk.
cd "$BASE/releases"
ls -1t | grep -vx "$REL" | tail -n +"$KEEP" | while read -r old; do
  [ "$BASE/releases/$old" = "$PREV" ] && continue
  rm -rf -- "$BASE/releases/$old"
done

log "live"
