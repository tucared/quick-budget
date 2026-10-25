# pi sandbox on the Raspberry Pi

Runs the [pi](https://pi.dev) coding agent on this repo inside a rootless podman container. The container sits on an internal-only network; its only way out is a tinyproxy that allows the hosts in `allowlist.txt` plus the Dev Supabase host.

```
tmux "pi" ── run.sh ── pi container (pi-internal, no route out)
                          │ HTTPS_PROXY
                          ▼
                       pi-proxy (pi-internal + pi-egress) ── allowlisted hosts
```

| Host path | Purpose | Visible to pi |
|---|---|---|
| `~/sandbox/` | these files + `.env` (secrets) | no |
| `~/.local/share/pi-sandbox/agent` | pi settings, sessions, global `AGENTS.md` (re-copied on each launch) | yes |
| `~/.local/share/pi-sandbox/npm` | npm cache | yes |
| `~/github/tucared/quick-budget` | pi's clone of the repo | yes |

## Deploy changes

From the Mac (never `--delete`, it would remove `.env`):

```bash
rsync -av infra/rpi/ rpi:sandbox/
ssh rpi sandbox/build.sh
```

## Use

- `cmux ssh-tmux rpi` (desktop) or `mosh rpi -- tmux attach -t pi` (phone)
- Window 1 runs pi; when it exits you get a host shell — `~/sandbox/run.sh` relaunches
- Shell in the running container: `podman exec -it pi bash`; standalone shell: `~/sandbox/run.sh shell`
- Proxy log (denied hosts show up here): `podman logs -f pi-proxy`

## Pins

Every input is pinned in the Containerfiles: base images by digest, pi by version (`--before` caps its transitive deps), jj and gh by sha256. Only bump to releases at least 7 days old.
