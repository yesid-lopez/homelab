# Incidents log

Chronological record of homelab incidents, their root causes and the fixes applied. Newest entry on top.

For repo-level tech debt (things that are intentional-but-suboptimal) see [debt-tech.md](debt-tech.md).

Every entry follows the same shape:

- **Symptoms** — what was observed.
- **Root cause** — what was actually broken.
- **Changes** — commands / files / manifests touched. Distinguishes **host-level** (SSH into a node, not managed by GitOps) from **repo-level** (committed to the repo, reconciled by Flux).
- **Verification** — how to confirm the fix in the future.
- **Follow-ups** — anything intentionally deferred.

---

## 2026-07-18 — `master-1` (Minisforum UM690) random hard resets

### Symptoms

- `master-1` powered off abruptly at unpredictable intervals (8 resets in 40 min on 2026-07-09, then every 1–3 h during 07-10 → 07-12).
- No clean shutdown recorded: `last -x shutdown` had no entries matching the reboots, and `journalctl -b -1` ended mid-log with no `Stopping…` messages.
- User observation that unlocked the diagnosis: **with the ethernet cable unplugged the machine stayed up indefinitely**.

### Root cause

- **Primary**: NIC is a Realtek RTL8125 2.5GbE using the in-tree `r8169` driver on kernel 6.8.0-124. This combination has known issues with TCP segmentation offloads (TSO/GSO/GRO) and Energy Efficient Ethernet (EEE) that cause interrupt storms and hard CPU lockups under sustained traffic. With `kernel.panic=10` set, the hardware watchdog / kernel forced a reset before anything could be flushed to the journal — hence the lack of shutdown logs. Cable unplugged → no traffic → no storm → no reset.
- **Contributing** (did not cause the resets, but made the host unhealthy):
    - k3s cluster certificates expired on 2026-06-18 → apiserver in an infinite error loop.
    - `fs.inotify.max_user_instances = 128` (Ubuntu default) → k3s spammed `error creating fsnotify watcher: too many open files` every second.
    - No swap configured on a 16 GB host running k3s + Longhorn + Prometheus.

### Changes

All changes are **host-level on `master-1` (192.168.2.108)**; nothing was committed to the repo/GitOps flow. Applied via `sudo` over SSH.

1. **NIC workaround** — runtime + persisted:

```bash
ethtool -K eno1 tso off gso off gro off
ethtool --set-eee eno1 eee off
```

   Persisted via a new systemd unit `/etc/systemd/system/r8169-fix.service` (enabled, `WantedBy=multi-user.target`) that re-runs both `ethtool` calls after `network-online.target` on every boot.

2. **Sysctl limits** — `/etc/sysctl.d/99-homelab-k3s.conf`:

```
fs.inotify.max_user_instances = 8192
fs.inotify.max_user_watches = 524288
fs.file-max = 2097152
```

3. **Swap** — 4 GiB swapfile at `/swapfile`, added to `/etc/fstab` as `/swapfile none swap sw 0 0`.

4. **k3s certificate rotation**:

```bash
sudo systemctl stop k3s
sudo k3s certificate rotate         # rotates server, api-server, admin, etcd, scheduler, kubelet, auth-proxy, kube-proxy
sudo systemctl start k3s
```

   New certs valid until **2027-07-18**. Old certs backed up under `/var/lib/rancher/k3s/server/tls-<epoch>/`.

5. **Persistent journal** — `/etc/systemd/journald.conf` set to `Storage=persistent`, `SystemMaxUse=2G`; `/var/log/journal/` created. This is so the *next* crash (if any) survives the reboot and can be inspected with `journalctl -b -1 -k`.

6. **Local `~/.kube/config` on the Mac** — after cert rotation, the local kubeconfig for context `bramble` had to be updated with the new CA/client cert/key (`kubectl config set clusters.bramble.certificate-authority-data …` and friends). Previous config backed up as `~/.kube/config.bak.<epoch>`.

### Verification

- `systemctl is-enabled r8169-fix.service` → `enabled`
- `ethtool -k eno1 | grep -E 'tcp-segmentation|generic-segmentation|generic-receive'` → all `off`
- `ethtool --show-eee eno1` → `EEE status: disabled`
- `sysctl fs.inotify.max_user_instances` → `8192`
- `swapon --show` → `/swapfile 4G`
- `sudo openssl x509 -in /var/lib/rancher/k3s/server/tls/serving-kube-apiserver.crt -noout -enddate` → `notAfter=Jul 18 …  2027`
- `kubectl get nodes` shows both `master-1` and `worker` as `Ready` from the Mac.
- Track uptime with `uptime` over the following days; expect it to grow past the previous 1–3 h ceiling.

