#!/usr/bin/env bash
# Force-pushes the `pkg` branch: packages/ramose as the repository root, so
# other repos can install it from git before an npm release:
#
#   bun add ramose@github:austinm911/ramose#pkg
#
# The branch is orphaned (no shared history) and rebuilt from scratch each
# run. Build `dist/` before copying so Node/esbuild/Alchemy consumers resolve
# the production export conditions to a complete module graph. Bun consumers
# still use the source export condition.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
branch="pkg"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# The Git package is consumed by Alchemy's Worker bundler under its default
# condition, not Bun's source condition. A clean publish build prevents stale
# or partial generated files from entering the installable branch.
(cd "$root" && bun run scripts/build-packages.ts --clean)
(cd "$root" && bun scripts/check-pkg-artifact.ts packages/ramose)

cp -R "$root/packages/ramose" "$tmp/pkg"
cd "$tmp/pkg"
rm -rf node_modules .git

# `package.json`'s exports map is authoritative and `check-pkg-artifact.ts`
# checks every declared default. Keep these explicit files as branch-level
# smoke checks for the public runtime entrypoints.
test -f dist/db/index.js
test -f dist/client/index.js
test -f dist/react/index.js
test -f dist/octane/index.js
test -f dist/worker/index.js

git init -q -b "$branch" .
git add -A
git -c user.email="${GIT_AUTHOR_EMAIL:-agent@local}" \
    -c user.name="${GIT_AUTHOR_NAME:-pkg-sync}" \
    commit -qm "ramose package root for git installs (from $(git -C "$root" rev-parse --short HEAD))"
git remote add origin "$(git -C "$root" remote get-url origin)"
git push -f origin "$branch"

echo "pushed $branch -> origin; install with:"
echo "  bun add ramose@$(git -C "$root" remote get-url origin | sed 's/.*github.com[:/]//;s/\.git$//')#$branch"
