#!/bin/bash
# The only thing the deploy key may do (batch 37).
#
# Installed as /opt/orderak/bin/deploy-entry and named in the key's line in
# ~orderak-deploy/.ssh/authorized_keys:
#
#   command="/opt/orderak/bin/deploy-entry",restrict ssh-ed25519 AAAA… github-deploy
#
# so whatever the client asks for, this runs instead. It accepts one request,
# "deploy <commit>", with the release archive on standard input, and hands
# both to receive-release, the one command sudo lets this user run.
set -euo pipefail

REQUEST='^deploy [0-9a-f]{7,40}$'
if ! [[ "${SSH_ORIGINAL_COMMAND:-}" =~ $REQUEST ]]; then
  echo "refused: the deploy key only runs 'deploy <commit>'" >&2
  exit 2
fi

exec sudo /opt/orderak/bin/receive-release "${SSH_ORIGINAL_COMMAND#deploy }"
