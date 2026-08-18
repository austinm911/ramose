# Contributing to Ripple

Development notes for people changing Ripple itself. Consumer docs stay in
[`README.md`](README.md); ops for a running deployment are in
[`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Local checks

```sh
bun install
bun run typecheck
bun test                        # unit/integration (~390 tests, no services)
```

Local peer + UI (miniflare): see [`README.md`](README.md). Cursor Cloud Agents
should also read [`.cursor/CLOUD.md`](.cursor/CLOUD.md) for harness-specific
port and credential caveats.

## End-to-end tests

`test/e2e` runs against a live peer and skips when `RIPPLE_URL` is unset:

```sh
RIPPLE_URL=http://localhost:1337 bun run test:e2e   # local alchemy dev
bun run test:e2e:cf                                 # real Cloudflare (below)
```

The full suite, including the cross-connection `db.live` wake case, passes
against local miniflare. Run against real Cloudflare for the production-shaped
check.

### Against real Cloudflare

`bun run test:e2e:cf` runs `scripts/e2e-cloudflare.sh`:

1. Deploys a uniquely named Alchemy stage (`e2e-<epoch>-<rand>`, or
   `ALCHEMY_STAGE` if set) with `ALCHEMY_STATE=local` and `CI=1`
2. Waits for `/health`, then for Durable Objects via `/db/e2e-warmup/info`
3. Runs `RIPPLE_URL=<url> bun run test:e2e`
4. Destroys the stage (set `KEEP_STAGE=1` to leave it up)

Required credentials:

| Name | Kind | Required | Purpose |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | yes | Workers / DOs / R2 / Analytics Engine |
| `CLOUDFLARE_ACCOUNT_ID` | variable or secret | yes | Account to deploy into |
| `RIPPLE_TOKEN` | secret | no | Only if the peer is deployed with bearer auth |

Token permission groups (account-scoped), at minimum: **Workers Scripts Write**
(covers Durable Objects), **Workers R2 Storage Write**, **Account Settings
Read**. Grant **Account Analytics Read/Edit** if a deploy reports an Analytics
Engine permission error.

The throwaway deploy is an open peer (no `RIPPLE_TOKEN` / `RIPPLE_POLICY`); the
stage name is unguessable and torn down at the end of the run.

## CI

| Workflow | When | What |
|---|---|---|
| `.github/workflows/ci.yml` | every PR and push to `master` | `typecheck` + unit tests |
| `.github/workflows/e2e-cloudflare.yml` | every PR, push to `master`, and `workflow_dispatch` | `bun run test:e2e:cf` |
| `.github/workflows/docs-preview.yml` | PRs touching `website/` | deploy a `pr-<n>` preview of the docs site, comment the URL, destroy on close |

The e2e and docs-preview jobs use the GitHub **Development** environment
(`environment: Development`). Put `CLOUDFLARE_API_TOKEN` there as a secret and
`CLOUDFLARE_ACCOUNT_ID` as a variable (or secret). Cursor Cloud Agents need the
same names in the Cursor secrets panel — see [`.cursor/CLOUD.md`](.cursor/CLOUD.md).

Each run deploys its own Alchemy stage (`ALCHEMY_STAGE=e2e-<run_id>-<attempt>`),
so Worker / Durable Object / R2 names do not collide across parallel jobs. A
fresh workers.dev hostname is eventually consistent across the edge, so a colo
can serve the HTML placeholder (or 1042/1104/"Worker not found") mid-suite;
both the e2e `Peer` harness and the alchemy HTTPS client classify those as
transient and retry them with jittered backoff — application errors never
retry, and CI does **not** serialize the whole account.

### Docs previews

A PR that touches `website/` gets its own preview deployment: an Alchemy stage
named `pr-<number>` (an assets-only Worker on workers.dev), with the URL
posted/updated as a PR comment on every push. When the PR closes — merged or
not — the stage is destroyed and the comment is edited to say so.

Stack state runs with `ALCHEMY_STATE=local` and the `.alchemy/` directory is
carried between runs via the Actions cache, so re-pushes update the same
Worker (stable URL) and teardown can destroy exactly what deploy created. If
the cache was evicted (a PR idle for over a week), teardown falls back to
deleting the Worker named in the preview comment directly via the Cloudflare
API. The minimal CI token above covers everything; Cloudflare-hosted Alchemy
state (`Cloudflare.state()`) is not used because its state store needs Secrets
Store and edge-preview token scopes beyond that minimal set.
