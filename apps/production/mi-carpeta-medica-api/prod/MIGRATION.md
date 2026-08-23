# Migrating medidocs-api → mi-carpeta-medica-api

This PR stands up `mi-carpeta-medica-api` as a parallel, independent
namespace next to the still-live `medidocs-api`. Applying it is safe on its
own: new namespace, new empty Postgres cluster, new Redis, new ingress
hostname (`mi-carpeta-medica-api.luloai.com`) — nothing here touches or
deletes anything in `medidocs-api`.

MinIO (documents/thumbnails) and Zilliz (vector search) are **not**
namespace-scoped — they're shared external services referenced by bucket
name / collection name, so no migration is needed there. The only real data
to move is Postgres.

## What still needs to happen, in order

1. **Deploy this namespace** (merge this PR; Flux applies it). Confirm pods
   come up healthy:
   ```bash
   kubectl -n mi-carpeta-medica-api get pods
   curl -s https://mi-carpeta-medica-api.luloai.com/health
   ```
   At this point the new API is live but its database is empty — don't
   point any client at it yet.

2. **Copy the Postgres data** from the old cluster to the new one. Take a
   fresh backup of the source, then restore into the new cluster (safer
   than a live pg_basebackup, and it doesn't touch the source):
   ```bash
   kubectl -n medidocs-api cnpg backup medidocs-api-postgres --backup-name pre-migration-$(date +%Y%m%d)

   # Once the Backup resource reports "completed":
   kubectl -n medidocs-api-postgres get backup pre-migration-<date>

   # Restore that backup into a NEW temporary CNPG cluster bootstrapped
   # via `.spec.bootstrap.recovery` pointing at the same barman ObjectStore
   # (destinationPath: s3://postgres-backups/medidocs-api-postgres), then
   # `pg_dump`/`pg_restore` (or `\copy`) from that temporary cluster into
   # mi-carpeta-medica-api-postgres. Tear the temporary cluster down once
   # the copy is verified — see CloudNativePG docs on "Bootstrap from a
   # backup" for the exact recovery manifest.
   ```
   Verify row counts match between source and destination before proceeding
   (`documents`, `consultations`, and any join tables).

3. **Smoke test the new namespace for real** — upload a document through
   `mi-carpeta-medica-api.luloai.com` with the same `X-API-Key`, confirm it
   processes and shows up, before sending real traffic its way.

4. **Cut the app over**: update the mobile app's `ApiConfig.baseUrl` (and
   any other client) to `https://mi-carpeta-medica-api.luloai.com`, ship
   that release.

5. **Decommission `medidocs-api`** only after the above has been stable for
   a while: `kubectl delete -k apps/production/medidocs-api` (or remove it
   from `apps/production/kustomization.yaml` and let Flux prune it), and
   delete `apps/production/medidocs-api/` from this repo in a follow-up PR.
   Do this last and deliberately — it's the one irreversible step.

## Rollback

Until step 5, rollback is free: the old namespace is untouched and still
serving `medidocs-api.luloai.com`. If anything looks wrong with the new
namespace, just don't cut clients over to it (or point them back).
