#!/bin/sh
# Builds the site and publishes it to popi.tech/hq, together with the link-preview service.
#   DEPLOY_HOST  ssh host (default: popi)
#   SITE_DIR     web root on that host (default: /opt/data/www/hq)
#   EMBED_DIR    preview service code on that host (default: ~/tyrhq-embed, systemd unit tyrhq-embed)
set -eu
cd "$(dirname "$0")"
HOST=${DEPLOY_HOST:-popi}
SITE_DIR=${SITE_DIR:-/opt/data/www/hq}
EMBED_DIR=${EMBED_DIR:-tyrhq-embed}

node scripts/build.mjs
node scripts/check.mjs > /dev/null

# nginx serves the files as another user, so everything must be world-readable.
rsync -rltp --delete --chmod=D755,F644 dist/ "$HOST:$SITE_DIR/"

# The preview service imports data.js and the planner's modules from SITE_DIR when it starts,
# so it restarts after every site deploy.
rsync -rltp --delete --exclude node_modules --chmod=D755,F644 server/ "$HOST:$EMBED_DIR/"
ssh "$HOST" "cd $EMBED_DIR && npm ci --omit=dev --no-audit --no-fund --silent && sudo -n systemctl restart tyrhq-embed"
echo "deployed: https://popi.tech/hq/"