### Follow-ups

- If resets return despite the NIC workaround, install Realtek's out-of-tree driver `r8125-dkms` (upstream fork with more fixes than in-tree `r8169`).
- Set a calendar reminder ~2027-05 to rotate k3s certs again (they auto-rotate on restart if within 90 days of expiry, but only if k3s is actually restarted — otherwise the same silent expiry can happen again).
- One external client (IP `192.168.2.208` = `worker` / `luloclaw`) was intermittently presenting the old client cert (SN `8016972684918034376`) after rotation. Node was `Ready` so it self-recovered, but if the noise persists, restart the k3s-agent on `luloclaw` to force a fresh kubelet-client cert.
- The `apps/production/*` and `infrastructure/*` GitOps tree was **not** touched; all fixes are host-level. If master-1 is ever reprovisioned, these host tweaks must be re-applied manually (or better: put them into a small provisioning script / cloud-init).

### Update — same day, 20:37 UTC: reset returned with the r8169 workaround already in place

The fixes above did **not** fully resolve the resets. Timeline of that same 2026-07-18:

- 10:22 UTC → 12:17 UTC (1 h 55 m): boot -2 crashed with `r8169-fix.service` active, offloads confirmed off, EEE off, k3s certs freshly rotated, journal persistent, swap active.
- 12:17:29 UTC → 12:17:29 UTC: BIOS auto-boot lasted **0 seconds** — died again on the spot.
- 12:17 UTC → 20:37 UTC (~8 h): machine stayed off, user powered it on manually at 22:37 local time.

With persistent journal now in place, we could confirm:

- `journalctl -b -2 -k --since '2026-07-18 12:12:00'` returned **`-- No entries --`**: not a single kernel line before the cut → hard physical reset.
- CPU load averaged **~3 %** for the entire 1 h 55 m (idle host — sysstat `sar -u -f /var/log/sysstat/sa18`).
- No apt upgrade happened: `unattended-upgrades` ran at 10:35 and found zero updatable packages.
- k3s activity in the 10 min before the cut was normal (etcd hourly snapshot at 12:00, WAL purge at 12:04, no OOM, no pod restart, no CronJob spike at 12:17).
- The 8 h off is inconsistent with a pure kernel panic (which would auto-reboot in seconds via `kernel.panic=10`). Consistent with **BIOS thermal cutoff** or an external **19 V PSU brick** tripping and needing to cool down.

Revised root-cause hypothesis: the `r8169` bug was real and worth fixing, but was **not the only** (and possibly not the primary) cause. Current suspects, in order:

1. External 19 V PSU brick degraded (typical Minisforum failure mode).
2. Thermal solution (fan/heatsink dust) in the compact UM690 chassis.
3. NVMe thermal shutdown under sustained k3s+Longhorn writes.
4. Marginal RAM (Ryzen 7840HS has no ECC → silent bit flips → hard fault, no log).
5. VRM capacitors on the motherboard degraded.
6. Wall outlet / power strip / brownouts on the same circuit.
7. Weak CMOS battery.

### Update — 2026-07-18 20:51 UTC: hardware monitoring logger installed

To capture what's happening in the 30 s before the next crash, added a host-level logger:

- `/usr/local/bin/hwmon-log.sh` — bash loop, samples every 30 s.
- `/etc/systemd/system/hwmon-log.service` — `Type=simple`, `Restart=always`, `WantedBy=multi-user.target`.
- `/var/log/hwmon.log` — persistent output. One line per sample:

    ```
    2026-07-18T20:52:08+00:00 tctl=48.0 gpu=43.0 nvme=29.9 load=0.57 mem_used_mb=6643 mem_avail_mb=7069 swap_used_mb=0 rx=91733419 tx=172947618
    ```

- `[BOOT] uptime_s=… kernel=…` line written on every service start, so each boot session is visible.
- `sync` after each write so the last line survives a hard reset.
- `/etc/logrotate.d/hwmon` — weekly rotation, 4 archives kept, compressed.

After the next reset, inspect with:

