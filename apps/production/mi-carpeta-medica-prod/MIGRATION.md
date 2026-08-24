# Consolidating mi-carpeta-medica-api + mi-carpeta-medica-ui → mi-carpeta-medica-prod

This PR stands up `mi-carpeta-medica-prod` as a parallel namespace grouping
both the API and the UI, next to the still-live `mi-carpeta-medica-api` and
`mi-carpeta-medica-ui` namespaces. Applying it is safe on its own: new
namespace, new empty Postgres cluster, new Redis, same ingress hostnames
(`mi-carpeta-medica-api.luloai.com`, `mi-carpeta-medica.luloai.com`) as the
still-live namespaces — nothing here touches or deletes anything in
`mi-carpeta-medica-api`/`mi-carpeta-medica-ui`.

Since neither namespace is serving real traffic yet, the new namespace reuses
the final hostnames directly instead of a temporary `-v2` hostname. While both
namespaces exist, ingress-nginx sees the same host defined twice (undefined
which one wins) — acceptable here only because nothing depends on that
traffic yet. Don't leave both namespaces up with real users pointed at these
hostnames.

Secrets (`SealedSecret`s under `api/sealed-secrets/` and `ui/sealed-secrets/`)
were re-sealed for real, using the sealed-secrets controller's private key
pulled live from the cluster (`flux-system` namespace) and immediately
shredded after use — no plaintext was committed or left on disk.

MinIO (documents/thumbnails) and Zilliz (vector search) are **not**
namespace-scoped — they're shared external services referenced by bucket
name / collection name, so no migration is needed there. Postgres backups
now write to a separate destination
(`s3://postgres-backups/mi-carpeta-medica-prod-postgres`) so they don't
collide with the old cluster's WAL archive. The only real data to move is
Postgres.

## What still needs to happen, in order

1. **Deploy this namespace** (merge this PR; Flux applies it). Confirm pods
   come up healthy:
   ```bash
   kubectl -n mi-carpeta-medica-prod get pods
   ```
   At this point the new API/UI are live but the database is empty, and the
   ingress hosts are ambiguous with the old namespace — don't rely on this
   for real traffic yet.

2. **Copy the Postgres data** from the old cluster to the new one. Take a
   fresh backup of the source, then restore into the new cluster:
   ```bash
   kubectl -n mi-carpeta-medica-api cnpg backup mi-carpeta-medica-api-postgres --backup-name pre-consolidation-$(date +%Y%m%d)

   # Once the Backup resource reports "completed", restore it into a NEW
   # temporary CNPG cluster bootstrapped via `.spec.bootstrap.recovery`
   # pointing at the same barman ObjectStore (destinationPath:
   # s3://postgres-backups/mi-carpeta-medica-api-postgres), then
   # `pg_dump`/`pg_restore` (or `\copy`) from that temporary cluster into
   # mi-carpeta-medica-prod's mi-carpeta-medica-api-postgres. Tear the
   # temporary cluster down once the copy is verified.
   ```
   Verify row counts match between source and destination before proceeding
   (`documents`, `consultations`, and any join tables).

3. **Smoke test the new namespace for real** — port-forward or temporarily
   point a test client at the new namespace's services directly (bypassing
   ingress, since the hostnames are ambiguous right now), confirm document
   upload/processing and consultation sharing work end to end.

4. **Cut the ingress over**: delete the `Ingress` objects in
   `mi-carpeta-medica-api`/`mi-carpeta-medica-ui` (or remove those namespaces
   from `apps/production/kustomization.yaml`) in the *same* change that keeps
   `mi-carpeta-medica-prod`'s ingress — this avoids any window where the
   hostnames are ambiguous with real traffic on them.

5. **Decommission `mi-carpeta-medica-api`/`mi-carpeta-medica-ui`** only after
   the above has been stable for a while: remove them from
   `apps/production/kustomization.yaml` and let Flux prune them, then delete
   `apps/production/mi-carpeta-medica-api/` and
   `apps/production/mi-carpeta-medica-ui/` from this repo in a follow-up PR.
   Do this last and deliberately — it's the one irreversible step.

## Rollback

Until step 5, rollback is free: the old namespaces are untouched. If anything
looks wrong with the new namespace, just don't cut the ingress over (or point
it back).
