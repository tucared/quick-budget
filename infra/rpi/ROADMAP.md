# rpi sandbox roadmap

P0–P5 are done (GitHub hardening, host, instructions, container, dogfooding, Supabase MCP). What's left.

## P6: automation

Goal: version bumps arrive as PRs with a 7-day cooldown, and merged `main` deploys itself to the rpi. A human merge stays the only gate.

### Dependabot

`.github/dependabot.yml` with `cooldown: default-days: 7` for:

- `docker` in `/infra/rpi`: base image digests in `Containerfile.pi` and `Containerfile.proxy`
- `npm` in `/`: the app's dependencies (none are tracked today)
- `github-actions` in `/`: action versions in the workflows

Dependabot can't see the `ARG` pins (pi, jj, gh, `NPM_BEFORE`).

### ARG pins: pick one

- **Renovate** with custom regex managers on the `ARG`s and `minimumReleaseAge: "7 days"`. Opens PRs, but it's a third-party GitHub App with write access to the repo.
- **A weekly workflow** that compares each pin to its latest release at least 7 days old and opens an issue. Read-only, no new app; the bump itself stays manual (see the `rpi-sandbox` skill).

### `update.sh` (monthly routine on the rpi)

- Print the commands that need `sudo` (`apt full-upgrade`, `pihole -up`) rather than running them
- `build.sh --pull`
- List candidate pin bumps (pi, jj, gh) at least 7 days old
- Offer to restart `pi-tmux.service`; never restart while pi is mid-task
- Remind to `pkg upgrade` in Termux

### Nightly deploy from `main`

- A systemd user timer: `git -C ~/sandbox-src pull --ff-only`, run `build.sh` if a Containerfile changed, reinstall the unit if `pi-tmux.service` changed
- Restart the session only if pi is idle; otherwise leave it for the next run
- Until then, `git -C ~/sandbox-src pull` is a manual step after each merge

## Later

- `/pareto` pi extension: set `min_coding_score` per session via `before_provider_request`
- Parallel pi sessions: one container per jj workspace
- Dotfiles repo for global agent rules, hooks and skills shared across Claude Code and pi
- Pi-hole admin over Tailscale (`tcp:80` in the policy grant + nftables)
- Local `~/.ssh/allowed_signers` so jj shows signature status
- Persist `~/.config/jj` in the container to silence the per-repo config warning
- Expiry and rotation for `rpi-pi-mcp-dev` (currently never expires)
- SSD or Ethernet if `npm ci` gets slow
