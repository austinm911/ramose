#!/usr/bin/env bash
# Ephemeral Cloudflare e2e: deploy → test/e2e → destroy.
#
# Required env:
#   CLOUDFLARE_ACCOUNT_ID
#   CLOUDFLARE_API_TOKEN
# Optional:
#   ALCHEMY_STAGE   (default: e2e-local)
#   RIPPLE_TOKEN    (bearer token if the peer was deployed with one)
set -euo pipefail

if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" || -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "::error::CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set" >&2
  exit 1
fi

STAGE="${ALCHEMY_STAGE:-e2e-local}"
LOG="$(mktemp)"
STATUS=0

cleanup() {
  echo "::group::alchemy destroy --stage ${STAGE}"
  bun alchemy destroy --stage "${STAGE}" --yes || true
  echo "::endgroup::"
  rm -f "${LOG}"
}
trap cleanup EXIT

echo "::group::alchemy deploy --stage ${STAGE}"
bun alchemy deploy --stage "${STAGE}" --yes 2>&1 | tee "${LOG}"
echo "::endgroup::"

# Stack outputs from alchemy.run.ts: { url, peerUrl } — prefer peerUrl.
extract_url() {
  local key="$1"
  grep -oE "${key}: \"https://[^\"]+\"" "${LOG}" | head -1 | sed -E "s/^${key}: \"//; s/\"$//"
}

URL="$(extract_url peerUrl)"
if [[ -z "${URL}" ]]; then
  URL="$(extract_url url)"
fi
if [[ -z "${URL}" ]]; then
  # Last resort: first workers.dev URL in the log.
  URL="$(grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' "${LOG}" | head -1 || true)"
fi
if [[ -z "${URL}" ]]; then
  echo "::error::could not parse deployed Worker URL from alchemy deploy output" >&2
  exit 1
fi

echo "RIPPLE_URL=${URL}"
echo "::group::bun test test/e2e"
RIPPLE_URL="${URL}" RIPPLE_TOKEN="${RIPPLE_TOKEN:-}" bun test test/e2e || STATUS=$?
echo "::endgroup::"

exit "${STATUS}"
