# Homelab Web

A Next.js overview page for the homelab GitOps repository.

## Run locally

```bash
cd web
npm install
npm run dev
```

Open http://localhost:3000.

## Build

```bash
cd web
npm run build
```

The app is intentionally kept separate from the Kubernetes manifests so it can be developed or deployed independently without changing the GitOps reconciliation structure.
