
Installing the longhornctl to verify the nodes are ready

## Check

First, set the `export KUBECONFIG=~/.kube/config` variable and run:

```bash
longhornctl check preflight
```

## Install requisites

```bash
longhornctl install preflight
```

After running the check again I got the following output:

```bash
INFO[2025-06-20T10:15:54+02:00] Initializing preflight checker
INFO[2025-06-20T10:15:54+02:00] Cleaning up preflight checker
INFO[2025-06-20T10:15:54+02:00] Running preflight checker
INFO[2025-06-20T10:15:57+02:00] Retrieved preflight checker result:
master-1:
  info:
  - Service iscsid is running
  - NFS4 is supported
  - Package nfs-common is installed
  - Package open-iscsi is installed
  - Package cryptsetup is installed
  - Package dmsetup is installed
  - Module dm_crypt is loaded
  warn:
  - Kube DNS "coredns" is set with fewer than 2 replicas; consider increasing replica count for high availability
  - multipathd.service is running. Please refer to https://longhorn.io/kb/troubleshooting-volume-with-multipath/ for more information.
worker-1:
  info:
  - Service iscsid is running
  - NFS4 is supported
  - Package nfs-common is installed
  - Package open-iscsi is installed
  - Package cryptsetup is installed
  - Package dmsetup is installed
  - Module dm_crypt is loaded
  warn:
  - Kube DNS "coredns" is set with fewer than 2 replicas; consider increasing replica count for high availability
INFO[2025-06-20T10:15:57+02:00] Cleaning up preflight checker
INFO[2025-06-20T10:15:57+02:00] Completed preflight checker
```

There are two main warnings left:
- Increase coredns replicas to two for high availability `kubectl -n kube-system scale deployment coredns --replicas=2`
- In the master node (minisforum), there is the multipathd.service running. So I have run the following commands to disable it:

```bash 
sudo systemctl disable --now multipathd
sudo systemctl disable --now multipathd.socket
```
The previous change is to avoid future errors like: `MountVolume.SetUp failed for volume` due to multipathd on the node.

More info: https://longhorn.io/kb/troubleshooting-volume-with-multipath/


- After rebooting, looks like the `dm_crypt` was not loaded so I run the following commands:

```bash
# Install cryptsetup package for disk encryption support
sudo apt install cryptsetup 
# Load the dm_crypt kernel module for device mapper encryption
sudo modprobe -v dm_crypt 
# Persist dm_crypt module loading across reboots
echo "dm_crypt" | sudo tee /etc/modules-load.d/dm_crypt.conf
```

For the minisforum I run:
```bash
# Load the dm_crypt kernel module for device mapper encryption
sudo modprobe dm_crypt

# Verify that the dm_crypt module is loaded
lsmod | grep dm_crypt

# Persist dm_crypt module loading across reboots by adding to /etc/modules
echo "dm_crypt" | sudo tee -a /etc/modules
```