```bash
ssh yeye@192.168.2.108 "tail -30 /var/log/hwmon.log"
# The lines immediately preceding a `[BOOT]` marker are the last-known state before the crash.
```

Signals to look for:

- `tctl > 85` or `nvme > 80` in the final samples → thermal.
- All fields normal on the last line, then abrupt `[BOOT]` → electrical (PSU brick trip or blackout).
- Sudden `load` or `mem_used_mb` spike → software runaway.
- `rx`/`tx` delta jumping to hundreds of MB in 30 s → network storm despite the r8169 workaround.

### Follow-ups (post-update)

- Physical check pending: dust-blow the UM690 heatsink, tap the PSU brick after 30–40 min uptime to feel if it's uncomfortably hot, consider swapping to a spare 19 V/6.3 A brick.
- BIOS `AC Power Loss = Always On` is currently **off** (confirmed: user had to power on manually after the 12:17 crash). Change this in BIOS setup so the cluster doesn't stay down for hours.
- If the logger implicates thermal or PSU, order a spare 19 V brick (~15 €) and/or a CR2032 for the CMOS battery.
- If nothing physical shows up, run `memtest86+` for at least 4 h from the GRUB menu.

### Update — 2026-07-30 01:31 UTC: crash returned with brick + new kernel already in place

Corrected timeline (assistant initially misread the boot list on Jul 24 08:37→08:40 as the brick-swap gap; user later clarified):

- **Jul 20 12:59 UTC** — `unattended-upgrade` installed **kernel 6.8.0-136** (upgrade from 6.8.0-124), plus openssh, curl, python, tzdata, libcurl and libheif. Package installed but not activated yet (needs reboot).
- **Jul 20 (same day)** — user manually swapped the 19 V/6.32 A/120 W brick. That reboot picked up the new kernel, so from Jul 20 onwards the host was on **kernel 6.8.0-136 + new brick**.
- **Jul 24 01:47 / 02:41 / 03:34 UTC** — 3 quick crashes with **both** new-brick and new-kernel already in place. Uptimes 52 min, 52 min, 5 h.
- **Jul 24 08:40 → Jul 27 20:05 UTC** — stable **3 d 11 h**.
- **Jul 27 20:05 UTC** — planned manual power-off (user rearranging cables); not a crash.
- **Jul 27 20:06 → Jul 30 01:31 UTC** — stable **2 d 5 h**, then this crash.

Progress since the July 18 baseline is significant but not complete. Consolidated crash frequency:

| Ciclo | Uptime before crash | Downtime after crash | Config at the time |
|---|---|---|---|
| Jul 9   | 5–10 min (loop) | seconds | old brick, kernel -124, no r8169 fix |
| Jul 10  | 1 h 21 m        | ~15 h   | old brick, kernel -124, no r8169 fix |
| Jul 12  | 2 h 47 m        | ~11 h   | old brick, kernel -124, no r8169 fix |
| Jul 18  | 1 h 55 m        | 8 h     | old brick, kernel -124, r8169 fix applied same day |
| Jul 24 (×3) | 52 m / 52 m / 5 h | 3–5 min | **new brick**, **kernel -136**, r8169 fix |
| Jul 27  | 3 d 11 h        | 21 min (planned shutdown, not a crash) | new brick, kernel -136 |
| **Jul 30** | **2 d 5 h**  | **52 s** | new brick, kernel -136 |

Frequency dropped from every 1–3 h to every 2–3 days; recovery time dropped from 8 h to 52 s. The software mitigations (r8169 workaround, `kernel.panic=10` with fast reboot, BIOS `AC Power Loss=On`) are working — the crashes just don't hang the box anymore. But the underlying fault is still there **despite** the brick swap and kernel upgrade.

Note on the earlier "brick was to blame" hypothesis: with the correct timeline (brick swapped Jul 20, not Jul 24 as originally inferred), the 3 back-to-back crashes on Jul 24 happened with the new brick already in place. Therefore the brick was at most a contributor, not the primary cause.

hwmon evidence from `/var/log/hwmon.log` in the 10 minutes leading to the cut:

