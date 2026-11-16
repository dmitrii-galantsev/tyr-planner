#!/bin/bash
# Keeps popi.tech/hq in step with this repository's main branch and with Stoke Games' newest GameData.
# Runs on popi from the systemd unit tyr-planner-sync (server/tyr-planner-sync.service: hourly timer,
# and on every ./deploy.sh). The unit moves this checkout to origin/main before starting the script.
#
#   1. moves GameData to its newest upstream commit (popi does not wait for the submodule bump);
#   2. stops early if the code, the game data and data/ (community builds) are what is already live;
#   3. regenerates only the images that changed upstream since the pinned GameData;
#   4. builds and runs the checks; if they fail (say a patch adds a tank that sharing.js does not
#      know yet), the live site stays as it is and the unit fails, so journalctl shows why;
#   5. publishes dist/ and the preview service, and restarts the service.
set -euo pipefail
cd "$(dirname "$0")/.."
SITE_DIR=${SITE_DIR:-/opt/data/www/hq}
EMBED_DIR=${EMBED_DIR:-$HOME/tyrhq-embed}
STATE=${STATE:-$HOME/.local/state/tyr-planner-sync}
mkdir -p "$STATE"
export GIT_LFS_SKIP_SMUDGE=1

git submodule update --init --quiet
pinned=$(git -C GameData rev-parse HEAD)
git -C GameData fetch --quiet origin main
latest=$(git -C GameData rev-parse FETCH_HEAD)
git -C GameData checkout --quiet --detach "$latest"

data_hash=$(cat data/*.json 2>/dev/null | sha256sum | cut -c1-16)
key="$(git rev-parse --short HEAD) $(git -C GameData rev-parse --short HEAD) $data_hash"
if [ "${FORCE:-0}" != 1 ] && [ "$(cat "$STATE/deployed" 2>/dev/null)" = "$key" ]; then
  echo "up to date ($key)"
  exit 0
fi

if [ "$latest" != "$pinned" ]; then
  mapfile -t changed < <(git -C GameData diff --name-only "$pinned" "$latest" -- \
    assets/images/vehicles assets/images/abilities assets/images/ammo assets/images/components \
    assets/images/talents assets/images/icons/alpha-program.png)
  if [ ${#changed[@]} -gt 0 ]; then
    echo "GameData art changed upstream: ${#changed[@]} image(s)"
    git -C GameData lfs pull --include "$(IFS=,; echo "${changed[*]}")"
    python3 scripts/assets.py --only "${changed[@]}"
  fi
fi

node scripts/build.mjs
node scripts/check.mjs > "$STATE/check.log" || { cat "$STATE/check.log"; echo "checks failed: popi.tech/hq left as it was"; exit 1; }

rsync -rltp --delete --chmod=D755,F644 dist/ "$SITE_DIR/"
rsync -rltp --delete --exclude node_modules --chmod=D755,F644 server/ "$EMBED_DIR/"
(cd "$EMBED_DIR" && npm ci --omit=dev --no-audit --no-fund --silent)
sudo -n systemctl restart tyrhq-embed
echo "$key" > "$STATE/deployed"
echo "deployed $key: $(head -c 300 "$SITE_DIR/data.js" | grep -o '"changelist":[0-9]*')"
