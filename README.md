# Ripple

A modern Effect-native graph database on Cloudflare.

Docs: **[ripple-docs.tvanhens.workers.dev](https://ripple-docs.tvanhens.workers.dev)**.

One Durable Object writes. Immutable segment trees live in R2. Datalog runs
at the edge, next to your app. A database is a name — `ripple.db("acme",
Catalog)` and you're in. No provision step.

## Install

```sh
npm install @ripple/alchemy
```

`bun add` and `pnpm add` work the same. `@ripple/alchemy` is the package:

- `@ripple/alchemy/db` — the catalog and the client (browser, tests, anything
  that should never see the deploy engine)
- `@ripple/alchemy` — all of `/db`, plus `Ripple.Server`, `Ripple.Database`,
  and `Policy`

A React app also takes `@ripple/react`. The peer — the Worker that serves
your databases — is `@ripple/worker`: you name it as `main` on a
`Cloudflare.Worker`, you do not copy it into your repo.

```sh
npm install @ripple/alchemy @ripple/worker @ripple/react alchemy effect
```

The [Quickstart](https://ripple-docs.tvanhens.workers.dev/getting-started/quickstart/)
adds those packages to a Vite app, stands up a local peer, and gets a live
query on the page.

## Why it exists

- **Typed catalog.** `@ripple/alchemy/db` is the schema. Attributes, uniqueness,
  cardinality — TypeScript, checked at compile time.
- **Effect-native writes and reads.** Generator `transact`. Navigational
  `Ripple.query` → `db.q` / `db.live`. `db.pull`.
- **Live queries.** `db.live` is a `Stream` on the session socket. Write a
  row, it re-runs. No refetch. No invalidation call at the write site.
- **Db-per-tenant is a function call.** One Alchemy resource, one
  `RIPPLE_TOKEN` (unset = open), or a `RIPPLE_POLICY` that turns JWT
  claims into a per-request filtered `Db` (see
  [Auth and policy](https://ripple-docs.tvanhens.workers.dev/guides/auth/)).
  Every name shares the peer.
- **The invariants are the product.** Single writer. Dense `t`.
  Persist-before-ack. QueryReplicas are first-class — workers never read
  novelty from the transactor.

## Catalog → db → transact → live

```ts
import * as Ripple from "@ripple/alchemy/db";
import * as Schema from "effect/Schema";

export const Todo = Ripple.Namespace("todo", {
  title: Ripple.Attr(Schema.String),
  done: Ripple.Attr(Schema.Boolean),
  createdAt: Ripple.Attr(Ripple.Instant),
});
export const Todos = Ripple.Catalog({ todo: Todo });

const token = import.meta.env.VITE_RIPPLE_TOKEN;
const ripple = Ripple.connect({
  url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:1337",
  token: token ? Ripple.token.static(token) : undefined,
});
const db = ripple.db("todos", Todos);

const todoQuery = Ripple.query(Todo)
  .orderBy(Todo.createdAt, "asc")
  .select({
    id: Todo.id,
    title: Todo.title,
    done: Todo.done,
    createdAt: Todo.createdAt,
  });
const todos = db.live(todoQuery);
// Stream<readonly { id, title, done, createdAt }[]>

await Effect.runPromise(
  db.transact(function* (tx) {
    const t = yield* tx.entity();
    yield* t.add(Todo.title, "ship it");
    yield* t.add(Todo.done, false);
    yield* t.add(Todo.createdAt, new Date());
  }),
);
```

Every signature's `R` is `never`, so `Effect.runPromise` runs anything a
`Db` returns; in React the shipped hooks do it for you — `useLive(db, todoQuery)`
and `useTransact()` from `@ripple/react`. `@ripple/alchemy/db` is a real
`exports` entry and nothing it reaches imports the deploy engine, so the Vite
app needs no alias.

From a Worker the code is identical: `ripple.db("movies", Movies)`, then the
same `transact` / `q` / `pull`. `transact` returns a `TxReport`, and its
`dbAfter` is the same db floored at `report.t` — that is the read-your-write
fence, with no second round trip. `db.asOf(t)` and `db.history` are pure
views.

## Stand up a peer

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
  main: "@ripple/worker",
  compatibility: { date: "2025-06-01", flags: ["nodejs_compat"] },
  env: { STORE: Store, TRANSACTOR: Transactor, REPLICA: Replica },
});

export const Server = Ripple.Server("Ripple", { worker: RippleWorker });
export const TodosDb = Ripple.Database("todos", { server: Server, catalog: Todos });
```

`Ripple.Database` is not a cloud object — a database is a name — it is
"install this catalog on that name", so the catalog is on the peer before the
UI connects. Per-tenant names call `db.install()` at tenant-creation instead.
`RIPPLE_TOKEN` is the peer's one bearer token; leave it unset and the peer is
open. Set `RIPPLE_POLICY` and the peer verifies JWTs, ties each token to one
database, and filters reads / checks writes against the policy in
[Auth and policy](https://ripple-docs.tvanhens.workers.dev/guides/auth/).

An app Worker binds the same server (`yield* Ripple.ReadWriteDatabases(Server)`,
under `Ripple.ServerBinding` or `Ripple.ServerHttp`) and calls
`ripple.db(name, catalog)` per request — pure, zero network, so that is
db-per-tenant. `Ripple.ReadDatabases` is the same client with the writes
removed.

`npx alchemy dev` runs the stack locally under miniflare (peer on `:1337`).
`npx alchemy deploy` ships it; `--stage prod` for production. Local miniflare
accepts placeholder Cloudflare credentials — see the
[Quickstart](https://ripple-docs.tvanhens.workers.dev/getting-started/quickstart/).

## Features

- Immutable EAVT graph. Time travel is a view, not a dump.
- Seek-driven datalog at the edge. `Ripple.query` builds a typed value;
  `db.q` and `db.live` run it — once or as a `Stream` on the session socket.
  See [Query and pull](https://ripple-docs.tvanhens.workers.dev/guides/queries/).
- One writer per name, dense `t`, persist-before-ack.
- QueryReplicas hold novelty; workers read through them.
- Privilege is the capability you bind: `Ripple.ReadWriteDatabases` or
  `Ripple.ReadDatabases`; the transport is a Layer.

## Examples

Complete apps that use the same packages, in this repository:

- [`examples/todos`](examples/todos) — catalog, live query, typed writes
- [`examples/reef`](examples/reef) — multi-tenant issue tracker, Better Auth, policy
- [`examples/kv-style`](examples/kv-style) — one Worker, one database per customer

## Contributing

Working on Ripple itself is a Bun monorepo. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

```sh
bun install
bun test
bun run typecheck
bun run dev:todos     # peer on :1337, app on :5173
```

Ops: [Runbook](https://ripple-docs.tvanhens.workers.dev/reference/runbook/).
Recorded benches: [`bench/RESULTS.md`](bench/RESULTS.md).
