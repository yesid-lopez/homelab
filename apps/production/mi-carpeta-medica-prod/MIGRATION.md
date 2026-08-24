# mi-carpeta-medica-api + mi-carpeta-medica-ui → mi-carpeta-medica-prod

Straight cutover, not a staged migration: `mi-carpeta-medica-prod` now groups
the API and UI in one namespace, and `mi-carpeta-medica-api`/
`mi-carpeta-medica-ui` are decommissioned in this same PR (their Postgres
data was deliberately discarded rather than migrated — nobody was using the
app yet).

MinIO (documents/thumbnails) and Zilliz (vector search) are **not**
namespace-scoped — they're shared external services referenced by bucket
name / collection name, unaffected by this move. Postgres backups now write
to a separate destination
(`s3://postgres-backups/mi-carpeta-medica-prod-postgres`).

Secrets (`SealedSecret`s under `api/sealed-secrets/` and `ui/sealed-secrets/`)
were re-sealed for real, using the sealed-secrets controller's private key
pulled live from the cluster (`flux-system` namespace) and immediately
shredded after use — no plaintext was committed or left on disk.

## After merge

```bash
kubectl -n mi-carpeta-medica-prod get pods
curl -s https://mi-carpeta-medica-api.luloai.com/health
```
