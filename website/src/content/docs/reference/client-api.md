---
title: Client API
description: Every name @ripple/alchemy/db exports — schema constructors, connect and the layer, the Db value, queries, transactions, and errors.
---

`@ripple/alchemy/db` is the portable client: browser, Node/Bun, tests. It is a
real `exports` entry and nothing it reaches imports the deploy engine, so a
Vite app needs no alias. Import it as `* as Ripple`.

## Schema

| name | signature |
| --- | --- |
| `Attr` | `(schema: Schema.Top, options?) => Attribute` |
| `Namespace` | `(name: string, attrs: Record<string, Attribute>) => Namespace` |
| `Catalog` | `(namespaces: Record<string, Namespace>) => Catalog` |
| `Instant` `Uuid` `UuidString` `Ref` `Long` `Bytes` | branded `Schema`s carrying a `:db.type/*` TypeScript cannot infer |
| `Ref(() => Namespace)` / `Ref.self` | targeted refs — the typed target navigational query paths join through |
| `Attribute` `Namespace` `Catalog` `Catalog.Any` | types (`Catalog.Any` for catalog-generic helpers) |

## Connecting

| name | signature |
| --- | --- |
| `connect` | `(options: ClientOptions) => Client` |
| `Client` | `{ db<C>(name: string, catalog: C): Db<C>; close(): Promise<void> }` |
| `layer` | `(options: ClientOptions) => Layer<Databases>` — for Effect users |
| `Databases` | `Context.Service<Databases, { db<C>(name: string, catalog: C): Db<C> }>` — the key *is* the client |
| `ClientOptions` | `{ url: string; token?: Effect<Redacted<string>, DbError> \| TokenSource; fetch?: typeof fetch; webSocket?: typeof WebSocket }` |
| `token.jwt` | `(mint: () => Promise<string \| { token: string }>, options?: { refreshMargin?: Duration.Input }) => TokenSource` — lazy first mint, cached, single-flight; re-mints inside `refreshMargin` (default 2 minutes) of the JWT's `exp`. A mint route's JSON body (`{ token, … }`) passes through unwrapped |
| `token.static` | `(value: string) => TokenSource` — a fixed credential |
| `TokenSource` | `{ token: Effect<Redacted<string>, DbError>; claims(): Promise<Claims>; invalidate(): void }` |
| `Claims` | the JWT payload, decoded (base64url), **not** verified — UI hints only (`sub`, `exp`, `ripple.class`, …) |
| `DATABASE_NAME_RE` | `RegExp` — the peer's database-name rule: `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$` |
| `isDatabaseName` | `(name: string) => boolean` — the same rule as a predicate |

`connect` is the promise-land entry: a plain handle, no runtime to build.
`db` is pure — the same call as `Databases.db` — and every `Db` method needs
no environment, so `Effect.runPromise(db.q(…))` runs it; a `Client` carries
no `run`. `close()` closes every session socket the client opened and is
idempotent; after `close`, reads fail rather than silently changing
transport. A provisioning mistake (malformed URL, no `fetch`) throws
synchronously from `connect`.

Effect users take `layer`: the same client as a scoped `Layer<Databases>`,
whose finalizer is the session socket — `connect` is a thin wrapper over the
same factory, not a second client. Getting a `Databases` cannot fail.

A static token is `Ripple.token.static(t)` or, spelled out,
`Effect.succeed(Redacted.make(t))`. The token Effect is re-read on every
(re)connect and every `/transact`, so token refresh needs no client surface —
return the current token from the Effect. `token.jwt(mint)` is the shipped
refreshing source: `mint` is called lazily on the first read, concurrent
readers share one in-flight mint, and the cached token is re-minted once it
is within the margin of its `exp` (a payload with no `exp` is static until
`invalidate()`; a lifetime shorter than the margin refreshes at half-life). A
`mint` that throws fails the read as `NetworkError` — transient, so `live`
retries it — unless it throws a `DbError`, which passes through (throw
`Unauthorized` to fail `live` terminally).

`DATABASE_NAME_RE` / `isDatabaseName` let an app that mints names at runtime
(multi-tenant "create workspace") validate before the peer does — a bad name
otherwise fails the first operation with `InvalidRequest`. It is a validator,
not a slugify: how an app turns "Coral Team" into `coral-team` is its own
business.

