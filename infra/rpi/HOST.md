# rpi host runbook

Fresh SD card → working rpi (Pi-hole for the TV + the pi sandbox). Run the host commands on the rpi as `max`. Hardware: Raspberry Pi 5, 8 GB, Raspberry Pi OS Lite (Debian 12 bookworm, arm64), Wi‑Fi.

## 1. Base system

1. Flash Raspberry Pi OS Lite (64-bit) with Raspberry Pi Imager: hostname `raspberrypi`, user `max`, Wi‑Fi, SSH with your public key.
2. Router (Bbox): keep the static DHCP lease `raspberrypi` → `192.168.1.77`. The TV's DNS is set manually to `192.168.1.77`.
3. Locale (mosh refuses to start without a UTF-8 one):
   ```bash
   sudo sed -i 's/^# *en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen
   sudo locale-gen
   ```
4. Memory cgroup (Raspberry Pi kernels boot with `cgroup_disable=memory`; podman's `--memory` needs it). `cmdline.txt` must stay one line:
   ```bash
   sudo sed -i '1 s/$/ cgroup_enable=memory/' /boot/firmware/cmdline.txt
   sudo reboot
   ```
5. Packages:
   ```bash
   sudo apt-get update
   sudo apt-get install -y tmux mosh rsync nftables unattended-upgrades \
     podman netavark aardvark-dns slirp4netns uidmap
   sudo loginctl enable-linger max
   ```

## 2. Pi-hole

```bash
curl -sSL https://install.pi-hole.net | bash
```
Restore settings from a Teleporter export (admin → Settings → Teleporter) if you have one; export one after any change.

## 3. Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh --accept-dns=false --hostname=rpi --advertise-tags=tag:rpi
```
- `--accept-dns=false`: Tailscale must not touch the resolver Pi-hole relies on.
- Tagged nodes don't expire; the tag isn't tied to your login.

Tailnet policy (admin console → Access controls):
```jsonc
{
  "tagOwners": {
    "tag:rpi": ["autogroup:admin"],
  },
  "grants": [
    {"src": ["autogroup:member"], "dst": ["autogroup:self"], "ip": ["*"]},
    {"src": ["autogroup:member"], "dst": ["tag:rpi"], "ip": ["tcp:22", "udp:60000-61000"]},
  ],
  "ssh": [
    {
      "action": "check",
      "src": ["autogroup:member"],
      "dst": ["tag:rpi"],
      "users": ["max"],
      "checkPeriod": "12h",
    },
  ],
}
```
No grant has `tag:rpi` as source, so the rpi can't reach your other devices.

## 4. Host config files

Copy the sandbox from the Mac first (`rsync -av infra/rpi/ rpi:sandbox/`), then:

```bash
# Firewall. The timer rolls it back in 2 min unless you cancel it, so a bad rule can't lock you out.
sudo nft -c -f ~/sandbox/host/nftables.conf
sudo systemd-run --unit=nft-rollback --on-active=120 /usr/sbin/nft delete table inet filter
sudo install -m 644 ~/sandbox/host/nftables.conf /etc/nftables.conf
sudo systemctl enable --now nftables && sudo systemctl reload nftables
# Still connected? Open a second session to be sure, then:
sudo systemctl stop nft-rollback.timer

# Pi-hole survives out-of-memory
sudo install -D -m 644 ~/sandbox/host/pihole-FTL-oom.conf /etc/systemd/system/pihole-FTL.service.d/oom.conf
sudo systemctl daemon-reload && sudo systemctl restart pihole-FTL

# Automatic security updates, plus Tailscale and Raspberry Pi packages
sudo install -m 644 ~/sandbox/host/52unattended-upgrades-local /etc/apt/apt.conf.d/
echo 'unattended-upgrades unattended-upgrades/enable_auto_updates boolean true' | sudo debconf-set-selections
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
```

Checks:
```bash
sudo nft list table inet filter | head -5               # policy drop
cat /proc/$(pidof pihole-FTL)/oom_score_adj             # -900
sudo unattended-upgrade --dry-run 2>&1 | grep -i 'allowed origins'
```

## 5. Sandbox

```bash
cp ~/sandbox/.env.example ~/sandbox/.env && chmod 600 ~/sandbox/.env && nano ~/sandbox/.env
git clone https://github.com/tucared/quick-budget ~/github/tucared/quick-budget
~/sandbox/build.sh
~/sandbox/run.sh shell      # inside: jj git init --colocate && jj bookmark track main@origin && exit
mkdir -p ~/.config/systemd/user
cp ~/sandbox/pi-tmux.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now pi-tmux.service
```

`.env` needs `OPENROUTER_API_KEY` (key `rpi-pi`, $20 cap), `GH_TOKEN` (fine-grained PAT `rpi-pi-agent`: `quick-budget` only, Contents + Pull requests read/write, nothing else), `SUPABASE_DEV_REF`.

## 6. Clients

Mac `~/.ssh/config`, above `Host *` (keeps 1Password out of it; Tailscale SSH needs no key):
```
Host rpi
  HostName rpi
  User max
  IdentityAgent none
```
cmux: Settings → Beta Features → Remote tmux, then `cmux ssh-tmux rpi`.

Phone: Tailscale app + Termux (F-Droid) with `pkg install openssh mosh`, `~/.ssh/config` with `Host rpi` / `HostName rpi` / `User max`, and `export LANG=en_US.UTF-8` in `~/.bashrc`. Connect with `mosh rpi -- tmux attach -t pi`.

## Monthly

```bash
sudo apt-get update && sudo apt-get full-upgrade   # reboot if the kernel changed
pihole -up
~/sandbox/build.sh --pull && systemctl --user restart pi-tmux.service
```
