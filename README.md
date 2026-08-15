# Ripple

An immutable, Datomic-inspired database for Cloudflare: single-writer
transactor as a Durable Object, indexes as immutable segment trees in R2,
datalog queries executed at the edge. See `SPEC.md` for the design and
milestones; `bench/RESULTS.md` for recorded numbers.

## Layout

- `packages/core` — pure TS engine (datoms, segments, trees, novelty, datalog). No Cloudflare deps.
- `packages/storage` — R2 node store (memory → Cache API → R2), root/log records, GC.
- `packages/transactor` — the write path (`Transactor`, runtime-agnostic) + Durable Object shell + indexer.
- `packages/replica` — QueryReplica DO (novelty subscriber, basis endpoint).
- `packages/worker` — the peer Worker (HTTP API, edge query execution). Exports both DO classes.
- `packages/client` — TS SDK.
- `bench/`, `test/e2e/` — benches and end-to-end tests.

## Commands

```sh
bun install
bun test                      # core + transactor unit/property tests
bun run typecheck
bun run bench                 # M1 seek/join + M2 transactor benches (in-process)

# local stack (Worker + DOs + R2 emulated by miniflare via Alchemy)
ALCHEMY_STATE=local CLOUDFLARE_ACCOUNT_ID=<any 32 hex> CLOUDFLARE_API_TOKEN=x bun alchemy dev
RIPPLE_URL=http://localhost:1337 bun test test/e2e
RIPPLE_URL=http://localhost:1337 bun run bench/write-do.bench.ts 64 5

# real deploys (Cloudflare credentials via `bun alchemy login` or env)
bun alchemy deploy            # $USER stage
bun alchemy deploy --stage prod
```

`ALCHEMY_STATE=local` keeps Alchemy's state in `.alchemy/` instead of the
Cloudflare state store; the local runtime still wants an account id in the
environment, any placeholder works for emulation.

## HTTP API (Worker)

```
GET  /health
POST /db/:name/transact   { tx }                          → { t, txEid, tempids, datoms }
POST /db/:name/query      { query, inputs?, asOf?, history? } → { t, root, result }
POST /db/:name/pull       { eid, pattern, asOf?, history? }
GET  /db/:name/entity/:eid[?asOf=]
GET  /db/:name/info
POST /db/:name/admin/index | /admin/gc
```
