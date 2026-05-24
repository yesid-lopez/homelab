#!/usr/bin/env bash
# Scaffold a new client-site overlay from templates.
#
# Usage:
#   scripts/new-client-site.sh <client-name>
#
# Creates apps/production/client-sites/<client-name>/ with all manifests
# pre-filled (deployment, service, ingress, image-automation, kustomization).
# Then run:
#   scripts/seal-client-basic-auth.sh <client-name>
# to generate the per-client sealed basic-auth secret.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client-name>" >&2
  exit 1
fi

CLIENT="$1"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/apps/production/client-sites/_templates"
DST="$REPO_ROOT/apps/production/client-sites/$CLIENT"

if [[ ! -d "$SRC" ]]; then
  echo "Templates not found at $SRC" >&2
  exit 1
fi

if [[ -e "$DST" ]]; then
  echo "Target already exists: $DST" >&2
  exit 1
fi

if ! [[ "$CLIENT" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
  echo "Client name must be a valid DNS label (lowercase, digits, hyphens)" >&2
  exit 1
fi

cp -R "$SRC" "$DST"

find "$DST" -type f -print0 | while IFS= read -r -d '' f; do
  sed -i.bak "s/__CLIENT__/$CLIENT/g" "$f"
  rm "$f.bak"
done

echo "Created overlay at $DST"
echo
echo "Next steps:"
echo "  1. scripts/seal-client-basic-auth.sh $CLIENT"
echo "  2. Push image to registry.yesidlopez.de/$CLIENT:v0.0.1"
echo "  3. Add '- $CLIENT' to apps/production/client-sites/kustomization.yaml"
echo "  4. Commit & push (Flux applies in ~1 min) or kubectl apply -k apps/production/client-sites"
