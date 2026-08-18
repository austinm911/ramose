# Releasing @ramose/core and @ramose/alchemy

Only two workspaces are published to npm: **`@ramose/core`** and
**`@ramose/alchemy`**, always in lockstep (same version). Every other workspace
(react, better-auth, replica, storage, transactor, worker, examples, website)
is `"private": true` and is never published.

Publishing happens exclusively from
[`.github/workflows/publish.yml`](../.github/workflows/publish.yml), which
runs only when a GitHub Release is **published**. A push to `master` never
publishes, and the workflow never bumps versions — the release tag is checked
against the versions already committed.

## Cutting a release

1. Bump `version` in **both** `packages/core/package.json` and
   `packages/alchemy/package.json` to the same new version (npm rejects
   republishing an existing version, and `0.1.0` is already taken).
2. Merge that to `master` through a normal PR (CI must pass).
3. On GitHub, create a Release with a tag named `vX.Y.Z` (leading `v`,
   matching the new version exactly) targeting `master`, and publish it.
   Drafting a release does nothing; only **publishing** triggers the workflow.

The workflow then installs with Bun, runs `typecheck` and the unit tests,
verifies both package versions equal the tag with the `v` stripped, and
publishes core first, then alchemy. Alchemy's `workspace:*` dependency on core
is rewritten to the lockstep version inside the job workspace only; nothing is
committed back.

## How authentication works

There is no `NPM_TOKEN` and no token secret anywhere. The workflow uses npm
**trusted publishing** (OIDC): `id-token: write` lets the job prove its
identity to npmjs.com, which matches it against the trusted publisher
configured on each package — user `tvanhens`, repo `ramose`, workflow filename
`publish.yml`, environment `npm`, allowed action `npm publish`. This requires
a GitHub-hosted runner and npm CLI ≥ 11.5.1 (the workflow upgrades npm).

Provenance attestation is disabled (`"provenance": false` in each package's
`publishConfig`) because the repository is private, so npm cannot verify the
source.

## One-time setup (already done)

- GitHub environment named exactly `npm` (Settings → Environments). Optional:
  required reviewers there make each publish need a manual approval.
- On npmjs.com, each package's settings → Trusted Publisher configured as
  described above.
