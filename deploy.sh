#!/bin/sh
# Publishes popi.tech/hq now. popi builds the repository's main branch with the newest GameData
# (scripts/sync-popi.sh, also run hourly by a timer there), so push your commits first. This copies
# data/ (community builds, not in git) to popi and runs that sync.
#   DEPLOY_HOST  ssh host (default: popi)
set -eu
cd "$(dirname "$0")"
HOST=${DEPLOY_HOST:-popi}

git fetch --quiet origin main
if [ -n "$(git status --porcelain --untracked-files=no)" ] || [ -n "$(git log --oneline origin/main..HEAD)" ]; then
  echo "popi deploys origin/main: commit and push your changes first" >&2
  exit 1
fi

if [ -d data ]; then rsync -rlt --delete data/ "$HOST:tyr-planner/data/"; fi
ssh "$HOST" 'sudo -n systemctl start tyr-planner-sync; s=$?; journalctl -u tyr-planner-sync -n 6 --no-pager -o cat; exit $s'
echo "https://popi.tech/hq/"
