# Ripple — Implementation Plan

**Ripple** is a new immutable database inspired by Datomic, built for Cloudflare: single-writer transactor as a Durable Object, indexes as immutable segment trees in R2, datalog queries executed at the edge next to the app. It is not a Datomic port or compatibility layer — it is its own database. Runtime tooling is **Bun**; infrastructure is defined with **Alchemy (alchemy.run)**.

> **Agent instructions:** Before writing any infrastructure code, read `https://alchemy.run/llms.txt` and the getting-started guide, and follow the **current** Alchemy API exactly — Alchemy has migrated API styles before (async-resource style → Effect-based style), so treat the sketch in §4 as intent, not gospel. Use `bun` for everything: installs, scripts, tests (`bun test`), and deploys (`bun alchemy deploy` or the current documented command).

---

## 1. Core design invariants (do not violate)

1. **Indexes are data, not services.** EAVT/AEVT/AVET/VAET are immutable segment trees stored in R2. There are NO per-index Durable Objects. Every index seek must be resolvable from local memory, edge cache, or R2 — never via a DO hop.
2. **One writer per database.** A single Transactor DO per logical database serializes all writes, assigns monotonic `t`, and owns the current root pointer.
3. **Everything in R2 is immutable and content-addressed** (named by SHA-256 of contents), except one tiny mutable key per database: `root/current`. Immutable objects get `Cache-Control: public, max-age=31536000, immutable`.
4. **Queries run in the peer** (Worker or QueryReplica DO), which merges: cached segments (as of last index root) + live novelty (datoms since that root).
5. **QueryReplica DOs are first-class, not optional.** Workers are per-request and cannot hold a novelty WebSocket; replicas are the long-lived subscribers. Workers must never read novelty/basis-t from the Transactor directly — always from a replica.
6. **Index incrementally and often.** Small frequent merges keep novelty tiny (bounds replica memory and freshness lag) and keep indexer runs within DO CPU/memory limits.
7. **Old roots are kept** (`roots/<t>`) → `as-of` / `history` queries work by starting from an old root. GC deletes only objects unreachable from every retained root.

## 2. Component overview

| Component | Runtime | Responsibility |
|---|---|---|
| **Transactor DO** (1 per db) | Durable Object + SQLite storage | Validate tx, resolve tempids, assign `t`, group-commit to log, broadcast novelty over WebSocket, publish new roots |
| **Indexer** | DO alarm on the Transactor (or separate DO); Workflows/Container later for big merges | Merge accumulated log into new segment trees, write to R2 with structural sharing, publish root, schedule GC |
| **R2 bucket** | R2 | `seg/<hash>` leaves, `n/<hash>` directory nodes, `log/<t0>-<t1>` chunks, `roots/<t>`, `root/current` |
| **QueryReplica DO** (N per db, sharded by tenant/region) | Durable Object + SQLite | Holds novelty WS to Transactor, hot segment cache (memory + SQLite), serves basis-t + novelty (and optionally full queries) to Workers |
| **Worker "peer"** | Worker | HTTP/WS API, datalog engine, plan → seek → join over cached segments, novelty merge, Cache API integration |
| **Client SDK** | TS package | Transact + query API, optional client-side novelty subscription |

### Data flows
- **Write:** client → Worker → Transactor DO → group-commit to log (DO SQLite) → ack → novelty broadcast (WS) to replicas.
- **Read:** client → Worker → get basis-t + novelty from nearest QueryReplica → fetch needed segments (memory → Cache API → R2) → local datalog join → merge novelty → respond.
- **Index:** alarm fires → read log since last root → rewrite touched paths only (O(Δ·depth) new objects) → write to R2 → Transactor adopts new root → replicas drop merged novelty.

## 3. Repository layout

```
ripple/
  alchemy.run.ts            # infrastructure definition (Alchemy)
  package.json              # bun; workspaces if desired
  packages/
    core/                   # pure TS, no CF deps — runs under `bun test` directly
      src/datom.ts          #   datom type, value encoding, key comparators (E/A/V/T orders)
      src/segment.ts        #   segment encode/decode (sorted datoms, compressed)
      src/tree.ts           #   node format, seek, range-scan, tree builder, structural-sharing merge
      src/query/            #   datalog: parser, planner (seek-driven), executor, pull
      src/novelty.ts        #   in-memory sorted novelty set + merge iterator
    worker/                 # the peer
      src/index.ts          #   routes: /transact /query /db-info
      src/peer.ts           #   SegmentSource: mem-cache → Cache API → R2
    transactor/
      src/transactor-do.ts  #   tx pipeline, group commit, WS hub, root ownership
      src/indexer.ts        #   alarm-driven incremental index merge + GC marking
    replica/
      src/replica-do.ts     #   novelty subscription, hot-segment SQLite cache, basis endpoint
    client/                 # thin SDK
  bench/                    # write throughput, seek latency, join benchmarks
  test/e2e/                 # against `alchemy dev`/local emulation
```

