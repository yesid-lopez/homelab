#!/usr/bin/env bash
# Seal the shared registry pull secret for the lulo-demo-landings namespace.
# Run once (or whenever the registry credentials rotate).
#
# Reuses .dockerconfigjson from temp-registry-secret.yaml at repo root.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="$REPO_ROOT/apps/production/client-sites/sealed-registry-secret.yaml"
TEMP_REG="$REPO_ROOT/temp-registry-secret.yaml"

if [[ ! -f "$TEMP_REG" ]]; then
  echo "Missing $TEMP_REG (template with .dockerconfigjson)." >&2
  exit 1
fi

command -v kubeseal >/dev/null 2>&1 || { echo "Missing kubeseal" >&2; exit 1; }

DOCKER_JSON_B64=$(awk '/\.dockerconfigjson:/ {print $2; exit}' "$TEMP_REG")

cat <<EOF | kubeseal \
  --format yaml \
  --controller-namespace flux-system \
  --controller-name sealed-secrets-controller \
  > "$DST"
apiVersion: v1
kind: Secret
metadata:
  name: registry-secret
  namespace: lulo-demo-landings
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: $DOCKER_JSON_B64
EOF

echo "Sealed registry secret written to $DST"
