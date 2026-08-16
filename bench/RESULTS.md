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

## M7 — timed incremental index runs (`bun run bench/indexer.bench.ts`)

In-process (Transactor over in-memory R2 + bun:sqlite): seed N people
(4 datoms each) into segment trees, write a **scattered** delta of 10k txs
(¼ inserts, ¾ single-datom updates on entities spread over the whole id
range), then time one index run. "new objects" is exactly
|reachable(new) − reachable(old)| (asserted in the M4 test).

| people (datoms) | leaf / fan-out | tree objects (depth) | run | new objects (rewritten) | per tx |
|---|---|---|---|---|---|
| 300k (1.2M) | 3000 / 1024 | 1,125 (2) | 1.65 s | 925 (82%) — 4.5 MB | 0.09 obj, 0.17 ms |
| 300k (1.2M) | 500 / 64 | 6,723 (3) | 3.13 s | 5,231 (78%) — 5.5 MB | 0.52 obj, 0.31 ms |
| 1M (4M) | 3000 / 1024 | 3,695 (3) | 4.25 s | 2,425 (66%) — 12.3 MB | 0.24 obj, 0.43 ms |

Reading: with 10k *uniformly scattered* single-datom updates the delta
touches most leaves of every index (300k people / 3000-datom leaves ≈ 400 EAVT
leaves; 10k random entities hit nearly all of them), so the rewritten
fraction is high by construction — cost is O(touched paths), and here almost
every path is touched. The absolute cost is what matters for the DO budget:
~0.2–0.4 ms and ~10–20 KB of new objects per transaction at this scale, i.e.
a bounded 5k-tx run stays around 1–2 s of CPU. Localised deltas (one tenant's
entities, monotone ids) touch a handful of leaves and rewrite < 1% (see the M4
test: 60 txs on 600k datoms → < 10% of objects). A 10M-datom run was not
timed here (memory of the in-process harness); scale the 4M row linearly.

## Milestone status (as of this snapshot)

| milestone | status | evidence |
|---|---|---|
| M0 scaffold | **accepted** — deployed to a real Cloudflare account (stage `cf-e2e`, 2026-08-16), e2e 9/9 + write/read benches against it, then destroyed | `alchemy.run.ts`, `test/e2e`; see "Cloudflare" section below |
| M1 core engine | **accepted** | 57 core tests; seek < 10 µs; 3-clause join p50 43 ms |
| M2 transactor | **accepted** (in-process + local stack) | 13 transactor tests (contiguous t under 500 concurrent clients, fault injection + restart, novelty/gap catch-up, alarm indexing); ≥ 500 tx/s (2.5k in-process, 1.7k through the local Worker) |
| M3 R2 store + caching | tiers verified in-process | 4 storage tests: cold ≤ depth GETs, repeat 0 R2 reads, dedupe, corrupt-tier fallback; e2e repeat query hits cache |
| M4 incremental indexer | verified at 600k datoms (scaled from 10M) | exact new-object count == |reachable(new) − reachable(old)|; as-of via old root; consistent snapshots; bounded, re-arming runs |
| M5 replica + novelty | e2e | reconnect under concurrent writes → no missed datoms; root flip drops novelty |
| M6 peer + time travel + SDK | e2e | schema → transact → query → as-of → history → pull; persistence across a full stack restart verified manually |
| M7 | **done** (verified on a real Cloudflare deployment; see "Cloudflare" section) | planner memory guardrail (413 `query/budget-exceeded`, tested), write-ceiling load tests with/without group commit + warm read bench, structured logs/metrics per component, `docs/RUNBOOK.md`; timed indexer bench |

## Cloudflare (real deployment, stage `cf-e2e`, 2026-08-16)

`ALCHEMY_STAGE=cf-e2e bun alchemy deploy` → one Worker + `TransactorDO` +
`QueryReplicaDO` (SQLite-backed) + one R2 bucket on a real Cloudflare account.
Worker host: `ripple-worker-dev-box-3cdr6qso35cbzmpr.tvanhens.workers.dev`
(workers.dev; no custom domain, no auth token). Client ran from a machine
whose Cloudflare edge is **IAD** (`cf-ray …-IAD`; `/db/*/info` reports
`region: "NA"` for the DOs), so every number below is one client → one colo
→ one DO placement; **no multi-colo data was measured**. The stage was
destroyed afterwards (`bun alchemy destroy`; `/health` → 404, Cloudflare error 1042 "worker not found"; a re-plan shows nothing left in the stage).

### e2e (`RIPPLE_URL=<url> bun test test/e2e`)

9/9 pass in ~9 s (schema → transact → query → as-of → history → pull,
serialized `t` under 40 concurrent clients, replica reconnect under writes,
root flip drops novelty, 413 `query/budget-exceeded`, write smoke). Write
smoke: 300 tx in 1.15–1.4 s → **214–261 tx/s**, max batch 75–136. One
assertion (root flip visible on the replica right after `index()` acks) is a
~100 ms WebSocket propagation race on real CF that miniflare never showed;
the test now polls for it (test-only change).

### Write path (`bun run bench/write-do.bench.ts <clients> 5`, group commit on)

| clients | tx/s | ack p50 | ack p95 | ack p99 | errors | transactor batches / max / avg |
|---|---|---|---|---|---|---|
| 8 | **166** | 36 ms | 94 ms | 120 ms | 0 | 719 / 5 / 1.17 |
| 64 | **664** | 71 ms | 220 ms | 370 ms | 0 | 532 / 57 / 6.41 |

