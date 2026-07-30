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

### Update — 2026-07-30 01:31 UTC: crash returned after brick replacement

The 19 V/6.32 A/120 W replacement brick had been installed some days earlier (user-confirmed). Under those conditions the machine still hard-reset at 01:31 UTC (03:31 local time).

Progress since the July 18 baseline is significant but not complete:

| Ciclo | Uptime before crash | Downtime after crash |
|---|---|---|
| Jul 9   | 5–10 min (loop) | seconds |
| Jul 10  | 1 h 21 m        | ~15 h |
| Jul 12  | 2 h 47 m        | ~11 h |
| Jul 18  | 1 h 55 m        | 8 h |
| Jul 24 (×3) | 52 m each   | 3–5 min |
| Jul 27  | 3 d 11 h        | 21 min |
| **Jul 30** | **2 d 5 h**  | **52 s** |

Frequency dropped from every 1–3 h to every 2–3 days; recovery time dropped from 8 h to 52 s. So the software mitigations (r8169 workaround, `kernel.panic=10` with fast reboot, BIOS `AC Power Loss=On`) are working — the crashes just don't hang the box anymore. But the underlying physical fault is still there.

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

### Revised root-cause hypothesis (as of 2026-07-30)

With the brick replaced, the shortlist of remaining suspects for an idle-time hard reset with no kernel log is:

1. **Motherboard VRM caps** on the UM690 board degrading — mimics the brick symptoms exactly but internal to the board. High probability now that the external PSU is ruled out.
2. **RAM marginal / SO-DIMM contact** — Ryzen 7840HS has no ECC; a single bit flip in the wrong page triggers an oops → immediate reboot (`kernel.panic=10` → 10 s to reboot; boot then takes ~40 s → total ~50 s, which matches this crash perfectly).
3. **DC input jack / power delivery path on the mainboard** — oxidation or dry solder joint at the barrel connector or downstream can cause transient rail drops even with a healthy brick.
4. **CPU microcode / BIOS firmware bug** — Ryzen 7040/7045-series has had a few advisories. BIOS is Sept-2024, no LVFS update available; would need to fetch a newer BIOS from Minisforum's website manually.
5. **NVMe firmware quirk on Longhorn write bursts** — unlikely given the 30 s samples showed no I/O anomaly, but possible.

The **50-second recovery on this crash is actually a strong pointer toward RAM**: that timing is exactly `kernel.panic=10` + BIOS POST time. The 8-hour recovery on the earlier crash pointed at brick thermal cutoff (which we've now eliminated by replacement). Different failure modes may have coexisted.

### Follow-ups (2026-07-30)

- **Top priority — memtest86+ for at least 4 h overnight**. Boot into GRUB menu, pick the memtest entry. Any single error confirms RAM. If the modules are user-serviceable, reseat them or swap in a known-good pair.
- **Visual inspection of the UM690 board** while it's opened for RAM work: look for bulged/leaking capacitors near the CPU (VRM area) and around the DC-in jack. Photograph the board so we can compare over time.
- **Reseat the DC-in barrel** on the chassis — even sound solder joints benefit from cycling.
- **BIOS update**: check Minisforum's UM690 support page for a firmware newer than the current Sep-2024 build; if available, flash it (has some brick risk; do only if RAM checks clean).
- Keep monitoring `/var/log/hwmon.log`; every additional crash refines the pattern.
- If after RAM + BIOS + visual, resets keep happening on ~2–3 day intervals → open an RMA / warranty ticket with Minisforum, this is a hardware-level fault they should replace.
