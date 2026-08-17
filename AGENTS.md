# Ripple

An immutable, Datomic-inspired graph database for Cloudflare (Workers + Durable
Objects + R2), built on the Effect runtime. It is a Bun monorepo with one product
(the engine + peer Worker in `packages/*`) and two consumer demos in `examples/*`.

See `README.md` for the product overview and `docs/` (`API.md`, `AUTH_LAYER.md`,
`RUNBOOK.md`) for details.

## Cursor Cloud specific instructions

The update script has already installed Bun and run `bun install`, so dependencies
are ready when a cloud agent starts. Standard commands live in `README.md` and the
`scripts` block of `package.json`; the notes below are only the non-obvious caveats.

### Tooling
- The package manager is **Bun** (not npm/pnpm). Node exists on the VM but is not
  used for dependency management. Bun is installed at `~/.bun/bin` and is already
  on `PATH`.

### Lint / test / build
- There is no separate linter. The type checker is the lint gate:
  `bun run typecheck` (`bunx tsc --noEmit`).
- Tests: `bun run test` (unit/integration across `packages/*` + `examples/todos`,
  ~390 tests via `bun:test`, no services required).
- `bun run test:e2e` runs `test/e2e` against a live peer and only executes when
  `RIPPLE_URL` is set (otherwise the tests skip); point it at the running peer,
  e.g. `RIPPLE_URL=http://localhost:1337 bun run test:e2e`. This suite is not part
  of CI.
  - Known local caveat: against a local `alchemy dev` (miniflare) peer, the single
    e2e case "a write on another connection wakes db.live" fails consistently
    (cross-connection novelty over WebSockets does not propagate across isolates in
    miniflare local). Same-connection live queries work — the todos UI updates live
    on write. The remaining e2e cases pass. Don't chase this against a local peer.
- There is no production "build" step for local dev; the app runs via `alchemy dev`
  (miniflare) and Vite.

### Running the app (peer Worker + demo UI)
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
