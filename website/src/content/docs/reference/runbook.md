---
title: Runbook
description: Operating a Ramose deployment — what to watch, the write ceiling, and recovery notes.
---

Operational notes for one Ramose deployment (one Worker, one Transactor DO per
logical database, N QueryReplica DOs per database, one R2 bucket).

## What to look at

Every component emits one JSON object per line; read them with
`wrangler tail`, Logpush, or the `alchemy dev` console. Set
`RAMOSE_LOG_LEVEL=debug` for per-batch / per-query events.

| question | where |
| --- | --- |
| tx/s, batch size, commit latency | `GET /db/:name/info` → `transactor.metrics` (`txPerSec`, `batchSize.p50/p95`, `commitMs`); events `transactor/tx.commit` |
| is the transactor rejecting or dead? | events `transactor/tx.rejected` (schema/unique errors, per tx) and `transactor/tx.aborted` (storage write failed → DO resets; clients get 503 + `retry-after`) |
| index lag / run cost | `/info` → `transactor.txsSinceIndex`, `indexer.lastRun`; events `indexer/index.run` (`txs`, `datoms`, `ms`, `r2Puts`, `remainingTxs`) |
| replica health / novelty size | `/info` → `replica.novelty`, `replica.connected`, `replica.stats.gaps`; events `replica/replica.connect`, `replica.root`, `replica.gap` |
| read latency at the edge | `/info` → `peerMetrics.queryMs`; events `peer/query` (`ms`, `rows`, `r2Gets`, `cacheHits`, `peakCells`); header `x-ramose-ms` |
| queries hitting the memory guardrail | events `peer/query.budget-exceeded` (413, names the clause and the cell count) |

## The write ceiling

**Every logical database has exactly one writer** — its Transactor Durable
Object — which serializes all transactions and assigns `t`. That is a design
invariant, not a tuning knob: it is what makes `t` total, tempid/unique
resolution consistent, and the log gap-free.

Measured ceiling of one database on dev hardware: ~2.5–2.9k small tx/s with
group commit in-process, ~1.7k tx/s through the local Worker → DO path. Real
Cloudflare hardware moves the numbers, but the shape is fixed: **low thousands
of tx/s per logical database, full stop.**

### Symptoms a tenant is at the ceiling

- `transactor.metrics.txPerSec` flat while `batchSize.p95` grows and ack
  latency climbs — group commit is already coalescing everything; the DO is
  CPU/IO bound.
- `tx.commit` events show `queued` consistently above zero.
- `txsSinceIndex` grows faster than the indexer drains it (`index.run`
  `remainingTxs` > 0 run after run) — writes outrun indexing and novelty
  (replica memory) grows.

### What not to do

- Do **not** add a second writer, shard `t`, or let two DOs accept writes for
  the same database. There is no supported configuration for it and none is
  planned.
- Do not raise `RAMOSE_MAX_BATCH` — 0 (unbounded) already batches everything
  in flight; a cap only trades throughput for latency fairness.

### What to do: split the logical database

Split into several logical databases along *write ownership*, so a
transaction never touches two databases:

1. Pick a partition key that all writes carry (customer / account / region /
   workload). Each partition becomes a database `tenant-<key>`.
2. Create the new databases: install the schema, then optionally backfill
   from the old database (`/query` + `/transact`, or from `log/` chunks in
   R2 under `db/<old>/log/`).
3. Point writers at the partitioned names. Reads that need a union run one
   query per database and merge in the application — there is no
   cross-database join; that is the price of the split.
4. Retire the old database when its writers are gone. Its history stays
   readable and `asOf`-able for as long as its roots are retained.

Split *before* p95 ack latency matters to users, along the same lines you
would shard any single-writer system — no distributed transactions across
partitions.

## Recovery notes

- **Transactor `tx.aborted`**: in-memory and durable state diverged (storage
  write failed after `t` was assigned). The DO aborts itself; the next
  request reboots it from SQLite (`log`) + `root/current`. Nothing from the
  failed batch is durable; clients that got 503 must retry. `t` continues
  with no gap.
- **Replica behind / disconnected**: it reconnects on the next request
  (`resume` from its watermark, `gap` → `log/` chunks in R2). Force it with
  `POST /db/:name/admin/replica/reconnect`.
- **Indexer stuck** (`remainingTxs` never drops): lower
  `RAMOSE_INDEX_MAX_TXS_PER_RUN`, or trigger `POST /db/:name/admin/index`
  and read the `index.error` event.
- **Bucket bloat**: `POST /db/:name/admin/gc` sweeps `seg/` and `n/` objects
  unreachable from retained roots. Keys are namespaced per database, so a
  sweep can never touch another database.

Tuning knobs live in the [configuration reference](/reference/configuration/).
