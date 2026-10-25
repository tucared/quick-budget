#!/usr/bin/env bash
# Usage: ./build.sh [--pull]
set -euo pipefail
cd "$(dirname "$0")"

podman build "$@" -t localhost/pi-sandbox -f Containerfile.pi .
podman build "$@" -t localhost/pi-proxy -f Containerfile.proxy .

# The first keep-id run of a new image copies it with remapped ownership, which takes minutes; do it now.
podman run --rm --userns=keep-id --entrypoint true localhost/pi-sandbox
