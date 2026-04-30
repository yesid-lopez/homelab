# Grafana user bootstrap

Grafana local users are not natively provisioned by the Grafana Helm chart. This folder includes a one-shot Kubernetes `Job` that creates the requested local user through the Grafana Admin HTTP API after Flux deploys Grafana.

## What is included

- `job-bootstrap-user.yaml`: idempotent bootstrap Job template. It is intentionally not referenced from `kustomization.yaml` yet, because the required user credential SealedSecret still needs to be generated first.
  - Reads the Grafana admin auth data from the chart-managed `grafana` Secret in the `grafana` namespace.
  - Reads the new user's login, email, display name, and initial credential from a separate Secret named `grafana-user-bootstrap-credentials` in the `grafana` namespace.
  - Checks whether the login already exists through `/api/users/lookup?loginOrEmail=...`.
  - Creates the user with `POST /api/admin/users` only when missing.

## What is still required before merging/applying

Create and commit a SealedSecret named `grafana-user-bootstrap-credentials` in the `grafana` namespace with these keys:

- `login`
- `email`
- `name`
- `credential`

Do **not** commit a plain Kubernetes Secret or plaintext credential.

Example local workflow from the repository root, using the cluster's sealed-secrets public certificate/context:

```bash
# 1. Build a temporary Secret manifest locally with the real values.
# 2. Pipe it directly into kubeseal.
# 3. Commit only the generated SealedSecret file.

kubectl -n grafana create secret generic grafana-user-bootstrap-credentials \
  --from-literal=login='<username-or-email>' \
  --from-literal=email='<email>' \
  --from-literal=name='<display-name>' \
  --from-literal=credential='<initial-credential>' \
  --dry-run=client -o yaml \
| kubeseal --format=yaml \
  > infrastructure/controllers/grafana/sealed-grafana-user-bootstrap-credentials.yaml
```

Then add both the generated file and the bootstrap Job to `infrastructure/controllers/grafana/kustomization.yaml`:

```yaml
resources:
  - sealed-grafana-user-bootstrap-credentials.yaml
  - job-bootstrap-user.yaml
```

## Re-running the Job

Kubernetes Jobs are effectively one-shot and their pod template is immutable. If the user needs to be recreated or the bootstrap logic must run again, open a new PR that changes the Job name, for example:

```yaml
metadata:
  name: grafana-bootstrap-user-d-aguti-v2
```

Do not run `kubectl apply` manually; let Flux reconcile the change after merge.
