# Ripple bench results

Recorded on the dev machine (Bun 1.3, Linux, shared/noisy CPU). Re-run with `bun run bench`.

## M1 — core engine (1,000,025-datom in-memory dataset, 100k people)

`bun run bench:seek` (warm tree seeks, leaf 3000 / fan-out 1024):

| op | per op | p50 | p99 |
|---|---|---|---|
| tree.seekOne EAVT {e} | 2.05 µs | 1.85 µs | 3.77 µs |
| tree.seekOne EAVT {e,a} | 1.84 µs | 1.88 µs | 3.62 µs |
| tree.seekOne AVET {a,v} | 3.82 µs | 3.66 µs | 8.28 µs |
| tree.seekOne VAET {v,a} | 1.86 µs | 1.76 µs | 3.04 µs |
| db.first EAVT {e,a} (merge + current view) | 3.27 µs | 3.23 µs | 6.12 µs |
| db.entid lookup ref (AVET) | 5.22 µs | 5.12 µs | 9.27 µs |

**Gate: single seek < 10 µs warm → PASS.**

`bun run bench:join` (city → friends → friend name; 10k → 30k intermediate rows):

| query | rows | min | p50 |
|---|---|---|---|
| 3-clause city→friends→name | 29,999 | 37.8 ms | 43.1 ms |
| 4-clause with both names | 29,999 | 46.4 ms | 48.9 ms |
| 3-clause count aggregate | 1 | 30.2 ms | 38.7 ms |
| input-driven 2-clause (10k ids in) | 29,999 | 32.9 ms | 34.4 ms |

**Gate: 3-clause join over ~10k intermediate rows < 50 ms → PASS (p50 43 ms).**
Plan for the gate query: AVET scan (10k) → batched seek-join on EAVT (10k
sorted seeks, one cursor) → streaming hash-join over AEVT (100k datoms scanned,
primitive-keyed probes).

## M2 — transactor write path (`bun run bench:transactor`, 64 concurrent clients, 5 s)

Runtime-agnostic `Transactor` over a real SQLite file (WAL, fsync per commit)
with one novelty subscriber receiving every frame:

| mode | tx/s | ack p50 | ack p99 | storage writes | avg batch |
|---|---|---|---|---|---|
| group commit | 2,503 | ~25 ms | ~50 ms | 198 | 63.7 |
| one tx per write | 2,047 | 26 ms | 55 ms | 10,342 | 1 |

**Gate: ≥ 500 tx/s sustained with group commit → PASS.** The durable log is
verified contiguous after each run (`t` = 1..N, no gaps/dupes).

Through the full local stack (`bun alchemy dev`: Worker → Transactor DO with
SQLite storage, miniflare emulation; `RIPPLE_URL=… bun run bench/write-do.bench.ts 64 5`):

| clients | tx/s | ack p50 | ack p99 | batches | avg batch | max batch |
|---|---|---|---|---|---|---|
| 64 | 1,744 | 27 ms | 117 ms | 570 | 15.4 | 35 |

Correctness (`bun test packages/transactor`): contiguous `t` under 500
concurrent clients; storage-fault injection → batch all-or-nothing, instance
aborted, restart continues with no gaps/dupes; novelty frames + resume /
gap catch-up; alarm-driven indexing.

## M7 — load tests

### Write ceiling: with vs without group commit

In-process Transactor over an fsync'd SQLite file, 4 s per cell, one novelty
subscriber (`bun run bench/transactor.bench.ts 64 4 1,8,64,256`; "single" =
`maxBatch: 1`, i.e. one storage write per tx):

| clients | group tx/s | group p50 | group p99 | avg batch | single tx/s | single p50 | single p99 |
|---|---|---|---|---|---|---|---|
| 1 | 641 | 1.5 ms | 2.7 ms | 1 | 628 | 1.5 ms | 2.9 ms |
| 8 | 2,108 | 3.6 ms | 7.6 ms | 8 | 635 | 12.4 ms | 16.7 ms |
| 64 | 2,701 | 22 ms | 54 ms | 63.6 | 631 | 100 ms | 111 ms |
| 256 | 2,860 | 85 ms | 181 ms | 250 | 630 | 404 ms | 427 ms |