### Read path (`bun run bench/read-do.bench.ts` = 5000 people, 200 runs × 8 concurrent, warm)

| query | client p50 | client p95 | server p50 (`x-ripple-ms`) |
|---|---|---|---|
| point lookup (AVET) | 44.8 ms | 84.2 ms | 37 ms |
| entity attributes (EAVT) | 44.4 ms | 100.1 ms | 36 ms |
| city → friends → name (3-way join) | 49.0 ms | 102.9 ms | 39 ms |
| count by city (aggregate) | 46.3 ms | 52.7 ms | 38 ms |

Peer segment cache over the run: 7,252 peek hits, 10 R2 gets, 0 puts.

**vs local miniflare (above):** writes 166 / 664 tx/s at 8 / 64 clients vs
1,228 / 1,595 locally — the live path is dominated by client → edge → DO
round-trip (~35 ms floor per ack, so 8 clients can only push ~200 tx/s and
batches stay near 1), and throughput scales with concurrency as group commit
kicks in (avg batch 1.2 → 6.4); reads are ~45 ms client p50 vs ~4–12 ms
locally, of which ~37 ms is the server-side `x-ripple-ms` (Worker → replica DO
basis fetch + edge query, i.e. an intra-Cloudflare hop that the single local
isolate does not pay) and the rest is WAN RTT.

## Cloudflare (replica-executed queries), stage `cf-e2e`, 2026-08-16 (second deploy)

Change under test: the Worker's `/query` `/pull` `/entity` now **forward the
read to the nearest `QueryReplicaDO` (`POST /query`)** — same `replicaId` /
`locationHint` as the old `fetchBasis` — instead of fetching a basis and
running datalog in the Worker (SPEC §8). Public API unchanged;
`x-ripple-ms` is still Worker wall time for the read. Hypothesis: the ~37 ms
server p50 in the section above was the extra basis hop.

Worker host: `ripple-worker-dev-box-zobj7ehwvxnrrft3.tvanhens.workers.dev`
(fresh stage; same client machine, IAD edge, one colo, one DO placement — **no
multi-colo data**). Destroyed afterwards (`bun alchemy destroy`; `/health` →
Cloudflare 1042 "worker not found").

### e2e

`RIPPLE_URL=<url> bun test test/e2e` → **9/9 pass** in 9.8 s (write smoke 300 tx in 1.17 s → 256 tx/s, max batch 110). Unit suite incl. the new Worker forwarding test: 84/84.

### Write path (unchanged code path; `bun run bench/write-do.bench.ts <clients> 5`)

| clients | tx/s | ack p50 | ack p95 | ack p99 | errors | transactor batches / max / avg |
|---|---|---|---|---|---|---|
| 8 | **172** | 32 ms | 92 ms | 160 ms | 0 | 727 / 4 / 1.21 |
| 64 | **872** | 61 ms | 120 ms | 385 ms | 0 | 560 / 47 / 7.92 |

(Same shape as the first deploy: 166 / 664 tx/s; run-to-run noise on a shared edge.)

### Read path (`bun run bench/read-do.bench.ts` = 5000 people, 200 runs × 8 concurrent, warm)

| query | previous CF (Worker executes): server p50 | **replica executes: client p50** | **client p95** | **server p50 (`x-ripple-ms`)** |
|---|---|---|---|---|
| point lookup (AVET) | 37 ms | 80.0 ms | 186.3 ms | **73 ms** |
| entity attributes (EAVT) | 36 ms | 76.3 ms | 136.3 ms | **68 ms** |
| city → friends → name (3-way join) | 39 ms | 79.1 ms | 139.1 ms | **70 ms** |
| count by city (aggregate) | 38 ms | 83.1 ms | 101.3 ms | **76 ms** |

Peer segment cache: all zeros (the Worker no longer touches segments; the
replica's own R2/tier stats now travel back as `x-ripple-r2-gets` /
`x-ripple-cache-hits`).

Diagnostic extra run, **same data, 100 runs × 1 concurrent** (to separate
per-request cost from queueing inside the DO):

| query | client p50 | client p95 | server p50 |
|---|---|---|---|
| point lookup (AVET) | 46.2 ms | 56.1 ms | 39 ms |
| entity attributes (EAVT) | 47.0 ms | 101.2 ms | 38 ms |
| city → friends → name (join) | 49.9 ms | 107.3 ms | 41 ms |
| count by city (aggregate) | 46.8 ms | 53.9 ms | 39 ms |

**Verdict: server p50 did not move toward the 15 ms budget — it stayed at
38–41 ms at concurrency 1 (identical to the old basis-fetch path) and
roughly doubled to 68–76 ms at 8 concurrent.** The hypothesis was wrong: the
~37 ms is not "basis fetch + a second hop", it is one Worker → replica-DO
round trip, paid once either way (datalog itself is 1–3 ms). Moving execution
into the DO made things worse under concurrency because a Durable Object is
single-threaded: 8 in-flight reads now serialize their datalog inside one
replica instead of running in parallel Worker isolates. Next hypothesis (not
tested here, out of scope for this session): the DO placement — `hintFor("NA")`
pins the replica with `locationHint: "wnam"` while this client/Worker sit at
IAD, so every read may be paying a coast-to-coast RTT; a replica pinned near
the requesting colo (or per-colo/continent-sub-region ids) plus keeping
execution in the Worker (parallel isolates, one basis RTT) is the combination
to measure next. Multi-colo scaling remains unmeasured.
