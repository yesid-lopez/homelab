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

### Update — 2026-08-02: IPv6 fix ineffective, cadence worsened to ~12 h

7-day observation window on the IPv6 SLAAC mitigation returned a negative result. Post-fix boot history:

| # | Boot                | Uptime before crash |
|---|---------------------|---------------------|
| 1 | 2026-07-30 20:32 UTC | ~12 h |
| 2 | 2026-07-31 11:50 UTC | ~15 h |
| 3 | 2026-07-31 20:40 UTC | ~9 h  |
| 4 | 2026-08-01 10:46 UTC | ~14 h |
| 5 | 2026-08-02 01:22 UTC | ~15 h |
| 6 | 2026-08-02 04:49 UTC | ~3.5 h |
| 7 | 2026-08-02 18:16 UTC | ~13.5 h |

**7 crashes in 86 hours**, average interval ~12 h — the cadence actually accelerated from the 2–3 day pre-fix baseline. Zero `NodeIPs changed` events post-fix (the IPv6 change worked as intended) yet the underlying fault kept firing. Conclusion: IPv6 SLAAC churn was noise, not the trigger.

Every crash retained the same clean-cut signature: no panic, no oops, no MCE, no OOM, no thermal warning, journal terminating on unremarkable log lines (etcd compaction / cron / sysstat). Recovery averaged 60–90 s. hwmon at the time of each cut consistently showed idle CPU (load 0.1–0.6), cool temperatures (Tctl 50–55 °C, NVMe 30–33 °C), memory well below limits, negligible network — a completely healthy-looking box seconds before disappearing.

### New finding — the master is a Ryzen 6900HX ("Rembrandt", Zen 3+), not a 7840HS

Prior notes assumed a Ryzen 7 7840HS (Phoenix, Zen 4). Actual `dmidecode` output on 2026-08-02:

- **System**: Minisforum EliteMini Series (UM690)
- **CPU**: AMD Ryzen 9 **6900HX** with Radeon Graphics (Zen 3+ / Rembrandt, family 19h model 44h)
- **RAM**: 2× 8 GB Samsung DDR5-4800, dual channel P0 A+B, 1.1 V — SMBIOS clean, EDAC reports zero correctable errors since 2026-07-30
- **BIOS**: v1.04 dated 2024-09-06 (nearly 2 years without an update)
- **Microcode**: `0xa404108` (up to date for Rembrandt on Ubuntu 24.04)
- **Kernel**: Ubuntu 6.8.0-136-generic
- **Kernel cmdline pre-fix**: `BOOT_IMAGE=/vmlinuz-6.8.0-136-generic root=/dev/mapper/ubuntu--vg-ubuntu--lv ro` — **no idle / C-state / PCIe / NVMe mitigations set**
- **C-states exposed by ACPI**: POLL, C1, C2, C3, all four with `disable=0`

The Ryzen 6000 mobile family is exactly the generation with a widely documented Linux stability bug — deep C-state (CC6, exposed as ACPI C3 with ~350 µs wake latency) transitions can trigger an AMD *Data Fabric sync flood* that instantaneously resets the SoC. Because the reset is triggered inside the fabric, the OS gets no chance to log a panic, oops, MCE, or thermal event: the journal simply ends on the last routine line. This exact failure signature is documented across Proxmox / Framework / CachyOS / Manjaro forums and in the ArchWiki and Gentoo wiki Ryzen pages.

References consulted:

