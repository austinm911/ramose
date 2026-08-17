---
title: Introduction
description: What Ripple is, why it exists, and the ideas it will not compromise on.
---

Ripple is a modern, Effect-native graph database on Cloudflare.

One Durable Object writes. Immutable segment trees live in R2. Datalog runs at
the edge, next to your app. A database is a name — `ripple.db("acme", Catalog)`
and you're in. No provision step.

## Why it exists

- **Typed catalog.** `@ripple/alchemy/db` is the schema. Attributes,
  uniqueness, cardinality — TypeScript, checked at compile time.
- **Effect-native writes and reads.** Generator `transact`. Literate `q`.
  `db.pull`.
- **Live queries.** `db.live` is a `Stream` on the session socket. Write a
  row, it re-runs. No refetch. No invalidation call at the write site.
- **Db-per-tenant is a function call.** One Alchemy resource, one
  `RIPPLE_TOKEN` (unset = open), or a `RIPPLE_POLICY` that turns JWT claims
  into a per-request filtered `Db`. Every name shares the peer.
- **The invariants are the product.** Single writer. Dense `t`.
  Persist-before-ack. QueryReplicas are first-class — workers never read
  novelty from the transactor.

## The shape of the system

A Ripple deployment is one peer Worker, one Transactor Durable Object per
logical database, N QueryReplica Durable Objects per database, and one R2
bucket. There is no external database to run.

| part | role |
| --- | --- |
| Peer Worker | HTTP + WebSocket surface; runs datalog at the edge |
| Transactor DO | the single writer for a database; serializes transactions and assigns `t` |
| QueryReplica DO | holds novelty; the basis for every read |
| R2 bucket | immutable segment trees, the transaction log, and roots |

The engine lives in `packages/core`, the Cloudflare peer in
`packages/worker`, and the client in `packages/alchemy`.

## Datomic, revisited for the edge

If you know Datomic, the bones are familiar: an immutable EAVT fact store, a
single transactor, time travel as a view (`asOf`, `history`), datalog queries,
and pull patterns. Ripple re-homes those ideas on Cloudflare primitives —
Durable Objects for the writer and replicas, R2 for immutable storage — and
replaces the client with an Effect-native, catalog-typed surface. There is no
JVM, no peer cache to size, and no provisioning: the first transaction against
a name materializes the database.

## Where to go next

- [Quickstart](/getting-started/quickstart/) — run the todos example locally
  and deploy it.
- [Architecture](/concepts/architecture/) — how a write becomes a fact and a
  fact becomes a query result.
- [Client API](/reference/client-api/) — every name the client exports.
