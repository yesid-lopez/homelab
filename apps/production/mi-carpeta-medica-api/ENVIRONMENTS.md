# dev / prod split — multi-user auth groundwork

This PR restructures `mi-carpeta-medica-api` (and `mi-carpeta-medica-ui`)
into `base/` + overlay folders, and stands up a real `dev` environment next
to the existing `prod` one. It's infrastructure-only: no application code
changes yet, nothing in the currently-running `prod` namespace is touched
functionally.

## Why

Building per-user document ownership (each user only sees their own
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

## What this PR does

- `mi-carpeta-medica-api` and `mi-carpeta-medica-ui`: flat manifests moved
  into `base/` (shared) + `prod/` (today's exact setup — CNPG, Redis, MinIO,
  registry secrets — unchanged behavior) + (api only) a new `dev/` overlay.
- `dev/` stands up: namespace `mi-carpeta-medica-api-dev`, an empty CNPG
  Postgres cluster, and a self-hosted GoTrue deployment pointed at it.
- Root `apps/production/kustomization.yaml` updated to reference
  `mi-carpeta-medica-api/dev`, `mi-carpeta-medica-api/prod`,
  `mi-carpeta-medica-ui/prod` instead of the old flat entries.
- `ImageUpdateAutomation.spec.update.path` for both apps now points at
  `base/` (where the `$imagepolicy` setter markers live), since `base/` is
  shared by every overlay — one automation bumps the image tag both dev and
  prod build from.

## What this PR deliberately does NOT do

- **No FastAPI/worker/UI Deployment in `dev` yet.** The app has no
  Supabase-JWT-verification code yet, so there's nothing for it to talk to.
  Once that backend work lands, extend `dev/kustomization.yaml` to include
  `../base` (like `resumelo`'s dev overlay does) with an ingress/env patch,
  the same way `mi-carpeta-medica-ui` will need a `dev/` overlay of its own.
- **`prod`'s CNPG Postgres is untouched.** Cutting prod over to the Supabase
  Cloud project's Postgres is a separate, later step — same
  parallel-then-cutover shape as `prod/MIGRATION.md` (the medidocs→
  mi-carpeta-medica rename): stand up in parallel, verify, cut over,
  decommission last.
- **No Redis/MinIO for `dev`.** Nothing consumes them yet either — added
  alongside the `dev` app Deployment in the follow-up.
- **dev data isn't backed up** (no barman/ObjectStore plugin on its CNPG
  cluster) — it's disposable test data by design (see
  [[mi-carpeta-medica-multiuser-auth]] design conversation: pre-launch, no
  real data to protect yet).

## Before this is usable

1. Merge this PR, confirm `mi-carpeta-medica-api-dev` pods come up healthy
   (`kubectl -n mi-carpeta-medica-api-dev get pods`) and
   `kubectl -n mi-carpeta-medica-api-dev port-forward svc/mi-carpeta-medica-api-gotrue 9999:9999`
   then `curl localhost:9999/health` returns ok.
2. `prod/sealed-supabase-secrets.yaml` currently only carries
   `SUPABASE_URL` / `SUPABASE_ANON_KEY` (both non-secret, fetched via the
   Supabase MCP). The backend will also need the **JWT secret** and a
   Postgres **connection string** from the Supabase dashboard (Project
   Settings → API / → Database) — those aren't exposed through MCP tools by
   design and have to be pulled manually, then added to this secret and
   re-sealed.
3. Backend code changes (JWT verification dependency, `owner_id` columns,
   per-repository filtering) — tracked separately in `medical-docs`.