## 4. Infrastructure (Alchemy) — intent sketch

One Worker, two DO namespaces (SQLite-backed), one R2 bucket. Bind the bucket to the Worker AND to both DO classes. Verify exact API against current Alchemy docs before implementing.

The §4 code sample in the original brief is v1-style (`await alchemy()`, `await Worker()`). Current Alchemy is Effect-based (`Alchemy.Stack`, `Cloudflare.Worker`, `Cloudflare.DurableObject`, `Cloudflare.R2Bucket`). Follow the current API.

Notes:
- DO classes must be exported from the Worker entrypoint (single-script pattern) unless current Alchemy supports/prefers separate scripts — follow the docs.
- Use `bun alchemy dev` (or documented equivalent) for local dev; R2 + DOs are emulated via miniflare under the hood.
- Stages: default `$USER` stage for dev, `prod` stage for deploys.

## 5. Data formats

### 5.1 Datom
`[e a v t op]` — `e`: u64 entity id; `a`: interned attribute id (u32) with an `ident` schema map; `v`: tagged value (string | i64 | f64 | bool | ref(u64) | uuid | inst | bytes); `t`: u64; `op`: assert/retract bit.

- **Value encoding must be order-preserving bytes** (needed for AVET/VAET key comparison): type tag byte + big-endian/lexicographic payload. Write exhaustive comparator tests first — subtle ordering bugs here poison everything above.
- Schema is itself datoms (Datomic-inspired): `:db/ident`, `:db/valueType`, `:db/cardinality`, `:db/unique`, `:db/index` (controls AVET membership), ref-ness (controls VAET membership).

### 5.2 Segment (leaf)
Sorted datoms in index order. Format: header (index-id, count, min/max key) + column-ish packed datoms + gzip/zstd. Target ~3k datoms, 4–50 KB compressed. Named `seg/<sha256>`.

### 5.3 Directory node
Sorted array of `(firstKey, childHash, childType)` — fan-out target ~1024. Named `n/<sha256>`. Root is just a directory node whose hash appears in a root record.

### 5.4 Root records
```
root/current  → { t, eavt, aevt, avet, vaet, log_watermark }   // ONLY mutable key
roots/<t>     → same shape, immutable history of roots
```
`root/current` is served with `no-store`; peers learn new roots via replica push, not polling.

### 5.5 Log
Transactor appends tx data to DO SQLite (source of truth for un-indexed data) and periodically flushes chunks to `log/<t0>-<t1>` in R2 (backup + indexer input + replica catch-up).

## 6. Milestones (de-risk order — do them in this order)

### M0 — Scaffold (small)
Bun workspace, TS strict, `bun test` wired, Alchemy app deploying a hello-world Worker + empty DO classes + R2 bucket to a dev stage.
**Accept:** `bun alchemy deploy` succeeds; e2e test hits the Worker.

### M1 — Core engine, pure in-memory (THE critical milestone)
`packages/core` complete with no Cloudflare dependencies: datom encoding + comparators, segment encode/decode, tree build/seek/range-scan, novelty merge iterator, and the datalog engine (parse, plan, execute, pull).
- Planner must be **seek-driven**: choose index per clause by bound-variable pattern (E bound→EAVT, A bound→AEVT, A+V→AVET, ref V→VAET), order clauses by selectivity, stream hash-joins. No scan-and-filter fallbacks on large sets.
- Property tests: round-trip encode/decode; seek(k) over built trees ≡ filter over raw datom list; query results ≡ naive reference implementation on random data.
**Accept:** 1M-datom in-memory dataset; correctness suite green; bench: single seek < 10µs warm, 3-clause join over 10k intermediate rows < 50ms in Bun.
**Gate:** do not proceed until M1 benchmarks pass — if the engine is slow here, nothing downstream saves it.

