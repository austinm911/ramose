# Cursor Cloud environment notes

Non-obvious setup and runtime caveats for Cursor Cloud Agents working on Ripple.
Standard commands live in `README.md` and the `scripts` block of `package.json`;
this file is only the harness-specific detail. The update script has already
installed Bun and run `bun install`, so dependencies are ready when an agent starts.

## Tooling
- The package manager is **Bun** (not npm/pnpm). Node exists on the VM but is not
  used for dependency management. Bun is installed at `~/.bun/bin` and is already
  on `PATH`.

## Lint / test / build
- There is no separate linter. The type checker is the lint gate:
  `bun run typecheck` (`bunx tsc --noEmit`).
- Tests: `bun run test` (unit/integration across `packages/*` + `examples/todos`,
  ~390 tests via `bun:test`, no services required).
- `bun run test:e2e` runs `test/e2e` against a live peer and only executes when
  `RIPPLE_URL` is set (otherwise the tests skip). Point it at a local peer
  (`RIPPLE_URL=http://localhost:1337 bun run test:e2e`) or use
  `bun run test:e2e:cf` for a real Cloudflare deploy (below).
  - Known local caveat: against a local `alchemy dev` (miniflare) peer, the single
    e2e case "a write on another connection wakes db.live" fails consistently
    (cross-connection novelty over WebSockets does not propagate across isolates in
    miniflare local). Same-connection live queries work — the todos UI updates live
    on write. The remaining e2e cases pass. Don't chase this against a local peer —
    run it against real Cloudflare (below) to see the full suite pass.
- There is no production "build" step for local dev; the app runs via `alchemy dev`
  (miniflare) and Vite.

## Running the app (peer Worker + demo UI)
- The peer runs under Alchemy/miniflare, which emulates R2 + both Durable Objects
  in one process — there is **no external database** to start.
- Non-obvious startup requirements for `bun alchemy dev`:
  - Set `CI=1`. Without it, Alchemy tries interactive Cloudflare login and fails
    with `AuthError: No credentials configured` even in local mode.
  - Provide placeholder Cloudflare creds: `CLOUDFLARE_ACCOUNT_ID` (any 32-hex
    string) and `CLOUDFLARE_API_TOKEN=x`. `ALCHEMY_STATE=local` keeps state local.
  - Full command:
    `CI=1 ALCHEMY_STATE=local CLOUDFLARE_ACCOUNT_ID=0123456789abcdef0123456789abcdef CLOUDFLARE_API_TOKEN=x bun alchemy dev examples/todos/alchemy.run.ts`
- **Port gotcha:** this Alchemy version serves the peer on **`http://localhost:1337`**,
  not `8787` as written in `README.md`/docs. Point the UI and e2e tests at 1337:
  `VITE_RIPPLE_URL=http://localhost:1337 bunx vite examples/todos` (UI on `:5173`).
- HTTP API routes are prefixed per database: `POST /db/<name>/transact`,
  `POST /db/<name>/query`, `POST /db/<name>/pull`, `GET /db/<name>/info`. There is a
  top-level `GET /health`. In `tx` maps, every key must be a fully-qualified ident
  (e.g. `:todo/title`); a bare key like `done` is rejected as `tx/invalid`.

## Running the e2e suite against real Cloudflare

The `test/e2e` suite is self-contained — it creates its own `e2e-<ts>` database
and installs the schema — so it can run against any live peer. To run it against a
real Cloudflare deployment (the only place the cross-isolate live-query case can
pass), use the helper, which deploys a throwaway stage, runs the suite, and
destroys the stage afterwards (even on failure):

```sh
bun run test:e2e:cf
```

`bun run test:e2e:cf` wraps `scripts/e2e-cloudflare.sh`, which:
1. Deploys a uniquely-named stage (`e2e-<epoch>-<rand>`, or `ALCHEMY_STAGE` if set)
   with `ALCHEMY_STATE=local` and `CI=1` (env-var creds, non-interactive) — an
   **open** peer, no auth.
2. Parses the Worker URL from the deploy output and polls `/health`.
3. Runs `RIPPLE_URL=<url> bun run test:e2e`.
4. Destroys the stage (set `KEEP_STAGE=1` to leave it up for debugging).

### Required credentials (Cursor secrets + GitHub Environment secrets)

| Name | Required | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | yes | Deploy Workers / DOs / R2 / Analytics Engine |
| `CLOUDFLARE_ACCOUNT_ID` | yes | Account to deploy into |
| `RIPPLE_TOKEN` | no | Only if the peer is deployed with bearer auth |

Token permission groups (scoped to the account), at minimum:
- **Workers Scripts Write** (covers Durable Objects)
- **Workers R2 Storage Write**
- **Account Settings Read**

This stack also declares a Workers Analytics Engine dataset; grant **Account
Analytics Read/Edit** if a deploy reports an AE permission error.

- **Cursor Cloud:** Secrets panel for this environment / agent (then start a new
  agent so the secrets are injected). Without them, `bun run test:e2e:cf` exits
  immediately with a clear error; local `alchemy dev` still works with placeholders.
- **GitHub Actions:** secrets on the **Development** environment (Settings →
  Environments → Development). The workflow
  `.github/workflows/e2e-cloudflare.yml` sets `environment: Development` and
  runs the same `bun run test:e2e:cf` flow on every PR, every push to `master`,
  and `workflow_dispatch`.

### Auth note
The deploy is an open peer (no `RIPPLE_TOKEN`/`RIPPLE_POLICY`), so the throwaway
`workers.dev` URL is briefly writable by anyone who knows it. The stage name is
unguessable and torn down at the end of the run; if you need an authenticated peer,
set `RIPPLE_TOKEN` (and it is passed through to the test client).
