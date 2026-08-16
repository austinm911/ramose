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
- `packages/alchemy` — Alchemy 2 + Effect interface (`Ripple.Database` resource, Read/Write/ReadWrite capabilities).
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

## Alchemy / Effect interface

`@ripple/alchemy` exposes Ripple to Alchemy 2 the way `alchemy/Cloudflare`
exposes KV: a resource for the thing, capabilities for using it, and one
Effect-native client behind three transports. Full example (type-checked):
`examples/alchemy-kv-style.ts`.

```ts
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Ripple from "@ripple/alchemy";
import * as Layer from "effect/Layer";

export const Peer = Cloudflare.Worker("Peer", { main: "./packages/worker/src/index.ts", env: { /* … */ } });
export const Movies = Ripple.Database("Movies", { peer: Peer, name: "movies" });

// inside an Effect-form Worker (deploy time: lowers a `service` binding to the peer)
const db = yield* Ripple.ReadWriteDatabase(Movies);
// per request
const ack  = yield* db.transact([{ ":user/name": "Ada" }]);
const rows = yield* db.q({ find: ["?n"], where: [["?e", ":user/name", "?n"]] }, [], { minT: ack.t });
const past = yield* db.asOf(ack.t - 1).q(/* … */);
const ada  = yield* db.entity(17);

export default Alchemy.Stack("app", {
  providers: Layer.mergeAll(Cloudflare.providers(), Ripple.providers()),
  state: Cloudflare.state(),
}, /* … */);
```

- **Resource** — `Ripple.Database(id, { peer, name?, token?, probe? })`, guard `Ripple.isDatabase`.
  Attributes: `name`, `url`, `databaseUrl`, `peerName`, `token`. A Ripple database is a *name*
  (the Transactor DO is `idFromName(name)`; the log lives under `db/<name>/…`), so the provider
  creates nothing — it pins the name, derives the URLs, and proves the peer serves `/health`.
  `destroy` forgets the name; it does **not** erase the log, the segments, or the DOs.
- **Capabilities** — `Ripple.ReadDatabase` / `WriteDatabase` / `ReadWriteDatabase`.
  Client: `transact`, `q`, `query` (with `x-ripple-*` meta), `pull`, `entity`, `info`, `health`,
  and the `asOf(t)` / `history()` views; `minT` is the read fence.
- **Layers** — `*DatabaseBinding` (Worker service binding to the peer, same-colo, no public hop),
  `*DatabaseHttp` (plain HTTPS, works anywhere), `*DatabaseLocal` (`Alchemy.Action`, `alchemy dev`).
- **Errors** — tagged, one per condition the peer/DOs report: `TxRejected`, `TransactorDead`,
  `BadRequest`, `NotFound`, `Unauthorized`, `QueryBudgetExceeded`, `Internal`, `NetworkError`
  (union `Ripple.DatabaseError`, guard `Ripple.isDatabaseError`). Catch them with
  `Effect.catchTags` instead of reading status codes.
- **Outside Alchemy** — `Ripple.Client.make({ url, name, token?, fetch? })` gives the same
  Effect client to bun scripts and tests.

## Operations

See `docs/RUNBOOK.md` (metrics/events to watch, the single-writer write
ceiling and how to split a database, tuning knobs, recovery).

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