### M2 — Transactor DO + log + group commit
Tx pipeline: validate against schema → resolve tempids/uniques (reads via its own segment source + own novelty) → assign `t` → append.
- **Group commit:** batch all txes that arrive while a storage write is in flight into the next single SQLite write. This is the main write-throughput lever.
- Expose `/transact` (via Worker), WS endpoint for novelty subscribers, and in-DO state: current root, log watermark.
**Accept:** serialized `t` under concurrent clients (no gaps/dupes under fault injection); bench ≥ 500 tx/s sustained on small txes with group commit on dev hardware; novelty frames delivered to a test WS subscriber.

### M3 — R2 segment store + edge caching
`SegmentSource` in the Worker: memory LRU → Cache API → R2, keyed by hash; immutable cache headers; bootstrap a database by building initial trees from a seed log and publishing `root/current` + `roots/<t>`.
**Accept:** cold query does ≤ depth GETs per unique segment; repeat query does 0 R2 reads (verify via instrumentation); byte-identical segments dedupe (same hash → one object).

### M4 — Incremental indexer
Alarm-driven: when log ≥ threshold (bytes or tx count) or age ≥ threshold, merge log → new trees with structural sharing; write only changed nodes; publish `roots/<t>` then flip `root/current`; notify subscribers; mark-and-sweep GC against retained roots (retention policy configurable).
- Keep each run small (bounded log slice) to stay inside DO CPU/memory limits; if a run would exceed budget, split it. Leave a seam to move big merges to Workflows/Containers later — do not build that yet.
**Accept:** reindex of a 10k-tx delta on a 10M-datom db creates O(touched-paths) new objects (assert exact count in test); old root still answers `as-of` correctly; concurrent queries during reindex see consistent snapshots.

### M5 — QueryReplica DO + novelty protocol
Replica: connect WS to Transactor (with resume-from-watermark on reconnect, gap detection via `t` continuity, catch-up from `log/` chunks), hold novelty sorted in memory + spill to SQLite, cache hot segments, serve `GET /basis` → `{ t, root, novelty-since-root }` to Workers; drop novelty ≤ new root on root flip.
- Sharding: replica id = hash(dbId, region-or-tenant). Workers pick a nearby replica deterministically.
**Accept:** kill/restart replica → resumes with no missed datoms (chaos test); Worker read-your-writes: transact then immediately query through a replica sees the write; replica memory bounded under sustained writes because M4 keeps flipping roots.

### M6 — Worker peer integration + time travel + SDK
Wire it all: `/query` (datalog + pull), `/transact`, `as-of`/`history` via `roots/<t>`, client SDK, auth stub (per-db token).
**Accept:** e2e suite: schema install → transact → query → as-of → history across deploy restarts; latency budget: warm read-only query p50 < 15ms at the edge (excluding client RTT), write ack p50 < 100ms same-continent.

### M7 — Bench, hardening, ops
Load tests (write ceiling with/without group commit; read scaling across colos), 128MB memory guardrails in the planner (row-count budget → abort with clear error rather than OOM), structured logs/metrics per component, runbook: what to do when a tenant hits the write ceiling (answer: split the logical database; document that this is a hard limit of the design).

## 7. Known limits & mitigations (context for decisions)

- **Write ceiling:** ~low-thousands tx/s per logical database, hard limit of single-writer DO. Mitigate via tenancy: one Transactor DO per database. Do not attempt multi-writer.
- **Worker memory (128MB):** planner must budget intermediate result sizes; prefer seeks + streaming joins; large analytical scans are out of scope v1.
- **Indexer limits:** solved by incrementality (M4); escalate to Workflows/Container only if profiling demands it.
- **R2 tail latency at cold colos:** replicas' segment caches are the mitigation; measure before optimizing further.
- **AVET only for `:db/index` attrs; VAET only for refs** — enforce in schema; do not index everything.

## 8. Open decisions (agent may choose, must document)

- Compression: gzip (built-in) vs zstd (wasm) for segments — bench both at M3.
- Datalog surface syntax: EDN-like strings vs TS query builder — SDK ergonomics call; engine should be AST-first either way.
- Novelty wire format: JSON first, binary later; keep it versioned.
- Whether QueryReplica also executes full queries (vs only serving basis/novelty/segments) — start with basis+novelty only; add query execution if Worker cache hit rates disappoint.

## 9. Definition of done (v1)

All milestone acceptance criteria green in CI (`bun test` + e2e against a dev stage), benchmarks recorded in `bench/RESULTS.md`, one demo app (simple CRUD with an as-of history view) deployed via `bun alchemy deploy` to prod stage.
