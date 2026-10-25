#!/usr/bin/env bash
# Usage: ./build.sh [--pull]
set -euo pipefail
cd "$(dirname "$0")"

podman build "$@" -t localhost/pi-sandbox -f Containerfile.pi .
podman build "$@" -t localhost/pi-proxy -f Containerfile.proxy .