## The database value

| name | signature |
| --- | --- |
| `Db<C>` | `ReadDb<C> & { transact; install }` |
| `ReadDb<C>` | `{ name; catalog; q; pull; live; basis; asOf; history }` |
| `db.q` | `(query) => Effect<R, DbError>` — takes a navigational query value (`Ripple.query(N)…`); with no `.select`, `R` is `readonly Eid<C>[]` |
| `db.live` | same input as `db.q` → `Stream<R, DbError>` |
| `db.pull` | `<const P>(subject: Eid<C> \| LookupRef<C>, shape: P) => Effect<Pull<C, P> \| null, DbError>` |
| `db.transact` | `<A, E, R>(body: (tx: Tx<C>) => Generator<Effect<unknown, E, R>, A>) => Effect<TxReport<C>, DbError \| E, R>` |
| `db.install` | `() => Effect<TxReport<C>, DbError>` — idempotent catalog upsert |
| `db.basis` | `() => Effect<{ t: number }, DbError>` — the basis this view reads at: one `GET /db/:name/info` for a live db (`history` included); `asOf(t)` answers `{ t }` with no request. Observing a newer `t` re-runs standing `live` queries, like `transact` |
| `db.asOf` | `(t: number) => ReadDb<C>` — pure view; you cannot transact into the past |
| `db.history` | `ReadDb<C>` — includes retracted datoms |

## Queries

| name | signature |
| --- | --- |
| `query` | `Ripple.query(N)` — the navigational builder: `.where(...predicates)` `.orderBy(attr, dir?, opts?)` `.limit(n)` `.offset(n)` `.select(shape)`. Order and paging run on the peer. A query is a value; see [Query and pull](/guides/queries/) |
| predicates | on attributes: `eq` `ne` `lt` `lte` `gt` `gte` `exists` `missing`; strings add `startsWith` `includes`; paths join through targeted refs (`Todo.owner.name.startsWith("A")`) |
| `Pull<C, P>` | result of shape `P`. Shapes nest (`Todo.owner.select({…})`) and go optional (`Todo.due.optional`) — the same grammar for `select` and `db.pull` |
| `Eid<C>` | `{ readonly id: number }`, catalog-branded. Data — no methods, no I/O |
| `LookupRef<C>` | `[AttrRef, value]` on a unique attribute |

## Transactions

| name | signature |
| --- | --- |
| `Tx<C>` | `.entity()` `.add(e, a, v)` `.retract(e, a, v?)` `.retractEntity(e)` |
| `Entity<C>` | `{ eid; add; retract }` — the handle `.entity()` returns |
| `TxReport<C>` | `{ t; txEid: Eid<C>; datomCount: number; dbAfter: Db<C> }` |

## Errors

All errors are `Data.TaggedError`, matched with `Effect.catchTags`:
`TxRejected`, `Unavailable`, `InvalidRequest`, `DatabaseNotFound`,
`Unauthorized`, `QueryBudgetExceeded`, `InternalError`, `NetworkError`, and
the union `DbError`. See [Errors](/reference/errors/).

## Semantics that matter

- **A db is a value.** `asOf(t)` and `history` are `Db -> ReadDb`: pure, zero
  I/O; `q` / `pull` / `live` compose over them unchanged.
- **`transact` returns `TxReport`.** `dbAfter` is the same `Db` carrying a
  min-`t` floor of `report.t` — read-your-writes with no second round trip.
  The floor is best-effort; `asOf(t)` pins an exact past view.
- **A write advances the whole connection.** Every standing `live` re-runs
  against the new basis. Writes go over HTTPS `/transact`; reads and `t`
  ticks ride the socket.
- **`live` requires nothing** (`R = never`) and survives the network —
  retried with backoff, failing only on terminal `InvalidRequest`,
  `Unauthorized`, or `DatabaseNotFound`.
- **Install is explicit and once.** `Ripple.Database(...)` at deploy or
  `db.install()` at tenant creation; `ripple.db(name, catalog)` is pure.
- **Provisioning mistakes are defects.** A missing binding or malformed URL
  is `Effect.die`, not a `DbError` — every signature's `R` is `never`.
  `connect` surfaces the same defects as synchronous throws.