Single-write mode is fsync-bound (~630 tx/s regardless of concurrency);
group commit converts concurrency into batch size and reaches ~2.8k tx/s on
this machine, i.e. the write ceiling of one logical database is
**low-thousands tx/s** as the spec expects (§7). Beyond that, split the
logical database (see `docs/RUNBOOK.md`).

Through the full local stack (`bun alchemy dev`, Worker → Transactor DO,
`bun run bench/write-do.bench.ts <clients> 5`; "off" = `RIPPLE_MAX_BATCH=1`):

| clients | group commit tx/s | ack p50 / p99 | avg batch | group commit off tx/s | ack p50 / p99 |
|---|---|---|---|---|---|
| 8 | 1,228 | 4.9 / 44 ms | 2.7 | 867 | 7.7 / 58 ms |
| 64 | 1,595 | 29 / 120 ms | 15.2 | 836 | 68 / 203 ms |
| 256 | 1,741 | 142 / 303 ms | 16.1 | 805 | 312 / 456 ms |

The DO path is bounded by the local emulator's per-request overhead (batches
stay ~16 because the Worker → DO hop paces arrivals), so the in-process
numbers are the better estimate of the transactor itself.

### Read path through the Worker (warm)

`bun run bench/read-do.bench.ts 5000 200 8` (5k people indexed into segments,
200 runs × 8 concurrent per query, warm isolate; client p50 includes local
HTTP RTT, server p50 is the Worker's own `x-ripple-ms`):

| query | client p50 | client p95 | server p50 |
|---|---|---|---|
| point lookup (AVET) | 3.6 ms | 7.1 ms | 1 ms |
| entity attributes (EAVT) | 3.9 ms | 5.0 ms | 1 ms |
| city → friends → name (3-way join) | 11.6 ms | 24.6 ms | 3 ms |
| count by city (aggregate) | 4.9 ms | 7.2 ms | 1 ms |

Repeat queries hit the peer's memory tier (8,258 peek hits vs 12 R2 gets over
the whole run). **Multi-colo read scaling was not measured**: this
environment has no Cloudflare credentials, so there is one local isolate and
no geographic distribution; only a real deployment can produce those numbers.

## Milestone status (as of this snapshot)

| milestone | status | evidence |
|---|---|---|
| M0 scaffold | infra written for current Alchemy API; local `bun alchemy dev` runs Worker + 2 DOs + R2; e2e hits it | `alchemy.run.ts`, `test/e2e` (8/8 on local stack). Real `bun alchemy deploy` needs Cloudflare credentials (not available here). |
| M1 core engine | **accepted** | 57 core tests; seek < 10 µs; 3-clause join p50 43 ms |
| M2 transactor | **accepted** (in-process + local stack) | 13 transactor tests (contiguous t under 500 concurrent clients, fault injection + restart, novelty/gap catch-up, alarm indexing); ≥ 500 tx/s (2.5k in-process, 1.7k through the local Worker) |
| M3 R2 store + caching | tiers verified in-process | 4 storage tests: cold ≤ depth GETs, repeat 0 R2 reads, dedupe, corrupt-tier fallback; e2e repeat query hits cache |
| M4 incremental indexer | verified at 600k datoms (scaled from 10M) | exact new-object count == |reachable(new) − reachable(old)|; as-of via old root; consistent snapshots; bounded, re-arming runs |
| M5 replica + novelty | e2e | reconnect under concurrent writes → no missed datoms; root flip drops novelty |
| M6 peer + time travel + SDK | e2e | schema → transact → query → as-of → history → pull; persistence across a full stack restart verified manually |
| M7 | not started | |