```
2026-07-30T01:23:51 tctl=52.8 gpu=46 nvme=32.9 load=3.31 mem_used=7580 swap=151 …
2026-07-30T01:24:21 tctl=53.5 gpu=46 nvme=31.9 load=4.33 mem_used=7474 swap=151 …   ← brief load burst
2026-07-30T01:25:21 tctl=52.8 gpu=46 nvme=32.9 load=4.86 mem_used=7575 swap=151 …   ← peak load
2026-07-30T01:27:51 tctl=59.6 gpu=47 nvme=31.9 load=1.12 mem_used=7590 swap=151 …
2026-07-30T01:31:22 tctl=52.6 gpu=46 nvme=32.9 load=0.17 mem_used=7563 swap=151 …
2026-07-30T01:31:52 tctl=52.5 gpu=46 nvme=31.9 load=0.10 mem_used=7571 swap=151 …   ← last line before cut
2026-07-30T01:32:44 [BOOT] uptime_s=22.63 kernel=6.8.0-136-generic                   ← 52 s after
```

Kernel side, the last message was `k3s[…] "finished scheduled compaction","compact-revision":216644963,"took":"73.073273ms"` at 01:31:36 — an unremarkable etcd index compaction. No panic, no oops, no thermal warning, no `Machine Check` — same clean cut as before.

Interpretation:

- Temperatures: **normal** (Tctl 52 °C).
- CPU load: **near zero at the moment of the cut** (0.10); there was a brief load burst of ~4.86 six minutes earlier but the box had returned to idle.
- Memory: stable, some swap in use (151 MB) but nothing under pressure.
- Network: RX/TX deltas ~1–2 MB per 30 s window — normal.
- Recovery time of 52 s: consistent with a brief physical reset that let BIOS auto-boot immediately (not a thermal cutoff needing hours to clear).

### New finding — IPv6 SLAAC prefix churn (2026-07-30 log analysis)

Reviewing k3s logs around both crashes (Jul 24 02:37 and Jul 30 00:42) revealed a chronic pattern of `NodeIPs changed` events every 15–90 s. Not just the IPv6 address flapping in and out, but **the prefix itself changing**:

```
Jul 24 02:37:05  oldNodeIPs=[..., 2003:eb:5f3d:9c49:5a47:caff:fe79:adf6]
                 newNodeIPs=[..., 2003:eb:5f3d:9ce3:5a47:caff:fe79:adf6]  ← prefix 9c49 → 9ce3
Jul 24 02:38:26  same prefix flip
Jul 24 02:39:55  same
Jul 30 00:42:29  same pattern
Jul 30 00:42:57  same
Jul 30 00:43:42  same
Jul 30 00:47:35  same
```

The upstream router (Fritzbox on this network) is announcing IPv6 Router Advertisements with **different `/64` prefixes** in the same DHCPv6-PD session, so SLAAC produces a new global IPv6 for `eno1` on each RA. Consequences on master-1:

- Kubelet re-registers the node with the API server every time the address set changes.
- kube-proxy rewrites iptables NAT rules for every service.
- All controller informers get invalidated and re-list.

This happens dozens of times per hour, indefinitely. It is a chronic background stress that plausibly contributes to the crashes — either via a kernel-side leak/state issue in the networking stack, or by keeping something in the k3s data plane pinned in "reconciling" until an unrelated stressor tips it over.

The hwmon load spike observed at 2026-07-30 00:44 (peak 15.37, ~4 min duration, 47 min before the crash) coincided with a burst of `NodeIPs changed` events and an etcd snapshot trigger, consistent with this cascade.

### Revised root-cause hypothesis (as of 2026-07-30, post user correction)

With brick swap and kernel upgrade both already applied and crashes still recurring on a 2–3 day cadence:

1. **IPv6 SLAAC prefix churn from the ISP router** — chronic and unambiguous in the logs. Easy to mitigate (disable IPv6 on `eno1` or force a static ULA). Highest expected impact / lowest risk change to try next.
2. **RAM marginal / SO-DIMM contact** — Ryzen 7840HS has no ECC; a single bit flip triggers an oops → 10 s panic delay + ~40 s POST → ~50 s recovery, matches the observed pattern. Still on the shortlist.
3. **Motherboard VRM caps** on the UM690 board degrading — mimics brick symptoms but internal to the board.
4. **Kernel 6.8.0-136 regression on `r8169`** — the crashes started reappearing with -136 (same day as brick swap), so a regression in the in-tree Realtek driver between -124 and -136 can't be fully ruled out. Would need to test `r8125-dkms` or a mainline kernel.
5. **DC input jack / power delivery path on the mainboard** — oxidation or dry solder at the barrel or downstream.
6. **BIOS firmware bug** — UM690 BIOS is Sep-2024, no LVFS update available; would need manual flash from Minisforum's site.
7. **NVMe firmware quirk on Longhorn write bursts** — unlikely given the 30 s samples showed no I/O anomaly, but possible.

