# dev / prod split — multi-user auth groundwork

`mi-carpeta-medica-api` (and `mi-carpeta-medica-ui`) are split into `base/`
+ overlay folders, with a real `dev` environment next to the existing
`prod` one.

## Why

Per-user document ownership (each user only sees their own
documents/consultations) needs an identity provider. The plan: adopt
Supabase's Auth (GoTrue) + Postgres model in both environments, so the same
JWT-verification code in FastAPI works everywhere — only where the JWT
comes from, and which Postgres it points at, differs per environment.

- **prod**: a real Supabase Cloud project (already created — see
  `prod/sealed-supabase-secrets.yaml`). Eventually its Postgres replaces the
  CNPG cluster that's running today.
- **dev**: self-hosted in this same k8s cluster — GoTrue (`dev/gotrue.yaml`)
  + its own CNPG Postgres (`dev/postgres-cluster.yaml`), so iterating
  doesn't depend on the internet or a second cloud project.

## Current state

- `mi-carpeta-medica-api` and `mi-carpeta-medica-ui`: flat manifests moved
  into `base/` (shared) + `prod/` (today's exact setup — CNPG, Redis, MinIO,
  registry secrets — unchanged behavior).
- `dev/` includes `../base` (FastAPI + worker + Redis + Ingress), patched
  for the `mi-carpeta-medica-api-dev` namespace and the
  `mi-carpeta-medica-api-dev.luloai.com` hostname, plus its own CNPG
  Postgres and self-hosted GoTrue.
- Every environment-specific value `base/deployment.yaml` needs
  (`mi-carpeta-medica-api-postgres-app`, `mi-carpeta-medica-api-secrets`,
  `mi-carpeta-medica-api-supabase-secrets`, `minio-credentials`,
  `registry-secret`) resolves by **name alone** — dev and prod each just
  need a same-named secret/cluster in their own namespace. No per-overlay
  env patches required beyond the namespace and ingress host.
- Auth verification (`medical-docs` backend) picks its mode from which env
  var actually resolves to a value — both `secretKeyRef`s are `optional:
  true`, so a namespace only needs the key it actually has:
  - **dev**: `mi-carpeta-medica-api-supabase-secrets` has `JWT_SECRET`
    (GoTrue's own signing secret) but no `SUPABASE_URL` → static HS256
    verification, self-hosted GoTrue issues and verifies.
  - **prod**: that secret has `SUPABASE_URL`/`SUPABASE_ANON_KEY` but no
    `JWT_SECRET` → JWKS verification against the real Supabase Cloud
    project. Discovered along the way: that project's active signing key
    is asymmetric (ECC/P-256), not the legacy HS256 secret, which is why
    the backend supports both modes now (see `medical-docs`#8).
- dev's MinIO bucket (`mi-carpeta-medica-api`) and Zilliz collection
  (`medical_documents`) are the *same* ones prod uses — safe to share
  because every row/chunk is scoped by `owner_id`, and dev/prod issue
  disjoint user ids (self-hosted GoTrue vs. Supabase Cloud). Revisit if
  storage volume ever becomes a concern.
- dev data isn't backed up (no barman/ObjectStore plugin on its CNPG
  cluster) — disposable test data by design.

## Release safety

Both `SUPABASE_URL` and `SUPABASE_JWT_SECRET` are wired via `optional:
true` `secretKeyRef`s, and both are optional at the Settings level too —
a namespace missing one just resolves to `None` for that value, it never
fails to mount or crashes on boot. prod (`SUPABASE_URL` only, no
`JWT_SECRET`) uses JWKS; dev (`JWT_SECRET` only) uses the static secret.
Cutting a release is safe for both today.

Postgres is the one prod cutover still pending: prod's CNPG cluster is
untouched, still serving from the old (pre-multi-user) schema state until
someone pulls a connection string from the Supabase dashboard and does the
parallel-then-cutover migration described in `prod/MIGRATION.md`'s
pattern.

## Verifying dev

```bash
kubectl -n mi-carpeta-medica-api-dev get pods
curl https://mi-carpeta-medica-api-dev.luloai.com/health
```

GoTrue now has its own public Ingress (`dev/gotrue-ingress.yaml`), rate-limited
and TLS-only, since signup is disabled/invite-only:
`curl https://mi-carpeta-medica-auth-dev.luloai.com/health`. It's still also
reachable in-cluster via
`kubectl -n mi-carpeta-medica-api-dev port-forward svc/mi-carpeta-medica-api-gotrue 9999:9999`.

`mi-carpeta-medica-ui` still needs its own `dev/` overlay before the web
client can point at this environment — not done here.