- [AMD Ryzen Zen 4: random reboots caused by data fabric sync flood (0x08000800)](https://gist.github.com/eliottness/ded6bce8163689dc426732d0670c7a28) — closest match to our symptoms; fix documented as `processor.max_cstate=2` plus PCIe/NVMe extras.
- [ArchWiki — Ryzen § Random reboots / soft lock](https://wiki.archlinux.org/title/Ryzen) — "strongly linked to the C6 CPU idle state"; recommends BIOS `Power Supply Idle Control = Typical Current Idle` or kernel `processor.max_cstate=1`.
- [Gentoo Wiki — Ryzen § Random reboots with mce events](https://wiki.gentoo.org/wiki/Ryzen#Random_reboots_with_mce_events) — same recommendation, plus the `amd-disable-c6` systemd service as backup when the kernel parameter is ignored.
- [klingt.net — AMD Ryzen random reboots under Linux when in idle](https://www.klingt.net/articles/amd-ryzen-random-reboots-under-linux-when-in-idle.html) — same phenomenology (idle-only, no logs, journal ends clean).
- [Gah0/amd-disable-c6](https://github.com/Gah0/amd-disable-c6) — packaged systemd service for the same bug.

Every criterion of the documented bug matches our observations:

| Documented bug trait | master-1 observation |
|---|---|
| Reboots every 1–4 days, irregular cadence | Yes (2–3 d → 12 h currently) |
| Occurs when idle, not under load | Yes (load 0.1–0.6 at every cut) |
| No panic / oops / MCE in journal | Confirmed since 2026-07-30 |
| Journal ends on unremarkable line | Confirmed (etcd compaction, cron) |
| Temperatures cold at time of cut | Yes (~52 °C) |
| Auto-recovery works (it's a reset, not a lockup) | Yes (52–90 s recoveries) |
| Tends to worsen over time on affected silicon | Yes (accelerating) |

Live measurement on 2026-08-02 19:31 UTC before the fix: cpu0 idle residency showed **~70 % of wall time in C3, ~20 % in C2, ~3 % in C1, ~0 % in POLL** — the CPU was spending the vast majority of its time in exactly the state that hosts the bug.

### Change — 2026-08-02 19:39 UTC: extended hwmon logger + applied `processor.max_cstate=1`

Two host-level changes on `master-1` (nothing committed to the repo):

**1. Extended `/usr/local/bin/hwmon-log.sh`** to record C-state health going forward. Each `[BOOT]` marker now includes the effective kernel parameter so it's obvious per boot whether the fix is active:

```
2026-08-02T19:31:30+00:00 [BOOT] uptime_s=4499.01 kernel=6.8.0-136-generic max_cstate=unlimited
```

Each sample line now appends cumulative per-C-state residency in seconds since boot, so post-hoc deltas over any window are computable:

```
… rx=X tx=Y poll_s=A c1_s=B c2_s=C c3_s=D
```

When `processor.max_cstate=1` is active, `c2_s` and `c3_s` report `NA` because the kernel doesn't expose those states at all — this itself is a positive signal that the parameter took effect. Existing sample fields are unchanged; older parsers keep working.

**2. Applied kernel parameter `processor.max_cstate=1`** via GRUB.

- Backup: `/etc/default/grub.bak.1785699318`.
- Edited `/etc/default/grub`:

    ```
    GRUB_CMDLINE_LINUX_DEFAULT="processor.max_cstate=1"
    ```

- Regenerated with `sudo update-grub`.
- Controlled reboot: `kubectl cordon master-1` from the Mac → `sudo systemctl reboot` on the host → wait ~4 min → `kubectl uncordon master-1`. No drain needed on a single-master setup; containerd resumed pods automatically.

### Verification (immediately post-boot)

```bash
$ cat /proc/cmdline
BOOT_IMAGE=/vmlinuz-6.8.0-136-generic root=/dev/mapper/ubuntu--vg-ubuntu--lv ro processor.max_cstate=1

$ for i in /sys/devices/system/cpu/cpu0/cpuidle/state*/; do
    echo "$(cat $i/name): disable=$(cat $i/disable)"
  done
POLL: disable=0
C1:   disable=0
# C2 and C3 no longer exist in sysfs — kernel dropped them entirely.

$ systemctl is-active k3s
active

$ tail -1 /var/log/hwmon.log
2026-08-02T19:39:49+00:00 [BOOT] uptime_s=23.29 kernel=6.8.0-136-generic max_cstate=1
```

Cluster returned to `Ready` on both nodes in ~4 min. Longhorn recovered cleanly, Flux controllers reconciled successfully, no CrashLoopBackOff remaining after ~1 min of settling.

### Correction on the "diagnosis certainty" note

An earlier draft implied the C-state hypothesis was "not provable without applying the fix". That is inaccurate. AMD Zen SoCs expose a persistent hardware register `PMx3C0` (a.k.a. `S5_RESET_STATUS`) at physical address `0xFED803C0` that **survives resets** and encodes the reset cause as a bitmap. Reading it after a crash tells you what really happened. The reason we hadn't inspected it before this session is that Ubuntu 24.04 ships `CONFIG_STRICT_DEVMEM=y`, which blocks `/dev/mem` access to arbitrary physical addresses — so `sudo busybox devmem 0xFED803C0 32` returns `Operation not permitted`. To unlock the register we need the kernel boot parameter `iomem=relaxed`. Once that is active, the register becomes the ground-truth diagnostic for every subsequent reset. That capability is added below.

Additionally, the clean reboot at 19:39 UTC to apply `processor.max_cstate=1` **overwrote** the register with an ACPI-clean-transition value, so we lost the ground-truth value that the 2026-08-02 18:15 UTC crash would have left there. Regrettable but unavoidable — we didn't have `iomem=relaxed` yet. From now on we will.

### Additional change — 2026-08-02 19:46 UTC: unlock PMx3C0 register + record it per boot

Two more host-level changes on `master-1`, applied without a reboot so they only take effect on the next boot event (either a scheduled reboot or a crash):

**1. Added kernel parameter `iomem=relaxed`** alongside `processor.max_cstate=1` in `/etc/default/grub`:

```
GRUB_CMDLINE_LINUX_DEFAULT="processor.max_cstate=1 iomem=relaxed"
```

- Backup: `/etc/default/grub.bak.1785699960`.
- Regenerated with `sudo update-grub`.
- **No reboot performed.** The current boot still runs with `iomem=strict` (kernel default) so `/dev/mem` reads at arbitrary physical addresses still return `EPERM`. That is expected — we intentionally deferred activation to the next boot so we don't churn the fix's monitoring window.

`iomem=relaxed` weakens `/dev/mem` protection so root can read/write arbitrary physical memory. Trade-off: any root process can now poke any MMIO. Acceptable here because the box is a single-tenant homelab node behind the LAN. If tightened security is ever needed, remove the flag and re-run `update-grub`.

**2. Extended `/usr/local/bin/hwmon-log.sh` again** to read `PMx3C0` at boot and log it in the `[BOOT]` marker. New `[BOOT]` line format:

```
YYYY-MM-DDTHH:MM:SS+TZ [BOOT] uptime_s=X kernel=Y max_cstate=Z iomem=Q rst_status=0x...
```

- `max_cstate=` and `iomem=` are parsed from `/proc/cmdline` and echo the effective parameters for that boot.
- `rst_status=` is `busybox devmem 0xFED803C0 32` output. Falls back to `NA` when the read fails (unset `iomem=relaxed`, no `busybox`, `/dev/mem` denied, etc.). Field is always present so downstream parsers don't have to special-case its absence.

Bit meanings encoded in the register (per the reference gist we cite, `sp5100_tco` driver source, and AMD PPR for Family 19h):

| Bit | Mask | Meaning |
|---|---|---|
| 0  | `0x00000001` | `SB_RTS_STATUS` — southbridge reset triggered |
| 11 | `0x00000800` | `SYNC_FLOOD` — AMD Data Fabric sync flood occurred |
| 21 | `0x00200000` | `ACPI_TRANSITION` — normal ACPI S5 / reboot (clean shutdown) |
| 27 | `0x08000000` | Uncorrected hardware error triggered a sync flood |

Interpretation rules for the next crash's `[BOOT]` marker:

- **`rst_status=0x00200800`** (bits 21 + 11) → **clean ACPI transition**. The "reset" was an intentional reboot, not a crash. If we see this after an unexpected event, someone/something rebooted the box on purpose (kernel update, `shutdown -r`, etc.).
- **`rst_status=0x08000800`** (bits 27 + 11) → **uncorrected hardware error triggered a Data Fabric sync flood**. This is the smoking-gun value for our hypothesis: it's what a failed CC6 transition on Ryzen 6000/7000 mobile is documented to leave behind. **However**, bit 27 alone does *not* uniquely identify CC6 as the cause — it can also be raised by marginal RAM, VRM glitches, PCIe uncorrectable errors, or any other data-fabric-visible fault. If we see this value **and** the fix is confirmed active (`max_cstate=1` earlier in the same line), then C-state alone can't be the culprit and the culprit is one of the other hardware faults.
- **`rst_status=0x00000001`** or a small value with no bit-11 → a normal reset with no sync flood observed. Suggests the reset was triggered outside the data fabric (e.g., watchdog, external reset pin, brownout — not necessarily a crash).
- **`rst_status=NA`** → `iomem=relaxed` didn't take effect (`iomem=strict` will show in the same line). Re-check `/proc/cmdline`; the register can only be read once `iomem=relaxed` is honoured.

Together, the three fields on the `[BOOT]` line answer the two most important post-crash questions in one look: *was the fix active?* (`max_cstate=1`) and *what did the hardware say caused the last reset?* (`rst_status=…`).

Deployment verification (in-boot restart of the service, not a real reboot):

```
$ tail -1 /var/log/hwmon.log
2026-08-02T19:46:34+00:00 [BOOT] uptime_s=428.63 kernel=6.8.0-136-generic max_cstate=1 iomem=strict rst_status=NA
```

`iomem=strict` and `rst_status=NA` are the *expected* values for this in-place restart because the running kernel still has the pre-fix cmdline. On the next real boot, the line will show `iomem=relaxed rst_status=0x…`.

### Follow-ups

- **Monitor until 2026-08-09** (7 days). Daily check from the Mac:

    ```bash
    ssh yeye@192.168.2.108 "uptime && grep BOOT /var/log/hwmon.log | tail -3"
    ```

  Expected: no new `[BOOT]` markers, uptime growing monotonically.
- **If uptime crosses 7 days cleanly** → C-state bug confirmed; keep the fix permanently. Consider closing this incident thread and enabling a Grafana panel on `node_boot_time_seconds{node="master-1"}` for long-term visibility.
- **If a crash returns before 7 days** with `max_cstate=1` in the pre-crash `[BOOT]` line:
    - **Read the `rst_status` field on the post-crash `[BOOT]` line first** — it tells you unambiguously whether the reset was a data fabric sync flood (`0x08000800` = bit 27+11) or something else. Interpretation table above.
    - If bit 27 is set: the C-state fix alone wasn't enough (or the culprit is a different data-fabric-visible hardware fault). Next escalations, in order:
        1. Also add `idle=nomwait` to GRUB (disables mwait in C1 too; some Rembrandt units need this).
        2. Install `amd-disable-c6` systemd service — forces C6 off at MSR level, in case the ACPI/cpuidle path is being ignored.
        3. Also add `nvme_core.default_ps_max_latency_us=0` and `pcie_aspm=off` (documented co-contributors to the fabric sync flood).
        4. Run `memtester 8G 1` in-OS (`kubectl drain` first) to rule out marginal RAM as the fabric error source.
        5. Flash BIOS if Minisforum has a version newer than 2024-09-06 on the UM690 support page.
    - If bit 21 is set alone: someone rebooted the box intentionally; this wasn't a crash at all.
    - If `rst_status=NA`: `iomem=relaxed` didn't activate. Check `/proc/cmdline` on the current boot; may need to fix the GRUB entry manually.
- **If a crash returns before 7 days without `max_cstate=1` visible in the pre-crash `[BOOT]` line** → GRUB didn't apply the parameter; re-check `/proc/cmdline`.
- **Reversibility**: if in the future we want to revert (e.g. for benchmarking, or if a kernel upgrade fixes the bug upstream), restore `/etc/default/grub.bak.1785699318` (pre-C-state fix) or `/etc/default/grub.bak.1785699960` (pre-iomem fix), run `sudo update-grub`, reboot.

### Update — 2026-08-02 20:10 UTC: `processor.max_cstate=1` REVERTED — no benefit, possible harm

**Result: the C-state fix showed no benefit and the two boots that ran with it both ended in crashes within minutes. Reverted.**

Post-fix boot log:

| Boot start (UTC) | cmdline | Uptime | How it ended |
|---|---|---|---|
| 2026-08-02 19:39 | `processor.max_cstate=1` | ~10 min | crash |
| 2026-08-02 19:49 | `processor.max_cstate=1 iomem=relaxed` | ~7 min | crash |
| 2026-08-02 19:56 | `processor.max_cstate=1 iomem=relaxed` | ~14 min | intentional revert reboot (not a crash) |

Pre-fix baseline (from the earlier table in this document) was **~12 h between crashes**; these two boots died after 10 and 7 minutes.

Both crashes retained the same clean-cut signature (journal ends on `session logout` / `k3s snapshot`, no panic/oops/MCE, auto-recovery in ~50 s). The clean signature is not the news — the news is that restricting the CPU to `POLL`+`C1` did not stop whatever triggers the reset.

**Calibration note — do not over-read these two data points.** The inference "the fix caused the fast crashes" is *suggestive, not established*, for two reasons:

- **Sample size.** Two crashes against a stochastic fault is thin evidence. A pre-fix boot had already died after 3.5 h on 2026-08-02 04:49, so short uptimes were not unprecedented.
- **Startup-churn confound.** Both post-fix crashes landed inside or just after the heavy post-reboot workload restart (all pods recreating, Longhorn re-attaching 13 volumes, etcd recovering, Flux controllers reconciling). That window is the highest-stress period this host ever sees, and it was entered three times in 30 minutes. The post-revert boot passed through the same churn and survived, which supports the fix-caused reading, but does not isolate it.

The defensible conclusion is narrower: **`processor.max_cstate=1` produced no observable benefit, is not safe to leave running on this host, and the C-state hypothesis is no longer the leading explanation.**

Two candidate explanations for why the fix didn't work:

1. **A different bug lives in the mwait path used by C1 too.** With C2/C3 removed the CPU spent all its idle wall time in C1 (`c1_s` sample delta was ~28 s per 30 s of wall clock; `poll_s` ~0 s). C1 on AMD is entered via `mwait` on this cpuidle driver. If the bug is a generic mwait state-machine issue on this specific silicon, not a CC6-only issue, `processor.max_cstate=1` doesn't help — it only removes the deepest states from the *policy*, not the mwait code path itself. `idle=nomwait` would bypass mwait entirely and use `HLT` instead.
2. **The C-state hypothesis was wrong from the start.** The correlation between C3 residency and the pre-fix crashes was strong on paper, but C3 residency being ~70 % is simply what an idle Linux box does — it is a property of *every* idle AMD host, not evidence specific to this one. Absent the `PMx3C0` register (see below, unreadable), the C-state theory never had direct evidence behind it, only symptom-pattern matching against forum reports.

**Revert actions** (host-level, 2026-08-02 20:10 UTC):

- Backup: `/etc/default/grub.bak.1785701205`.
- Edited `/etc/default/grub`:

    ```
    GRUB_CMDLINE_LINUX_DEFAULT="iomem=relaxed"
    ```

- `sudo update-grub`.
- `kubectl cordon master-1` → `sudo systemctl reboot` → wait ~3 min → `kubectl uncordon master-1`.

**Note**: `iomem=relaxed` was **intentionally kept** on GRUB. It is harmless (single-tenant homelab) and it is a prerequisite for reading the `PMx3C0` diagnostic register on the next crash. Removing `processor.max_cstate=1` alone was enough to restore the pre-fix cpuidle policy.

**Post-revert verification** (boot at 2026-08-02 20:10:33 UTC):

```
$ cat /proc/cmdline
BOOT_IMAGE=/vmlinuz-6.8.0-136-generic root=/dev/mapper/ubuntu--vg-ubuntu--lv ro iomem=relaxed

$ for i in /sys/devices/system/cpu/cpu0/cpuidle/state*/; do
    echo "$(cat $i/name): disable=$(cat $i/disable)"
  done
POLL: disable=0
C1:   disable=0
C2:   disable=0
C3:   disable=0
# All four states restored; CPU can enter deep sleep again as before.

$ grep BOOT /var/log/hwmon.log | tail -1
2026-08-02T20:10:33+00:00 [BOOT] uptime_s=23.48 kernel=6.8.0-136-generic max_cstate=unlimited iomem=relaxed rst_status=NA
```

### Post-revert observation — 2026-08-02 20:30 UTC (20 min after the revert boot)

Checked at +20 min, i.e. past the 7–10 min window in which both post-fix boots died:

- **Uptime 20 min, no new `[BOOT]` marker** after `20:10:33`. `last -x reboot` confirms 20:10 is still the running boot.
- **C-state residency back to pre-fix profile**: `c3_s` growing ~20 s per 30 s sample (≈67 % of wall time in C3), `c2_s` ~6 s, `c1_s` ~1 s, `poll_s` 0. Identical to the 2026-08-02 19:31 pre-fix measurement.
- **Thermals and load normal**: Tctl 52–53 °C, GPU 46 °C, NVMe 32 °C, load 0.27–0.46, swap 1 MB.
- **Kernel log clean**: no panic, oops, MCE, EDAC, thermal or watchdog events since the revert boot. Only routine boot-time noise (PCI INT routing, ACPI `_PRW` overrides, unsupported Bluetooth variant, `sd N:N:N:N Power-on or device reset` from iSCSI reconnect).
- **journald noted `system.journal corrupted or uncleanly shut down, renaming and replacing`** — expected fallout from the hard crashes, handled automatically, no data loss.

**Longhorn survived the reboot storm intact.** This was the main collateral-damage risk from five reboots inside one hour. All 13 volumes report `attached` + `healthy`, all PVCs `Bound`, no degraded replicas and no rebuild backlog:

```bash
kubectl get volumes.longhorn.io -n longhorn-system \
  -o custom-columns='NAME:.metadata.name,STATE:.status.state,ROBUSTNESS:.status.robustness'
# 13/13 attached + healthy
```

Both nodes `Ready`, zero pods outside `Running`/`Completed` after force-deleting one orphaned `medidocs-api` pod left in `Unknown` from a pre-crash boot.

### Correction on the `iomem=relaxed` claim

`iomem=relaxed` **did not** unlock the `PMx3C0` register on Ubuntu 24.04 kernel 6.8.0-136 as I originally expected. All three boots after the flag was added (19:49, 19:56, 20:10) show `rst_status=NA` despite `iomem=relaxed` being visible in the same `[BOOT]` line's `iomem=` field. Manual test also fails:

```
$ sudo busybox devmem 0xFED803C0 32
devmem: can't open '/dev/mem': Operation not permitted
```

Ubuntu compiles this kernel with `CONFIG_STRICT_DEVMEM=y` and `CONFIG_IO_STRICT_DEVMEM=y`; on this build `iomem=relaxed` only affects a subset of the region checks. Reading FCH MMIO like `0xFED803C0` still fails. To actually read the register we would need one of:

- Rebuild the kernel with `CONFIG_STRICT_DEVMEM=n` and `CONFIG_IO_STRICT_DEVMEM=n`. Overkill.
- A dedicated driver / kernel module that reads the register via ioremap and exposes it via sysfs (write a small out-of-tree kmod, or wait for `sp5100_tco` / `amd_pmc` upstream to add it).
- `mmio_test`-style unsafe access from a signed kernel module — not worth the effort.

Consequence: `rst_status=NA` will keep showing in `[BOOT]` markers unless we invest in one of the above. For now the field is aspirational. Left in place because it costs nothing and if any future Ubuntu kernel starts honouring it, we'll get the data automatically.

### Revised suspect list (2026-08-02, post C-state fix failure)

With IPv6 and C-state both ruled out empirically, the shortlist narrows toward the physical layer:

1. **RAM marginality without ECC** — still consistent, though EDAC still reports zero correctable errors in 3+ days. Non-ECC DDR5 can hard-fault without corrigible-error warning. Next test is `memtester 8G 1` in-OS or `memtest86+` from USB overnight.
2. **VRM / mainboard power delivery** — degrading capacitors on the CPU VRM produce exactly this failure profile: instantaneous reset, no logs, temperatures normal, cadence worsening over time as caps age. Only diagnosis is visual inspection with the chassis open.
3. **BIOS firmware bug** — v1.04 (2024-09-06) is nearly 2 years old. Minisforum has released newer versions for the UM690 line; a BIOS update with newer AGESA microcode is a documented fix for random-reset issues on Rembrandt boards.
4. **DC input jack / dry solder** — micro-cuts of ms on the 19 V input produce identical symptoms. Only reproducible by wiggling the barrel connector while the box is running.
5. **NVMe firmware quirk under sustained Longhorn writes** — low probability given hwmon shows no I/O spike near cuts, but has documented links to fabric sync floods on some drives.

### Follow-ups (2026-08-02, post revert)

**0. Change nothing for several days.** Three configuration changes were made to this host today (IPv6 SLAAC, `processor.max_cstate=1`, `iomem=relaxed`) and one of them backfired. Without a stable baseline period there is nothing to compare future attempts against. Collect uptime data on the reverted configuration first. Daily check from the Mac:

```bash
ssh yeye@192.168.2.108 "uptime && grep BOOT /var/log/hwmon.log | tail -5"
```

Expected if we are back to baseline: a crash roughly every ~12 h, with recovery in 50–90 s. A crash sooner than ~6 h repeatedly would suggest the hardware fault is genuinely accelerating rather than the fix having caused the fast cycle.

**1. Newer kernel via HWE (best remaining remote option, untested).** The host runs the Ubuntu 24.04 GA kernel `6.8.0-136`. Installing `linux-generic-hwe-24.04` moves to 6.11+, which carries substantial upstream work on the AMD `cpuidle`, `amd_pmc` and `amd_pstate` paths — the same subsystems implicated in the Rembrandt reset reports. Preferable to hand-tuned kernel parameters because it is a whole tested component rather than a single policy knob, and GRUB retains `6.8.0-136` in the boot menu for instant rollback:

```bash
sudo apt install linux-generic-hwe-24.04
# reboot; verify with uname -r; if worse, pick the 6.8 entry in GRUB and pin it back
```

**2. `memtester` in-OS (remote, ~30 min).** Drain first, then:

```bash
kubectl drain master-1 --ignore-daemonsets --delete-emptydir-data
# on the host:
sudo apt install memtester && sudo memtester 8G 1
kubectl uncordon master-1
```

Caveat: a clean `memtester` run does not prove the RAM is healthy, only that it does not fail obviously under that pattern. A *failing* run is conclusive; a passing run is weak evidence.

**3. BIOS update (physical, highest expected value of the hardware options).** v1.04 dated 2024-09-06 is nearly two years old. The AGESA firmware bundled in the BIOS sits *below* anything the kernel can influence, and it is the layer where Rembrandt C-state and data-fabric errata actually get fixed. Not distributed via LVFS — `fwupdmgr` reports `0 local devices supported` — so it needs the manual USB utility from [minisforum.com/pages/download_um690](https://www.minisforum.com/pages/download_um690).

**4. Physical inspection (while the chassis is open for the BIOS work).** Reseat both SO-DIMMs, photograph the VRM area around the CPU looking for bulged or leaking capacitors, dust-blow the heatsink, and wiggle the 19 V DC barrel jack while the machine is running to test for a dry solder joint on the input.

**5. `idle=nomwait` — only if hardware avenues are exhausted.** Bypasses `mwait` entirely in favour of `HLT`, which addresses candidate explanation (1) above in a way `processor.max_cstate=1` could not. Cost ~5 W idle, same reversibility. Deliberately ranked below hardware work because the previous parameter-level intervention backfired and this host has now demonstrated it can get *worse* from cpuidle policy changes.

**6. RMA.** If nothing above resolves it within ~2 weeks, open a warranty ticket with Minisforum (in warranty if purchased after 2024-08). This document is the evidence package: crash history, ruled-out causes, and the clean-cut no-log signature. Workloads can be temporarily consolidated onto the worker Pi (`coredns`, `metrics-server`, `local-path-provisioner` and several app pods already run there), though it cannot host the control plane or the Longhorn replicas currently pinned to master-1.

**Never re-apply `processor.max_cstate=1` alone on this host** without a matched hardware fix in place. Recorded here so a future reader does not repeat it.
