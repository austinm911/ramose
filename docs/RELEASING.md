# Releasing

How to publish `@ripplegraph/core` and `@ripplegraph/alchemy` to npm. Only these two
packages are published — `worker`, `transactor`, `replica`, `storage`, the
website, and the examples stay `private: true` and never go to npm.

Publishing runs from `.github/workflows/publish.yml` using **npm trusted
publishing (OIDC)**. There is no `NPM_TOKEN` anywhere and none should ever be
added.

## Cutting a release

1. Bump `version` in `packages/core/package.json` **and**
   `packages/alchemy/package.json` to the same number (lockstep, e.g. `0.2.0`).
2. Merge to `master`.
3. Create a GitHub Release tagged `vX.Y.Z` — the tag must match the package
   versions exactly (the workflow strips the leading `v` and fails if either
   package.json disagrees). Drafts are safe; the workflow only runs when the
   release is **published**.
4. The `publish` workflow runs in the `npm` GitHub Environment: it installs,
   typechecks, tests, then publishes `@ripplegraph/core` first and
   `@ripplegraph/alchemy` second (alchemy depends on core). Alchemy's
   `workspace:*` dependency on core is rewritten to the real version in the
   job workspace only — nothing is committed back.

Notes:

- The workflow never bumps versions. The release tag is the source of truth
  and the package.json versions must already match it.
- This repo is private, so npm **cannot** generate provenance attestations.
  `publishConfig.provenance` is `false` in both packages; the absence of a
  provenance badge on npmjs.com is expected.
- Both packages publish TypeScript source (`files: ["src"]`, `exports` point
  at `src/*.ts`). There is no compile step.

## One-time setup (npm + GitHub dashboards)

These cannot be done from the repo; a maintainer clicks them once:

1. **GitHub Environment**: Settings → Environments → create one named exactly
   `npm`. Optional but recommended: add required reviewers so a publish needs
   a manual approval.
2. **npm scope**: on npmjs.com, create/own the `ripplegraph` org so the
   `@ripplegraph` scope is yours (the `ripple` npm username is taken).
3. **Trusted publisher**, for **each** of `@ripplegraph/core` and `@ripplegraph/alchemy`:
   Package settings → Trusted Publisher → GitHub Actions, with:
   - user: `tvanhens`
   - repository: `ripple`
   - workflow filename: `publish.yml` (npm matches on the filename only)
   - environment name: `npm`
   - allow `npm publish`
4. **First-ever publish**: if a package does not exist on npm yet, either
   configure the trusted publisher for the not-yet-published package (if
   npmjs.com offers that) or create the package first, then cut the first
   release. Do **not** check in an `NPM_TOKEN` to bootstrap.
5. **After trusted publishing works**: Package settings → Publishing access →
   require 2FA and disallow tokens.
