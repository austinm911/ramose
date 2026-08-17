---
title: Transact
description: The generator transaction — entities, assertions, retractions, upserts, and the TxReport that fences your reads.
---

`db.transact` is the only write. Its body is a generator over the transaction
builder, so a transaction reads like the change it states:

```ts
const report = yield* db.transact(function* (tx) {
  const movie = yield* tx.entity();
  yield* movie.add(Movie.title, "Arrival");
  yield* movie.add(Movie.year, 2016);
});
```

From the browser, wrap it in your runtime's `runPromise`
(`await run(db.transact(…))`). From a Worker it is an ordinary Effect.

## The builder

| operation | meaning |
| --- | --- |
| `tx.entity()` | mint a new entity; returns an `Entity<C>` handle `{ eid, add, retract }` |
| `tx.add(e, attr, v)` | assert a fact about an existing entity |
| `tx.retract(e, attr, v?)` | retract one value (or all values of `attr` when omitted) |
| `tx.retractEntity(e)` | retract an entity and its component closure |

`e` is an `Eid<C>`, a `LookupRef<C>`, or an `Entity<C>` handle from the same
transaction. Values are checked against the attribute's schema at compile
time — `movie.add(Movie.year, "2016")` does not compile.

## Upserts and lookup refs

A unique-identity attribute is a key. Asserting it again upserts:

```ts
yield* db.transact(function* (tx) {
  const user = yield* tx.entity();
  yield* user.add(User.email, "grace@acme.dev"); // upserts onto the existing entity
  yield* user.add(User.name, "Grace");
});
```

And a `LookupRef` addresses an entity without knowing its eid:

```ts
yield* db.transact(function* (tx) {
  yield* tx.add([User.email, "grace@acme.dev"], User.name, "Grace H.");
});
```

## Atomicity and ordering

A transaction is all-or-nothing: any rejected operation (schema violation,
unique conflict, policy denial) rejects the whole transaction as
`TxRejected`, and no `t` is consumed. The Transactor applies transactions
serially — there are no write conflicts to retry, only rejections to handle.

Card-one attributes replace implicitly: asserting a new value emits a retract
of the old one in the same transaction.

## The TxReport

`transact` resolves with a `TxReport<C>`:

```ts
const { t, txEid, datomCount, dbAfter } = yield* db.transact(function* (tx) {
  // …
});
```

- **`t`** — the transaction's position in the total order.
- **`txEid`** — the transaction entity, so you can attach audit facts to writes.
- **`dbAfter`** — the same `Db` carrying a min-`t` floor of `report.t`:
  read-your-writes with no second round trip and no `sync` call. The floor is
  best-effort ("at least this fresh"); `db.asOf(t)` pins an exact view.

A write also advances the whole connection: `transact` bumps the session basis
to `report.t`, so every standing `live` re-runs against it. Writes go over
HTTPS `/transact`; reads and `t` ticks ride the socket.

## Semantics worth knowing

- `transact` returns only after the write is durable (persist-before-ack).
- Against an uninstalled database, `transact` fails with `TxRejected` —
  install the catalog first.
- `db.install()` is itself an ordinary idempotent transaction; a redeploy
  costs one no-op tx.
- You cannot transact into the past: `asOf` and `history` views are
  read-only by type.
