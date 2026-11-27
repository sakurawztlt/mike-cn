#!/usr/bin/env bash
set -euo pipefail
umask 077

readonly state="${MIKE_DEPLOY_STATE:-/var/lib/mike-cn}"
readonly data="$state/legal-data"
exec 9>"$state/deploy.lock"
flock -w 240 9

release=$(cat "$state/deployed")
[[ "$release" =~ ^[a-f0-9]{40}$ ]]
test -s "$data/legal.sqlite"

# Use the deployed application's dependencies, with write access only to the
# public data directory. No account, model or storage secrets enter this job.
exec docker run --rm --pull=never --read-only \
  --mount "type=bind,source=$data,target=/data/mike-cn/legal" \
  --entrypoint node "mike-cn/mike-backend:$release" \
  /app/scripts/sync-china-legal.mjs /data/mike-cn/legal/legal.sqlite
