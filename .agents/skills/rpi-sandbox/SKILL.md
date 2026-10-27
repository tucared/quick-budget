---
name: rpi-sandbox
description: Operate the pi coding agent sandbox on the Raspberry Pi (`infra/rpi/`) — deploy changes, rebuild images, check health, read proxy denials, bump pinned versions, or rebuild the host from scratch. Use when the user mentions the rpi, the pi sandbox/container, the egress allowlist, tinyproxy, the pi-tmux service, or `infra/rpi/`.
---

# rpi sandbox

Design and layout: `infra/rpi/README.md`. Full host setup: `infra/rpi/HOST.md`.

## Rules

- **Ask before every `ssh rpi`**, even read-only. The user runs anything needing `sudo` themselves; give the command and what it does.
- If you are pi running inside the sandbox, you can't reach the rpi host — propose changes in a PR instead.
- Never commit secrets or the tailnet name (the repo is public). Secrets live only in `~/.config/pi-sandbox/.env` on the rpi.
- The host runs these files from `~/sandbox-src`, a host-only clone that tracks `main`. Never run them from pi's workspace (`~/github/tucared/quick-budget`) — pi can write there.

## Deploy a change

Merge to `main` first, then:

```bash
ssh rpi 'git -C ~/sandbox-src pull --ff-only'
ssh rpi sandbox-src/infra/rpi/build.sh                    # only if a Containerfile changed
ssh rpi 'cp ~/sandbox-src/infra/rpi/pi-tmux.service ~/.config/systemd/user/ && systemctl --user daemon-reload'   # only if the unit changed
```
Restarting `pi-tmux.service` kills the running pi session — ask first.

Files under `infra/rpi/host/` go to `/etc` and need `sudo install` by the user (see HOST.md §4).

## Health check (read-only)

```bash
ssh rpi 'systemctl --user is-active pi-tmux.service; tmux ls; podman ps --format "{{.Names}} {{.Status}}"'
ssh rpi 'podman logs --tail 50 pi-proxy'     # denied hosts show as 403 / "Filtered"
ssh rpi "podman info --format '{{.Store.GraphDriverName}}'; df -h / | tail -1"   # must be overlay, not vfs
```
`pi.dev` denials are expected. A build or start that seems to hang and a filling SD card both point at `vfs` storage (README → Storage).

## Allowing a new host

Add an anchored ERE line to `infra/rpi/allowlist.txt` (e.g. `^example\.com$`), deploy, then restart pi (`run.sh` regenerates the allowlist and recreates the proxy). Prefer installing a tool in the image over allowlisting a download host.

## Bumping pins

Only to releases at least 7 days old. Pins live as `ARG`s / digests in `Containerfile.pi` and `Containerfile.proxy`:

- pi: `npm view @earendil-works/pi-coding-agent time --json`; also move `NPM_BEFORE` to today minus 7 days
- jj / gh: `gh api repos/jj-vcs/jj/releases` / `repos/cli/cli/releases`; sha256 from the asset `digest` field
- images: tag `last_updated` + `digest` from `https://hub.docker.com/v2/repositories/library/<image>/tags/<tag>`
