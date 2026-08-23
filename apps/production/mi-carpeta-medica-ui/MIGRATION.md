# Migrating medidocs-ui → mi-carpeta-medica-ui

Unlike the API, this service is stateless (no database, no PVC) — the only
thing to move is traffic. Applying this is safe on its own: new namespace,
new ingress host (`mi-carpeta-medica.luloai.com`), still pointing at the
old `medidocs-api` backend until that migration is done.

## Steps

1. **Deploy this namespace** (merge this PR). Confirm the pod is healthy:
   ```bash
   kubectl -n mi-carpeta-medica-ui get pods
   curl -sI https://mi-carpeta-medica.luloai.com/
   ```
2. Once `mi-carpeta-medica-api`'s Postgres migration is done (see the
   companion `MIGRATION.md` there) and it's serving real data, update
   `API_INTERNAL_URL` in `deployment.yaml` here to
   `http://mi-carpeta-medica-api.mi-carpeta-medica-api.svc.cluster.local`.
3. Point DNS/whatever currently resolves `medidocs.luloai.com` at
   `mi-carpeta-medica.luloai.com` instead (or just start advertising the new
   hostname — both can run in parallel indefinitely).
4. Decommission `medidocs-ui` only once the new hostname has been stable —
   `kubectl delete -k apps/production/medidocs-ui` and remove it from
   `apps/production/kustomization.yaml` in a follow-up PR.

## Rollback

Free until step 4 — `medidocs-ui` keeps serving `medidocs.luloai.com`
untouched the whole time.
