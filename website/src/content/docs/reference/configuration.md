---
title: Configuration
description: Every environment variable the peer Worker reads — tuning knobs, retention, budgets, and auth.
---

All configuration is environment variables on the peer Worker, declared in
your `alchemy.run.ts` and read at boot (`packages/transactor/src/env.ts`).
Unset means the default. Only bind what you set.

## Write path and indexing

| var | default | effect |
| --- | --- | --- |
| `RIPPLE_MAX_BATCH` | 0 (unbounded) | cap transactions per storage write; `1` disables group commit (bench/testing only) |
| `RIPPLE_INDEX_TX_THRESHOLD` | 500 | index run after this many transactions |
| `RIPPLE_INDEX_INTERVAL_MS` | 5000 | …or after this long; lower both to keep novelty (and replica memory) small |
| `RIPPLE_INDEX_MAX_TXS_PER_RUN` | 5000 | bound one run (DO CPU/memory limits); the run re-arms until caught up |
| `RIPPLE_LOG_KEEP_TXS` | 20000 | SQLite log tail kept for WebSocket catch-up; older → replicas read `log/` chunks from R2 |

Do not raise `RIPPLE_MAX_BATCH` hoping for throughput — unbounded already
batches everything in flight. The write ceiling is the single writer; see
[the runbook](/reference/runbook/#the-write-ceiling).

## Read path

| var | default | effect |
| --- | --- | --- |
| `RIPPLE_QUERY_MAX_CELLS` | 1,572,864 (~48 MB) | planner memory guardrail per query; over-budget queries get 413 `query/budget-exceeded` |
| `RIPPLE_CACHE_BASIS` / `RIPPLE_CACHE_MODE` | — | segment/basis cache tuning |
| `RIPPLE_REPLICA_HINT` | — | replica placement/selection hint |

## Retention and GC

| var | default | effect |
| --- | --- | --- |
| `RIPPLE_RETAIN_ROOTS` | 20 | roots kept for `asOf`; a retired database stays readable while its roots are retained |
| `RIPPLE_GC_EVERY_N_INDEXES` | 50 | GC cadence — mark and sweep against retained roots |

## Auth

| var | default | effect |
| --- | --- | --- |
| `RIPPLE_TOKEN` | unset (auth off) | one bearer token, checked for every database name |
| `RIPPLE_POLICY` | unset | compiled policy (`Ripple.Policy.compile`); set = enforcement is armed and fails closed |
| `RIPPLE_JWKS_URL` (or `RIPPLE_JWKS_JSON`) | unset | the issuer's public keys; required once `RIPPLE_POLICY` is set |
| `RIPPLE_JWT_ISS` | unset | accepted issuers, comma-separated |
| `RIPPLE_JWT_AUD` | unset | the audience every token must carry |
| `RIPPLE_JWT_MAX_TTL` | 900 | cap on a token's `exp - iat`, in seconds |
| `RIPPLE_ALLOWED_ORIGINS` | unset | once a policy is set, CORS narrows to this list (empty = no CORS header) |
| `RIPPLE_INTERNAL_SECRET` | unset | Worker→DO shared secret; every internal fetch carries it, `/subscribe` included. Unset with a policy = a fresh secret per deploy |

See [Auth and policy](/guides/auth/) for how the modes interact.

## Telemetry

| var | default | effect |
| --- | --- | --- |
| `RIPPLE_LOG_LEVEL` | info | `debug` also emits per-batch / per-query events |

Every component emits one JSON object per line (`{ ts, level, component,
event, db, … }`); read them with `wrangler tail`, Logpush, or the
`alchemy dev` console. Bind a Workers Analytics Engine dataset as `ANALYTICS`
for tx/http telemetry.

## Declaring knobs in Alchemy

Bind only what is set, so the Worker's env stays clean:

```ts
const tuning = (...names: string[]): Record<string, string> =>
  Object.fromEntries(
    names
      .filter((n) => process.env[n] !== undefined)
      .map((n) => [n, process.env[n]!]),
  );

const Worker = Cloudflare.Worker("Peer", {
  // …
  env: {
    STORE: Store,
    TRANSACTOR: Transactor,
    REPLICA: Replica,
    ...tuning("RIPPLE_MAX_BATCH", "RIPPLE_QUERY_MAX_CELLS", "RIPPLE_LOG_LEVEL"),
    ...Ripple.authEnv(auth),
  },
});
```
