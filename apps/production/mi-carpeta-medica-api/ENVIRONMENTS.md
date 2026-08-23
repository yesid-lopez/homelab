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
- `SUPABASE_JWT_SECRET` (backend code merged in `medical-docs`) is wired
  from `mi-carpeta-medica-api-supabase-secrets` / key `JWT_SECRET` in both
  overlays:
  - **dev**: that key is GoTrue's own signing secret — the same self-hosted
    service issues and verifies the tokens.
  - **prod**: ⚠️ **that key does not exist yet.** See below.
- dev's MinIO bucket (`mi-carpeta-medica-api`) and Zilliz collection
  (`medical_documents`) are the *same* ones prod uses — safe to share
  because every row/chunk is scoped by `owner_id`, and dev/prod issue
  disjoint user ids (self-hosted GoTrue vs. Supabase Cloud). Revisit if
  storage volume ever becomes a concern.
- dev data isn't backed up (no barman/ObjectStore plugin on its CNPG
  cluster) — disposable test data by design.

## ⚠️ Before cutting any new release

`base/deployment.yaml` now requires `mi-carpeta-medica-api-supabase-secrets`
to have a `JWT_SECRET` key in **every** namespace it's deployed to — the
pod fails to start without it (not just 401s, the container itself won't
come up). `prod/sealed-supabase-secrets.yaml` only carries `SUPABASE_URL` /
`SUPABASE_ANON_KEY` today (non-secret, fetched via the Supabase MCP). Before
the next `mi-carpeta-medica-api` release ships:

1. Pull the real JWT secret and a Postgres connection string from the
   Supabase dashboard (Project Settings → API / → Database) — not exposed
   through MCP tools by design.
2. Add `JWT_SECRET` (and, once the Postgres cutover happens, connection
   details) to `prod/sealed-supabase-secrets.yaml` and re-seal.

## Verifying dev

```bash
kubectl -n mi-carpeta-medica-api-dev get pods
curl https://mi-carpeta-medica-api-dev.luloai.com/health
```

GoTrue itself has no Ingress (internal-only) — reach it via
`kubectl -n mi-carpeta-medica-api-dev port-forward svc/mi-carpeta-medica-api-gotrue 9999:9999`
then `curl localhost:9999/health`.

`mi-carpeta-medica-ui` still needs its own `dev/` overlay before the web
client can point at this environment — not done here.
