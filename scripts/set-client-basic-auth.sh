#!/usr/bin/env bash
# Write a PLAIN Secret with basic-auth credentials for a client.
#
# Stored as cleartext in git (the homelab repo is private and the demo sites
# are low-stakes — credentials are name/surname-style and rotation is cheap).
# The bcrypt hash inside the htpasswd line still hides the password from
# anyone who reads the Secret in the cluster but lacks git access; that is
# good enough for these demos.
#
# Usage:
#   scripts/set-client-basic-auth.sh <client> [user] [password]
#
# Writes apps/production/client-sites/<client>/basic-auth.yaml and prints
# the cleartext credentials.

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

command -v htpasswd >/dev/null 2>&1 || { echo "Missing htpasswd" >&2; exit 1; }

HTPASSWD=$(htpasswd -nbB "$USERNAME" "$PASSWORD")
AUTH_B64=$(printf '%s\n' "$HTPASSWD" | base64)

cat > "$DST/basic-auth.yaml" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: ${CLIENT}-basic-auth
  namespace: lulo-demo-landings
type: Opaque
data:
  auth: $AUTH_B64
EOF

echo "Wrote $DST/basic-auth.yaml"
echo
echo "Credentials for $CLIENT.demo.luloai.com:"
echo "  user: $USERNAME"
echo "  pass: $PASSWORD"
