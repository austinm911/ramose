#!/usr/bin/env bash
# Force-pushes the `pkg` branch: packages/ramose as the repository root, so
# other Bun repos can install it from git before an npm release:
#
#   bun add ramose@github:austinm911/ramose#pkg
#
# The branch is orphaned (no shared history) and rebuilt from scratch each
# run. Only useful to Bun consumers: `dist/` is not committed, so the
# `types`/`default` export conditions dangle; the `bun` conditions point at
# `src/` and resolve fine.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
branch="pkg"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cp -R "$root/packages/ramose" "$tmp/pkg"
cd "$tmp/pkg"
rm -rf dist node_modules .git

git init -q -b "$branch" .
git add -A
git -c user.email="${GIT_AUTHOR_EMAIL:-agent@local}" \
    -c user.name="${GIT_AUTHOR_NAME:-pkg-sync}" \
    commit -qm "ramose package root for git installs (from $(git -C "$root" rev-parse --short HEAD))"
git remote add origin "$(git -C "$root" remote get-url origin)"
git push -f origin "$branch"

echo "pushed $branch -> origin; install with:"
echo "  bun add ramose@$(git -C "$root" remote get-url origin | sed 's/.*github.com[:/]//;s/\.git$//')#$branch"
