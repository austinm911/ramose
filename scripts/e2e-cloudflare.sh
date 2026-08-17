#!/usr/bin/env bash
#
# Run the e2e suite (test/e2e) against a REAL Cloudflare deployment.
#
# It deploys the Ripple stack to a throwaway, uniquely-named stage, waits for the
# peer's /health to answer, runs `bun run test:e2e` against the deployed URL, and
# then destroys the stage again — even if the tests fail.
#
# Requirements (set as environment variables / secrets):
#   CLOUDFLARE_API_TOKEN   API token that can deploy Workers + R2 (+ Durable
#                          Objects, which ride on Workers Scripts). See
#                          .cursor/CLOUD.md for the exact permission groups.
#   CLOUDFLARE_ACCOUNT_ID  The account to deploy into.
#
# Optional:
#   E2E_STAGE     Override the throwaway stage name (default: e2e-<epoch>-<rand>).
#   RIPPLE_TOKEN  Bearer token, only if you deploy an authenticated peer
#                 (RIPPLE_POLICY / RIPPLE_TOKEN). The default deploy is an open
#                 peer, so this is normally unset.
#   KEEP_STAGE=1  Do not destroy the stage on exit (for debugging a failure).
#
# Usage:
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./scripts/e2e-cloudflare.sh
#   bun run test:e2e:cf         # same thing, via package.json
set -euo pipefail

cd "$(dirname "$0")/.."

fail() { echo "error: $*" >&2; exit 1; }

[ -n "${CLOUDFLARE_API_TOKEN:-}" ] || fail "CLOUDFLARE_API_TOKEN is not set (see .cursor/CLOUD.md)."
[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || fail "CLOUDFLARE_ACCOUNT_ID is not set (see .cursor/CLOUD.md)."
command -v bun >/dev/null 2>&1 || fail "bun is not on PATH."

# A unique, DNS-safe stage isolates this run's Worker/DO/R2 resources so the
# deploy never collides with another stage and the destroy only removes our own.
STAGE="${E2E_STAGE:-e2e-$(date +%s)-${RANDOM}}"
DEPLOY_LOG="$(mktemp -t ripple-e2e-deploy.XXXXXX.log)"

# Local state store: this run's state lives in ./.alchemy, so we need no
# Cloudflare state permissions and `destroy` reconciles against exactly what we
# deployed. CI=1 makes Alchemy use env-var credentials non-interactively.
export ALCHEMY_STATE=local
export ALCHEMY_STAGE="$STAGE"
export CI=1

cleanup() {
  local code=$?
  if [ "${KEEP_STAGE:-0}" = "1" ]; then
    echo ">> KEEP_STAGE=1 set; leaving stage '$STAGE' deployed. Destroy later with:" >&2
    echo "   ALCHEMY_STATE=local CI=1 bun alchemy destroy --stage $STAGE --yes" >&2
  else
    echo ">> Destroying stage '$STAGE' ..." >&2
    bun alchemy destroy --stage "$STAGE" --yes || echo "warning: destroy failed for stage '$STAGE'; check the Cloudflare dashboard." >&2
  fi
  rm -f "$DEPLOY_LOG"
  exit "$code"
}
trap cleanup EXIT

echo ">> Deploying stage '$STAGE' to Cloudflare ..."
bun alchemy deploy --stage "$STAGE" --yes 2>&1 | tee "$DEPLOY_LOG"

# The stack prints its outputs ({ url, peerUrl }) at the end of a deploy; the
# peer is reachable at its workers.dev URL.
URL="$(grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' "$DEPLOY_LOG" | head -n1 || true)"
[ -n "$URL" ] || fail "could not find a workers.dev URL in the deploy output. If you use a custom domain, set RIPPLE_URL and run 'bun run test:e2e' directly."

echo ">> Deployed peer: $URL"

echo ">> Waiting for $URL/health ..."
ok=""
for i in $(seq 1 30); do
  if curl -fsS "$URL/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || fail "peer did not become healthy at $URL/health within ~60s."
echo ">> Peer is healthy."

echo ">> Running e2e suite against $URL ..."
RIPPLE_URL="$URL" RIPPLE_TOKEN="${RIPPLE_TOKEN:-}" bun run test:e2e
