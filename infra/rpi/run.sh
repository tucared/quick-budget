#!/usr/bin/env bash
# Usage: ./run.sh [pi args...]   |   ./run.sh shell
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
state="${XDG_DATA_HOME:-$HOME/.local/share}/pi-sandbox"
workspace="$HOME/github/tucared/quick-budget"
proxy=http://10.89.7.2:8888

set -a; . "$here/.env"; set +a

mkdir -p "$state/agent" "$state/npm"
cp "$here/agent/AGENTS.md" "$here/agent/settings.json" "$state/agent/"
{ cat "$here/allowlist.txt"; printf '^%s\\.supabase\\.co$\n' "$SUPABASE_DEV_REF"; } > "$state/allowlist"

podman network exists pi-internal || podman network create --internal --subnet 10.89.7.0/24 pi-internal
podman network exists pi-egress || podman network create pi-egress

podman rm -f pi-proxy >/dev/null
podman run -d --name pi-proxy \
  --network pi-internal:ip=10.89.7.2 --network pi-egress \
  --read-only --cap-drop=ALL \
  -v "$state/allowlist:/etc/tinyproxy/allowlist:ro" \
  localhost/pi-proxy >/dev/null

entry=()
if [[ ${1:-} == shell ]]; then entry=(--entrypoint bash); shift; fi

exec podman run --rm -it --name pi \
  --log-driver=none \
  --network pi-internal \
  --userns=keep-id \
  --memory=5g --memory-swap=5g --pids-limit=2048 \
  --cap-drop=ALL --security-opt=no-new-privileges \
  -e HOME=/home/node \
  -e HTTPS_PROXY=$proxy -e HTTP_PROXY=$proxy -e https_proxy=$proxy -e http_proxy=$proxy \
  -e NO_PROXY=localhost,127.0.0.1 -e no_proxy=localhost,127.0.0.1 \
  -e NODE_USE_ENV_PROXY=1 \
  -e OPENROUTER_API_KEY -e GH_TOKEN \
  -v "$state/agent:/home/node/.pi/agent" \
  -v "$state/npm:/home/node/.npm" \
  -v "$workspace:/workspace" \
  "${entry[@]}" localhost/pi-sandbox "$@"
