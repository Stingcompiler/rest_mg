#!/usr/bin/env bash
# Is Orderak up, and are its backups fresh? (batch 39)
#
# Installed as /usr/local/sbin/orderak-healthcheck, run every five minutes by
# orderak-healthcheck.timer as root (the alert script's secrets are root's).
# A failure sends one Telegram alert through the server's existing alert
# script, a reminder each hour while it lasts, and a message when it is over.
set -uo pipefail

STATE_DIR=/var/lib/orderak
STATE_FILE="$STATE_DIR/health.state"
REMIND_AFTER=3600
MAX_BACKUP_AGE=$((30 * 60 * 60))   # nightly, with slack
ALERT=/usr/local/sbin/vezano-telegram-alert
NOW=$(date +%s)
REASONS=()

fail() {
  REASONS+=("$1")
  logger -t orderak-healthcheck "FAIL: $1"
}

alert() {
  "$ALERT" "$1" || logger -t orderak-healthcheck "could not send the alert"
}

age_of() {  # seconds since the newest file matching $2 in $1, or nothing
  local newest
  newest=$(find "$1" -maxdepth 1 -type f -name "$2" -printf '%T@\n' 2>/dev/null | sort -nr | head -1)
  [ -n "$newest" ] && echo $(( NOW - ${newest%.*} ))
}

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

systemctl is-active --quiet orderak-web || fail "the orderak-web service is down"

curl -fsS --max-time 10 -H "Host: orderak.stingdev.pro" -H "X-Forwarded-Proto: https" \
  http://127.0.0.1:8200/healthz | grep -q '"ok"' || fail "the app does not answer /healthz"

curl -fsS --max-time 15 https://orderak.stingdev.pro/healthz | grep -q '"ok"' ||
  fail "https://orderak.stingdev.pro/healthz does not answer"

age=$(age_of /srv/backups/orderak 'db-*.dump')
if [ -z "$age" ] || (( age > MAX_BACKUP_AGE )); then
  fail "no local database backup in the last 30 hours"
fi

marker=/var/lib/orderak/offsite-backup.last-success
if [ ! -f "$marker" ] || (( NOW - $(stat -c %Y "$marker") > MAX_BACKUP_AGE )); then
  fail "no off-site backup in the last 30 hours"
fi

previous=$(cat "$STATE_FILE" 2>/dev/null || echo "ok 0")
read -r was since <<<"$previous"

if (( ${#REASONS[@]} == 0 )); then
  if [ "$was" = "fail" ]; then
    alert "Orderak ✅ recovered — عاد كل شيء يعمل على $(hostname)."
  fi
  echo "ok $NOW" > "$STATE_FILE"
  exit 0
fi

summary=$(printf '• %s\n' "${REASONS[@]}")
if [ "$was" != "fail" ]; then
  alert "Orderak 🔴 problem on $(hostname):
$summary"
  echo "fail $NOW" > "$STATE_FILE"
elif (( NOW - since >= REMIND_AFTER )); then
  alert "Orderak 🔴 still failing on $(hostname):
$summary"
  echo "fail $NOW" > "$STATE_FILE"
fi
exit 1
