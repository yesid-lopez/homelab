# Consolidating mi-carpeta-medica-api/dev → mi-carpeta-medica-dev

This PR stands up `mi-carpeta-medica-dev` as a parallel namespace next to the
still-live `mi-carpeta-medica-api-dev` namespace, grouping what will
eventually be both the API and the UI dev environments (the UI doesn't have a
dev overlay yet — see `../mi-carpeta-medica-api/ENVIRONMENTS.md` — so only
`api/` exists here for now).

Dev data is disposable test data by design (no barman/backup plugin on its
CNPG cluster, see the original `ENVIRONMENTS.md`), so unlike
`mi-carpeta-medica-prod`'s migration there's **no Postgres data to copy** —
this is a straight cutover once the new namespace is verified healthy.

Secrets (`SealedSecret`s under `api/sealed-secrets/`) were re-sealed for real,
using the sealed-secrets controller's private key pulled live from the
cluster (`flux-system` namespace) and immediately shredded after use — no
plaintext was committed or left on disk.

## What still needs to happen, in order

1. **Deploy this namespace** (merge this PR; Flux applies it). Confirm pods
   come up healthy, including self-hosted GoTrue:
   ```bash
   kubectl -n mi-carpeta-medica-dev get pods
   curl https://mi-carpeta-medica-api-dev.luloai.com/health
   curl https://mi-carpeta-medica-auth-dev.luloai.com/health
   ```
   Since both namespaces currently define the same ingress hostnames,
   ingress-nginx's routing between them is ambiguous while both exist —
   acceptable for dev, but confirm via `kubectl -n mi-carpeta-medica-dev get
   pods`/logs rather than assuming the curl above hit the new namespace.

2. **Smoke test**: create/invite a test user through the new namespace's
   GoTrue, log in, upload a document, confirm it processes.

3. **Decommission `mi-carpeta-medica-api-dev`**: remove it from
   `apps/production/kustomization.yaml` and let Flux prune it (this deletes
   its disposable CNPG cluster too — expected), then delete
   `apps/production/mi-carpeta-medica-api/dev/` from this repo in a
   follow-up PR.

## Rollback

Until step 3, rollback is free: the old namespace is untouched. If anything
looks wrong with the new namespace, just don't decommission the old one yet.
