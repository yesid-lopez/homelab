---
name: add-client-demo-site
description: Deploy a new client demo landing to the homelab cluster — scaffolds K8s manifests in apps/production/client-sites/<client>/, seals basic-auth credentials, and registers the client in Flux. Use AFTER the site has been built and pushed to the registry (see the `add-client-landing` skill in the luloai-client-sites repo).
metadata:
  tags: kubernetes, flux, gitops, sealed-secrets, lulo-demo-landings, client-sites
---

## When to use

Trigger this skill when:
- The user says "deploy <client> to homelab", "add <client> demo site", "provision <client> in the cluster".
- OpenClaw (the Telegram bot) has already pushed `registry.yesidlopez.de/<client>:v1.0.<N>` and needs the K8s side.

Do NOT use to update an existing client — for that, just push a new image tag and Flux image-automation handles redeploy. This skill is for the **first-time provisioning** of a client overlay.

## Inputs

- `<client>`: valid DNS label, must match the folder name in `luloai-client-sites/sites/<client>/` and the image name in the registry.

## Prerequisite

The image `registry.yesidlopez.de/<client>:v1.0.<N>` MUST already exist in the registry. If not, run the `add-client-landing` skill in `~/git/lulo/landings/luloai-client-sites/` first and wait for the GitHub Action to finish.

## Steps

### 1. Sync main

```bash
cd ~/git/homelab
git checkout main && git pull --ff-only
```

### 2. Scaffold the K8s overlay

```bash
scripts/new-client-site.sh <client>
```

This copies `apps/production/client-sites/_templates/` into `apps/production/client-sites/<client>/` and replaces every `__CLIENT__` placeholder. The resulting overlay includes deployment, service, ingress (with basic-auth annotations), per-client image-automation policy, and a **placeholder `basic-auth.yaml` with `auth: ""`** so the site stays locked until step 3 runs.

### 3. Generate the basic-auth credential

```bash
scripts/set-client-basic-auth.sh <client> <firstname> <lastname>
# Convention: user = client's first name, pass = client's last name.
# Example: scripts/set-client-basic-auth.sh maria-fernanda-espana maria-fernanda espana
# If you omit the user/pass args, defaults are: user="cliente", pass=random 16 chars.
```

Output:
```
Wrote apps/production/client-sites/<client>/basic-auth.yaml

Credentials for <client>.demo.luloai.com:
  user: <firstname>
  pass: <lastname>
```

The credential is written as a **plain Kubernetes Secret in git** (the
password is bcrypt-hashed in the file, but the cleartext is the firstname /
lastname per convention — see `apps/production/client-sites/README.md`).
Rotation is just re-running the script and committing.

### 4. Register the client in the parent kustomization

Append the client to the `resources:` list in `apps/production/client-sites/kustomization.yaml`:

```bash
yq -i '.resources += ["<client>"]' apps/production/client-sites/kustomization.yaml
```

(Or hand-edit, appending `  - <client>` to the list.)

### 5. Commit and push

```bash
git add apps/production/client-sites/<client> apps/production/client-sites/kustomization.yaml
git commit -m "feat(client-sites): add <client>"
git push
```

### 6. Wait for Flux

Flux reconciles every minute. To force immediately:
```bash
flux reconcile source git flux-system
flux reconcile kustomization apps
```

Then verify:
```bash
kubectl -n lulo-demo-landings get pods,ingress,certificate | grep <client>
```

Expect the pod `Running 1/1`, certificate `READY True`, ingress with an ADDRESS.

### 7. Smoke-test the endpoint

```bash
curl -sI -u cliente:<captured-pass> https://<client>.demo.luloai.com/
# Expect: HTTP/2 200, x-powered-by: Next.js
```

If 401 even with credentials → wrong pass. If 503 → pod not ready (check logs). If DNS error after 5 min → check `kubectl get ingress` for the ADDRESS being set.

### 8. Deliver credentials to the client

Send via the channel the bot uses (Telegram, email):
```
URL:  https://<client>.demo.luloai.com
user: cliente
pass: <captured pass>
```

## Hard requirements (non-negotiable)

1. **Always use the scripts.** Do NOT hand-write manifests. The templates in `apps/production/client-sites/_templates/` are the source of truth and the scripts apply consistent substitutions.
2. **Shared namespace `lulo-demo-landings`.** Never create a per-client namespace. All clients live in this one namespace; per-client uniqueness comes from resource names (`<client>`) and the basic-auth secret name (`<client>-basic-auth`).
3. **Use the firstname/lastname convention for credentials.** `user=<firstname>`, `pass=<lastname>` (both lowercase, matching the slug). For compound first names, hyphenate (e.g. `maria-fernanda`). Plain-text Secret in git is intentional — these are low-stakes demos in a private repo.
4. **`nginx.ingress.kubernetes.io/auth-realm` must be ASCII only.** The templates already comply ("Demo Lulo AI"). If you customize, no accents, no `·`, no `ñ`.
5. **Image MUST be multi-arch** (linux/amd64 + linux/arm64). The GH Action in the sister repo handles this. Single-arch images cause `exec format error` on this cluster.
6. **Do NOT push manually built images.** The CI pipeline in `luloai-client-sites` is the only source of images for client sites. Manual pushes break the semver counter.

## What NOT to do

- Don't `kubectl apply` manifests directly to bypass GitOps. Flux is the only thing that should mutate the cluster state for these apps.
- Don't delete a client's PVC if one ever gets attached — these sites don't currently use PVCs but the homelab `AGENTS.md` rule still applies.
- Don't add `client-sites` entries to any kustomization other than `apps/production/client-sites/kustomization.yaml`. The parent (`apps/production/kustomization.yaml`) only references the folder once.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Pod `ImagePullBackOff` | Image not in registry yet, or wrong tag | Wait for GH Action; verify with `crane ls registry.yesidlopez.de/<client>` |
| Pod `CrashLoopBackOff` + `exec format error` | Single-arch image | Rebuild multi-arch via the GH Action |
| Ingress 503 | Pod not ready | `kubectl logs deployment/<client> -n lulo-demo-landings` |
| Cert never becomes Ready | external-dns / cert-manager misconfig | Check `kubectl describe certificate <client>-tls -n lulo-demo-landings` |
| `flux get image policy` not showing newer tag | Tag doesn't match semver regex `^v?[0-9]+\.[0-9]+\.[0-9]+$` | Tag with proper semver |

## See also

- `~/git/lulo/landings/luloai-client-sites/.claude/skills/add-client-landing/SKILL.md` — the site-source side, runs BEFORE this skill.
- `apps/production/client-sites/README.md` — operational overview.
- `CLAUDE.md` at the repo root — fuller conventions doc, including the "Client Demo Sites" section.
- `AGENTS.md` at the repo root — short rule list with the gotchas.
