#!/usr/bin/env bash
# For the dedicated application container. The checkout and state use no GitHub secrets.
set -euo pipefail
umask 077

readonly state=${MIKE_DEPLOY_STATE:-/var/lib/mike-cn}
readonly runtime=${MIKE_RUNTIME_ENV:-/etc/mike-cn/runtime.env}
readonly remote=https://github.com/sakurawztlt/mike-cn.git
mkdir -p "$state/releases"
exec 9>"$state/deploy.lock"
flock -n 9 || exit 0

if [[ ! -e "$state/source.git/HEAD" ]]; then
  git init --quiet --bare "$state/source.git"
fi
git --git-dir="$state/source.git" fetch --quiet --no-tags "$remote" refs/heads/main:refs/heads/published
commit=$(git --git-dir="$state/source.git" rev-parse refs/heads/published)
previous=$(cat "$state/deployed" 2>/dev/null || true)
if [[ "$commit" == "$previous" ]]; then exit 0; fi

checkout="$state/releases/$commit"
if [[ ! -d "$checkout" ]]; then
  mkdir "$checkout"
  git --git-dir="$state/source.git" archive "$commit" | tar -x -C "$checkout"
fi

compose() (
  local rev=$1
  shift
  cd "$state/releases/$rev"
  export GIT_SHA="$rev" MIKE_IMAGE_TAG="$rev" MIKE_IMAGE_REPO=mike-cn
  export MIKE_RUNTIME_ENV="$runtime" SENTRY_DISABLED=true
  docker compose --project-name mike-cn --env-file "$runtime" -f docker-compose.yml -f deploy/home/compose.yaml "$@"
)

compose "$commit" config --quiet
compose "$commit" build db-init frontend
if compose "$commit" up -d --no-build; then
  port=$(awk -F= '$1=="MIKE_EDGE_PORT" { print $2 }' "$runtime")
  for attempt in {1..45}; do
    if curl -fsS --max-time 5 "http://127.0.0.1:${port:-18080}/api/auth/options" |
      python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["signup"] is False and d["setupRequired"] is False' 2>/dev/null; then
      printf '%s\n' "$commit" > "$state/deployed.new"
      mv "$state/deployed.new" "$state/deployed"
      printf 'Deployed %s\n' "$commit"
      exit 0
    fi
    sleep 3
  done
fi

if [[ -n "$previous" ]]; then
  compose "$previous" up -d --no-build
fi
printf '%s\n' 'The application or registration health check failed.' >&2
exit 1
