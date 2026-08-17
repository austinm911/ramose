# Ripple

A modern Effect-native graph database on Cloudflare.

One Durable Object writes. Immutable segment trees live in R2. Datalog runs
at the edge, next to your app. A database is a name — `create("acme")` and
you're in. No provision step.

## Why it exists

- **Typed catalog.** `SchemaFx` is the schema. Attributes, uniqueness,
  cardinality — TypeScript, checked at compile time.
- **Effect-native writes and reads.** Generator `transact`. Literate `q`.
  `eid.pull`.
- **Live queries.** `db.live` on the session socket. Write a row, the store
  moves. No refetch. No invalidation call at the write site.
- **Db-per-tenant is a function call.** One Alchemy resource, one
  `RIPPLE_TOKEN` (unset = open; a proper auth story is on the roadmap).
  Every name shares the peer.
- **The invariants are the product.** Single writer. Dense `t`.
  Persist-before-ack. QueryReplicas are first-class — workers never read
  novelty from the transactor.

## Get running with Alchemy

The shortest path is the todos app — React, `Session.connect`, `db.live`:

```sh
bun install
bun alchemy dev examples/todos/alchemy.run.ts
VITE_RIPPLE_URL=http://localhost:8787 bunx vite examples/todos
```

That stack is a peer Worker (R2 + Transactor DO + QueryReplica DO) and a
`Ripple.System`. The UI is Vite. Copy
`examples/todos/{resources,alchemy.run,schema}.ts` and you have the same
shape.

```ts
import * as Ripple from "@ripple/alchemy";
import * as Cloudflare from "alchemy/Cloudflare";

const Store = Cloudflare.R2.Bucket("Store");
const Transactor = Cloudflare.DurableObject("TransactorDO", {
  className: "TransactorDO",
});
const Replica = Cloudflare.DurableObject("QueryReplicaDO", {
  className: "QueryReplicaDO",
});

export const Peer = Cloudflare.Worker("Peer", {
  main: "./packages/worker/src/index.ts",
  compatibility: { date: "2025-06-01", flags: ["nodejs_compat"] },
  env: { STORE: Store, TRANSACTOR: Transactor, REPLICA: Replica },
});

export const Sys = Ripple.System("Sys", { peer: Peer });
```

A deploy-time Action calls `system.create("todos", Todos)` so the catalog is
on the peer before the UI connects. `RIPPLE_TOKEN` is the peer's one bearer
token; leave it unset and the peer is open. A proper auth story is on the
roadmap.

An app Worker binds the same system (`Ripple.ReadWriteSystem` +
`SchemaFx.fromReadWrite`) and calls `system.create(name, catalog)` per
request — that's db-per-tenant. See `examples/kv-style/`.

Local root stack (no example UI):

```sh
ALCHEMY_STATE=local CLOUDFLARE_ACCOUNT_ID=<32 hex> CLOUDFLARE_API_TOKEN=x \
  bun alchemy dev
```

Any placeholder account id works for miniflare. `bun alchemy deploy` ships
the `$USER` stage; `--stage prod` for production.

## Catalog → session → transact → live

```ts
import { Session } from "@ripple/alchemy/schema";
import * as SchemaFx from "@ripple/alchemy/schema";
import * as Schema from "effect/Schema";

export const Todo = SchemaFx.Namespace("todo", {
  title: SchemaFx.Attr(Schema.String),
  done: SchemaFx.Attr(Schema.Boolean),
  createdAt: SchemaFx.Attr(SchemaFx.Instant),
});
export const Todos = SchemaFx.Catalog({ todo: Todo });

const { db } = await run(
  Session.connect({
    url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:8787",
    name: "todos",
    catalog: Todos,
    token: import.meta.env.VITE_RIPPLE_TOKEN,
  }),
);

const todos = db.live((q) =>
  q.where("?e", Todo.title, "_").find("?e").pull({
    title: Todo.title,
    done: Todo.done,
    createdAt: Todo.createdAt,
  }),
);
// todos.get() → { title, done, createdAt, eid }[] | undefined
// useSyncExternalStore(todos.subscribe, todos.get)

await run(
  db.transact(function* (tx) {
    const t = yield* tx.entity();
    yield* t.add(Todo.title, "ship it");
    yield* t.add(Todo.done, false);
    yield* t.add(Todo.createdAt, new Date());
  }),
);
```

`run` is `Effect.runPromise` over Alchemy's phantom `RuntimeContext` — see
`examples/todos/src/db.ts`. The Vite app aliases `@ripple/alchemy/schema` so
the browser does not pull the deploy engine.

From a Worker, skip the socket: `system.create("movies", Movies)`, then the
same `transact` / `q` / `eid.pull`. `minT: ack.t` is the read-your-write
fence. `db.asOf(t)` and `db.history()` are views. Outside Alchemy,
`SchemaFx.makeSystem({ url, token })` is the same typed system.

## Features

- Immutable EAVT graph. Time travel is a view, not a dump.
- Seek-driven datalog at the edge. Pull is `eid.pull` on a find result.
- One writer per name, dense `t`, persist-before-ack.
- QueryReplicas hold novelty; workers read through them.
- Privilege follows the system: `Read` / `Write` / `ReadWrite`.
- Engine in `packages/core`, Cloudflare peer in `packages/worker`, client in
  `packages/alchemy`.

## Commands

```sh
bun install
bun test
bun run typecheck
bun alchemy dev                 # root stack (miniflare)
bun alchemy deploy              # $USER stage
bun alchemy deploy --stage prod
```

Ops: [`docs/RUNBOOK.md`](docs/RUNBOOK.md). Recorded benches:
[`bench/RESULTS.md`](bench/RESULTS.md).
