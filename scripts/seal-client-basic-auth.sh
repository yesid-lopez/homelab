#!/usr/bin/env bash
# Generate a random basic-auth credential for a client and seal it for the
# lulo-demo-landings namespace.
#
# Usage:
#   scripts/seal-client-basic-auth.sh <client> [user] [password]
#
# Writes apps/production/client-sites/<client>/sealed-basic-auth.yaml
# and prints the cleartext credentials once (save them).

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <client> [user] [password]" >&2
  exit 1
fi

CLIENT="$1"
USERNAME="${2:-cliente}"
PASSWORD="${3:-$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-16)}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="$REPO_ROOT/apps/production/client-sites/$CLIENT"

if [[ ! -d "$DST" ]]; then
  echo "Client overlay not found at $DST. Run new-client-site.sh first." >&2
  exit 1
fi

for tool in kubeseal htpasswd; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing tool: $tool" >&2; exit 1; }
done

HTPASSWD=$(htpasswd -nbB "$USERNAME" "$PASSWORD")
AUTH_B64=$(printf '%s\n' "$HTPASSWD" | base64)

cat <<EOF | kubeseal \
  --format yaml \
  --controller-namespace flux-system \
  --controller-name sealed-secrets-controller \
  > "$DST/sealed-basic-auth.yaml"
apiVersion: v1
kind: Secret
metadata:
  name: ${CLIENT}-basic-auth
  namespace: lulo-demo-landings
type: Opaque
data:
  auth: $AUTH_B64
EOF

echo "Sealed basic-auth written to $DST/sealed-basic-auth.yaml"
echo
echo "Credentials for $CLIENT.demo.luloai.com:"
echo "  user: $USERNAME"
echo "  pass: $PASSWORD"
echo
echo "Save these — sealed secrets cannot be recovered from git."
