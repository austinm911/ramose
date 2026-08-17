---
title: Quickstart
description: Run a Ripple peer and a live-query UI locally, then deploy the same stack to Cloudflare.
---

The shortest path is the todos app — React, `Ripple.layer`, `db.live`.

## Run it locally

```sh
git clone https://github.com/tvanhens/ripple
cd ripple
bun install
bun alchemy dev examples/todos/alchemy.run.ts
```

In a second terminal, point the UI at the local peer:

```sh
VITE_RIPPLE_URL=http://localhost:8787 bunx vite examples/todos
```

That stack is a peer Worker (R2 + Transactor DO + QueryReplica DO), a
`Ripple.Server`, and a `Ripple.Database`. Alchemy's local mode (miniflare)
emulates R2 and both Durable Objects in one process — there is no external
database to start. Add a todo in one tab and watch another tab react.

:::note
Local dev needs no real Cloudflare account. Set `ALCHEMY_STATE=local` and any
placeholder `CLOUDFLARE_ACCOUNT_ID` (32 hex characters) with
`CLOUDFLARE_API_TOKEN=x` if Alchemy asks for credentials.
:::

## The three files that matter

Copy `examples/todos/{schema,resources,alchemy.run}.ts` and you have the same
shape.

**`schema.ts`** — the catalog, shared by the stack, the Worker, and the browser:

```ts
import * as Ripple from "@ripple/alchemy/db";
import * as Schema from "effect/Schema";

export const Todo = Ripple.Namespace("todo", {
  title: Ripple.Attr(Schema.String),
  done: Ripple.Attr(Schema.Boolean),
  createdAt: Ripple.Attr(Ripple.Instant),
});
export const Todos = Ripple.Catalog({ todo: Todo });
```

**`resources.ts`** — the peer Worker and the server:

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

export const RippleWorker = Cloudflare.Worker("Peer", {
  main: "./packages/worker/src/index.ts",
  compatibility: { date: "2025-06-01", flags: ["nodejs_compat"] },
  env: { STORE: Store, TRANSACTOR: Transactor, REPLICA: Replica },
});

export const Server = Ripple.Server("Ripple", { worker: RippleWorker });
```

**`alchemy.run.ts`** — the stack, and the one place the catalog is installed:

```ts
export const TodosDb = Ripple.Database("todos", {
  server: Server,
  catalog: Todos,
});
```

`Ripple.Database` is not a cloud object — a database is a name — it is
"install this catalog on that name", so the catalog is on the peer before the
UI connects.

## Connect from the browser

One runtime, disposed with the page; the session socket is its finalizer:

```ts
import * as Ripple from "@ripple/alchemy/db";
import * as Effect from "effect/Effect";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Redacted from "effect/Redacted";
import { Todos } from "./schema.ts";

const runtime = ManagedRuntime.make(
  Ripple.layer({
    url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:8787",
    token: Effect.succeed(Redacted.make(import.meta.env.VITE_RIPPLE_TOKEN)),
  }),
);
export const run = runtime.runPromise;
export const db = runtime.runSync(Ripple.Databases).db("todos", Todos);
```

Write and react:

```ts
const todoQuery = Ripple.query(Todo)
  .orderBy(Todo.createdAt, "asc")
  .select({
    id: Todo.id,
    title: Todo.title,
    done: Todo.done,
    createdAt: Todo.createdAt,
  });

const todos = db.live(todoQuery);
// Stream<readonly { id, title, done, createdAt }[], DbError>

await run(
  db.transact(function* (tx) {
    const t = yield* tx.entity();
    yield* t.add(Todo.title, "ship it");
    yield* t.add(Todo.done, false);
    yield* t.add(Todo.createdAt, new Date());
  }),
);
```

`@ripple/alchemy/db` is a real `exports` entry and nothing it reaches imports
the deploy engine, so the Vite app needs no alias.

## Deploy to Cloudflare

```sh
bun alchemy deploy              # deploys the $USER stage
bun alchemy deploy --stage prod # production
```

The same `alchemy.run.ts` that ran under miniflare provisions the Worker, both
Durable Object namespaces, and the R2 bucket on a real account. See
[Deploy with Alchemy](/guides/deploy/) for stages, credentials, and teardown.
