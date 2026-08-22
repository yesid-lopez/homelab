
## NGINX Ingress Controller

Currently, due to my current router does not support setting up ips but only devices, that's why I have my ingress controller service to be exposed as a `NodePort`.

Once my new Fritzbox Router has arrived, I am planning to change the service as a `LoadBalancer` and map that ip in my router.

## ~~Multica uploads bucket is public~~ (resolved)

Was: `multica-uploads` set to `policy: download` (public read), fronted by a dedicated `media.multica.yesidlopez.de` ingress straight at MinIO's S3 API, because the backend had no way to serve S3-backed attachments without a public URL.

The original note assumed this needed an upstream fix (`multica-ai/multica#2804`, PR `#2740`) to land. Both `#2740` and its successor `#3070` were closed without merging. Turns out the capability shipped separately: the backend already supports `ATTACHMENT_DOWNLOAD_MODE=proxy`, which streams attachments through the API (`Storage.GetReader`) for any storage backend including S3/MinIO — confirmed present and working at the image tag already pinned in this repo (`v0.4.30`), no version bump required.

Fixed by:
1. `apps/production/multica/configmap-helm-values.yaml`: replaced `CLOUDFRONT_DOMAIN` with `ATTACHMENT_DOWNLOAD_MODE=proxy`.
2. `infrastructure/controllers/minio/configmap-helm-values.yaml`: `multica-uploads` back to `policy: none`.
3. Dropped `infrastructure/controllers/minio/ingress-multica-uploads.yaml` and its `kustomization.yaml` entry.

No DB migration was needed: the attachment API's `download_url` field is always the stable `/api/attachments/<id>/download` endpoint (resolved server-side via `KeyFromURL`), independent of whatever shape is stored in the legacy `url` column — see the separate "Multica DB has stale attachment URLs" item below for the handful of rows where the *raw* stored URL is wrong.

## MinIO root credentials shared across apps

`minio-backup-credentials` in the `multica` namespace, `minio-backup-credentials` in the `umami` namespace, and `lulo-cms`'s S3 secret are all sealed copies of the same MinIO root user (`admin`). CNPG backups and Multica's S3 client both authenticate as root.

A compromise of any pod with one of these secrets reads/writes every bucket: `payload-media`, `postgres-backups` (all CNPG dumps across the homelab), and `multica-uploads`. Blast radius is wider than necessary.

**To resolve:** create per-app IAM users in MinIO with policies scoped to a single bucket / path prefix, re-seal credentials per namespace, and re-issue. Pattern:
- `multica-uploads-rw` user → read/write only `multica-uploads`.
- `cnpg-multica` user → read/write only `postgres-backups/multica-postgres/**`.
- Same for `lulo-cms` and `umami`.

Manual via `mc admin user add` + `mc admin policy create` + `mc admin policy attach`, codify the policies as a one-shot Job similar to `cronjob-backup.yaml`, then update each sealed secret.

## Multica DB has stale attachment URLs

Attachments uploaded before the migration to S3-on-MinIO have URLs in the DB that don't reflect the current storage shape:
- 4 rows from before the migration: relative paths like `/uploads/workspaces/<id>/<file>.png` (from the LocalStorage era).
- 1 row from after the migration but before `CLOUDFRONT_DOMAIN` was set: `http://minio.minio.svc.cluster.local:9000/multica-uploads/workspaces/.../file.png` (in-cluster DNS).

Both are broken in the browser. New uploads after `CLOUDFRONT_DOMAIN` is set write the correct `https://media.multica.yesidlopez.de/<key>` shape.

**To resolve:** one-shot SQL UPDATE against the attachment table, rewriting both shapes to the current `https://media.multica.yesidlopez.de/<key>` prefix. Schema lookup needed to confirm the exact column; will be a `kubectl -n multica exec multica-postgres-1 -- psql ...` invocation, not committed.

## sshine/multica-helm chart cascade-deletes the PVC

Empirically confirmed in this homelab: setting `persistence.enabled: false` on the Multica HelmRelease caused Helm to delete `pvc/multica-uploads` (and cascade the PV + Longhorn Volume CR), counter to the standard "Helm preserves PVCs" rule. The chart's PVC template is gated by `{{- if .Values.persistence.enabled }}`, so flipping the flag removes the resource from the rendered output and Helm cleans it up.

Data in the homelab survived because the Longhorn backup volume on NFS is independent of the volume CR (and the migration to MinIO had already mirrored content before the flag was flipped).

**To resolve:** if ever migrating off this chart's PVC again, mirror content first, then flip the flag — don't rely on the "orphan PVC for safety" pattern. Or open an upstream issue/PR adding `helm.sh/resource-policy: keep` to the PVC template.
