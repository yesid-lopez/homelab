# client-sites

Demo landings for lead clients, all deployed in the shared namespace
`lulo-demo-landings` and served publicly at `<client>.demo.luloai.com`.

## Layout

```
client-sites/
  namespace.yaml              # shared namespace: lulo-demo-landings
  sealed-registry-secret.yaml # shared registry pull secret (sealed)
  kustomization.yaml          # lists shared resources + active clients
  _templates/                 # placeholder manifests for new clients
  <client>/                   # one folder per client (deploy + svc + ing)
```

## One-time setup (already done)

```bash
scripts/seal-shared-registry.sh
# → writes apps/production/client-sites/sealed-registry-secret.yaml
```

## Add a new client

```bash
scripts/new-client-site.sh <client>
# (push image to registry.yesidlopez.de/<client>:v0.0.1)
# add `- <client>` to ./kustomization.yaml
git add . && git commit -m "feat: add <client> demo site"
git push
```

Flux applies in ~1 minute. Image-automation picks up new semver tags
automatically and rewrites the deployment to redeploy.

## Conventions

- Image: `registry.yesidlopez.de/<client>` with semver tags (`v0.0.1`, …).
- All resources live in `lulo-demo-landings` namespace, named after the client.
- Registry pull secret is the only sealed secret here, because it shares
  credentials with other apps.
- Port: 3000 (Next.js standalone default).
- TLS via `luloai-issuer` (cert-manager). DNS via external-dns to
  `homelab.luloai.com`.
- Demos read the shared Umami website ID from ConfigMap
  `lulo-demo-preview-config` key `umamiWebsiteId`. They use
  `https://umami.yesidlopez.de/script.js` and segment by hostname plus the
  `demo_opened` event emitted by the app.
- First-open Discord notifications read optional Secret
  `lulo-demo-preview-webhook` key `webhookUrl`. Missing config does not block
  the pods; the app skips tracking or webhook delivery until those values
  exist.
