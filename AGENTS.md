# Agent Rules

- Never delete PersistentVolumeClaims (PVCs) or volumes unless I explicitly consent.
- When I ask you to deploy something to the cluster, commit the changes and push to `main`.

## client-sites (demo landings)

- All demo landings share the namespace `lulo-demo-landings`. Never create a
  per-client namespace.
- To add a new client, use `scripts/new-client-site.sh <client>` followed by
  `scripts/seal-client-basic-auth.sh <client>`. Do not hand-write manifests —
  the templates in `apps/production/client-sites/_templates/` are the source
  of truth.
- After scaffolding, add the new client to
  `apps/production/client-sites/kustomization.yaml` so Flux picks it up.
- Docker images for client sites MUST be multi-arch
  (`linux/amd64,linux/arm64`). Build with `docker buildx build --platform
  linux/amd64,linux/arm64 --push …`. Single-arch images cause CrashLoopBackOff
  with `exec format error`.
- The `nginx.ingress.kubernetes.io/auth-realm` annotation must be ASCII only
  (no `·`, `ñ`, accents, etc.) or the nginx admission webhook rejects the
  ingress.
