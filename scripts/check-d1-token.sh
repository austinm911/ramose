#!/usr/bin/env bash
# Prove CLOUDFLARE_API_TOKEN can call the D1 API before Alchemy spends a
# deploy on AuthDb. Cloudflare returns 401 / code 10000 "Authentication
# error" when the token is valid for Workers/R2 but the D1 permission
# group is missing — the same envelope Alchemy then prints as
# `Unauthorized: Authentication error` from Cloudflare/D1/Database.ts.
set -euo pipefail

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Need CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. See CONTRIBUTING.md." >&2
  exit 1
fi

body="$(mktemp "${TMPDIR:-/tmp}/ramose-d1-check.XXXXXX.json")"
trap 'rm -f "$body"' EXIT

code="$(
  curl -sS -o "$body" -w '%{http_code}' --max-time 30 \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database"
)"

if [ "$code" = "200" ]; then
  echo "D1 API reachable (HTTP 200)."
  exit 0
fi

echo "::error::CLOUDFLARE_API_TOKEN cannot list D1 databases (HTTP ${code}). Add Account / D1 / Edit to the token on the Development environment — Workers/R2 access is not enough. Cloudflare reports a missing D1 grant as 401 Authentication error (code 10000)." >&2
# The envelope is {success, errors, messages} — no token, no secret.
if command -v python3 >/dev/null 2>&1; then
  python3 -c 'import json,sys; json.dump(json.load(open(sys.argv[1])), sys.stderr, indent=2); print("", file=sys.stderr)' "$body" || cat "$body" >&2
else
  cat "$body" >&2
fi
exit 1