The `50-second recovery` timing still fits either (1), (2) or (4) equally well.

### Follow-ups (2026-07-30, revised)

- **Try first: kill IPv6 prefix churn.** Disable IPv6 on `eno1` (network is IPv4-only 192.168.2.0/24 anyway), or set a static ULA/global IPv6 for the interface so the address stops flapping. Observe 5–7 days.
- **If the crash still returns after IPv6 is quiet — run memtest86+ overnight**. Boot into GRUB → Advanced options → Memory test. Any single error confirms RAM.
- **While the chassis is open for RAM work**: reseat SO-DIMMs, photograph the board around CPU VRMs and DC-in jack, look for bulged/leaking caps, dust-blow the heatsink.
- **BIOS update**: check Minisforum's UM690 support page for a firmware newer than Sep-2024; flash only if RAM checks clean (some brick risk).
- **If desperate, test kernel regression**: install `linux-generic-hwe-24.04` (mainline 6.11+) or the out-of-tree `r8125-dkms` driver and see if the interval extends further.
- Keep the hwmon logger running. Every additional crash refines the pattern.
- If after IPv6-fix + RAM + BIOS + kernel, resets keep happening on ~2–3 day intervals → RMA / warranty ticket with Minisforum.

### Update — 2026-07-30 08:14 UTC: IPv6 SLAAC churn mitigated on `eno1`

Applied the follow-up #1 from the section above — cheapest, remote-only change to attack the most visible symptom.

**Change** (host-level on `master-1`, not committed to the repo):

New file `/etc/sysctl.d/98-disable-ipv6-slaac-eno1.conf`:

```
# Disable IPv6 SLAAC on eno1 to prevent prefix churn from upstream router.
# The homelab network is IPv4-only (192.168.2.0/24); accepting RAs from the
# ISP router causes NodeIPs flapping in k3s every 15-90s.
net.ipv6.conf.eno1.accept_ra = 0
net.ipv6.conf.eno1.autoconf = 0
```

Runtime application:

```bash
sudo sysctl -p /etc/sysctl.d/98-disable-ipv6-slaac-eno1.conf
sudo ip -6 addr flush dev eno1 scope global
```

Note: `accept_ra` was already `0` at runtime (inherited from a prior default), but `autoconf` was still `1`, which is what kept generating global IPv6 addresses from cached RAs. Both are now pinned to `0` and persisted.

IPv6 is **not disabled kernel-wide**; link-local (`fe80::…`) still works. Only the global SLAAC path on `eno1` is neutralised. k3s cluster networking (flannel VXLAN over IPv4), Longhorn iSCSI, MetalLB, ingress and all pod traffic are IPv4 — no impact expected.

### Verification

Immediately after the change:

```bash
ip -6 addr show eno1
# Before: inet6 2003:eb:5f3d:9cc0:… /64 scope global dynamic mngtmpaddr noprefixroute
#         inet6 fe80::…             /64 scope link
# After : inet6 fe80::…             /64 scope link
```

3 min observation window on k3s journal:

```bash
sudo journalctl -u k3s --since '3 minutes ago' | grep -c 'NodeIPs changed'
# 0   (down from ~30+/hour before the fix)
```

Long-term check (5–7 days): `sudo journalctl -u k3s --since '1 day ago' | grep -c 'NodeIPs changed'` should stay at 0. Kubelet will eventually drop the stale IPv6 from `.status.addresses` on next restart or node re-registration; not urgent.

### Follow-ups

- **Watch until 2026-08-06** (7 days) whether the ~2–3 day crash cadence extends. If yes, this was a real contributor and we keep the fix. If no, IPv6 churn was just noise and the real root cause is still in the hardware shortlist.
- If crashes continue after 2026-08-06 with IPv6 quiet, **run `memtester 8G 1` in the running OS** (no reboot, ~30 min, non-destructive to the k3s workloads on that node — but drain first with `kubectl drain master-1 --ignore-daemonsets --delete-emptydir-data`). Any error confirms RAM.
- If memtester is clean and crashes continue → schedule an overnight `memtest86+` USB boot as originally planned.
