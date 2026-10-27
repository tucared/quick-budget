# pi sandbox on the Raspberry Pi

Runs the [pi](https://pi.dev) coding agent on this repo inside a rootless podman container. Setting up the host from scratch: [HOST.md](./HOST.md). What's next: [ROADMAP.md](./ROADMAP.md). The container sits on an internal-only network; its only way out is a tinyproxy that allows the hosts in `allowlist.txt` plus the Dev Supabase host.

```
tmux "pi" ── run.sh ── pi container (pi-internal, no route out)
                          │ HTTPS_PROXY
                          ▼
                       pi-proxy (pi-internal + pi-egress) ── allowlisted hosts
```

| Host path | Purpose | Visible to pi |
|---|---|---|
| `~/sandbox-src/infra/rpi/` | these files, run from a host-only clone that tracks `main` | no |
| `~/.config/pi-sandbox/.env` | secrets (API keys, tokens) | no |
| `~/.local/share/pi-sandbox/agent` | pi settings, sessions, global `AGENTS.md`, `extensions/` (re-copied on each launch; `extensions/` is replaced wholesale) | yes |
| `~/.local/share/pi-sandbox/npm` | npm cache | yes |
| `~/github/tucared/quick-budget` | pi's clone of the repo | yes |

The host never runs scripts from pi's clone: pi can write to it, so it could rewrite `run.sh` or the allowlist. `~/sandbox-src` is a separate clone (not a worktree — that would share pi's `.git`) that only ever pulls reviewed `main`.

## Deploy changes

After the change is merged to `main`:

```bash
ssh rpi 'git -C ~/sandbox-src pull --ff-only'
ssh rpi sandbox-src/infra/rpi/build.sh       # only if a Containerfile changed
```

Then relaunch pi (`run.sh` below). Reinstall `pi-tmux.service` if it changed (HOST.md §5).

## Use

- `cmux ssh-tmux rpi` (desktop) or `mosh rpi -- tmux attach -t pi` (phone)
- Window 1 runs pi; when it exits you get a host shell — `pi-run` relaunches (aliases from HOST.md §5)
- Shell in the running container: `podman exec -it pi bash`; standalone shell: `pi-run shell`
- After merging an `infra/rpi` change: `pi-deploy && pi-run` (pulls `~/sandbox-src`, rebuilds, relaunches)
- Proxy log (denied hosts show up here): `podman logs -f pi-proxy | grep -i filtered`. `pi.dev` (pi's own startup check) is denied on purpose.

## Dogfooding

The image ships Debian's Chromium (Chrome for Testing has no Linux ARM build); `AGENT_BROWSER_EXECUTABLE_PATH` and `AGENT_BROWSER_PROXY` point agent-browser at it and the proxy, and `chromium-policy.json` turns off its Google background services. `run.sh` writes a Dev `.env.local` into the workspace on first launch. pi starts `next dev` itself; dev server + browser use about 1.5 GB of the 5 GB cap.

## Supabase MCP

`run.sh` writes `~/.pi/agent/mcp.json` pointing at `mcp.supabase.com` for the Dev project (`database,docs` tools), authenticated by `SUPABASE_DEV_MCP_TOKEN`: a personal access token scoped to Dev only, Database read-write, no Migrations, so `apply_migration` fails and Prod is unreachable. Check with `pi mcp list`.

## Storage

Rootless podman must use `overlay` via `fuse-overlayfs` (HOST.md §1.6). The `vfs` fallback copies every layer in full — tens of GB on the SD card and builds that stall the whole host, Pi-hole included. `build.sh` ends with a throwaway `--userns=keep-id` run so any first-run ownership remapping happens at build time, not when `run.sh` starts.

## Pins

Every input is pinned in the Containerfiles: base images by digest, pi by version (`--before` caps its transitive deps), jj and gh by sha256. Only bump to releases at least 7 days old.
