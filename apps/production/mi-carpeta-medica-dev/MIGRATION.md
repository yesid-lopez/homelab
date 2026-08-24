# mi-carpeta-medica-api-dev → mi-carpeta-medica-dev

Straight cutover, not a staged migration: `mi-carpeta-medica-dev` groups what
will eventually be both the API and UI dev environments (the UI doesn't have
a dev overlay yet, so only `api/` exists here). `mi-carpeta-medica-api-dev`
is decommissioned in this same PR. Its CNPG cluster had no backup plugin —
disposable test data by design — so there's nothing to migrate.

Secrets (`SealedSecret`s under `api/sealed-secrets/`) were re-sealed for
real, using the sealed-secrets controller's private key pulled live from the
cluster (`flux-system` namespace) and immediately shredded after use — no
plaintext was committed or left on disk.

## After merge

```bash
kubectl -n mi-carpeta-medica-dev get pods
curl -s https://mi-carpeta-medica-api-dev.luloai.com/health
curl -s https://mi-carpeta-medica-auth-dev.luloai.com/health
```
