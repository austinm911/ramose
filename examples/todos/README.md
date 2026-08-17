# Todos

The consumer proof for `docs/API.md`: React on `Ripple.layer` + `db.live`.
From the repo root:

```sh
bun alchemy dev examples/todos/alchemy.run.ts          # the peer (miniflare)
VITE_RIPPLE_URL=http://localhost:8787 bunx vite examples/todos   # the UI
```

`bunx vite build examples/todos` builds the same bundle for production.

## The shape

| file | what it is |
|---|---|
| `schema.ts` | the catalog, on `@ripple/alchemy/db` — shared by the stack, a Worker and the browser |
| `resources.ts` / `alchemy.run.ts` | `Ripple.Server` + `Ripple.Database`: the one place the catalog is installed |
| `src/db.ts` | one `ManagedRuntime`, disposed with the page. `run` and `db`, nothing else |
| `src/todos.ts` | the app's query and its writes, so the test drives exactly what the UI does |
| `src/useLive.ts` | twelve lines of `Stream` → React state. Example code, **not** a shipped name |
| `test/todos.test.ts` | those helpers against a real `@ripple/core` `Connection` over both wires |

`src/db.ts` is the whole client:

```ts
const runtime = ManagedRuntime.make(Ripple.layer({ url, token }));
export const run = runtime.runPromise;
export const db = runtime.runSync(Ripple.Databases).db("todos", Todos);
```

No `await` at module scope (the layer is scoped and getting a `Databases`
cannot fail), no hand-rolled `run`, and no Vite alias — `@ripple/alchemy/db` is
a real `exports` entry and nothing it reaches imports the deploy engine, so the
built bundle contains no `alchemy` code at all.

`db.live` is a `Stream`, so it is hoisted once at module scope and the hook's
dependency is stable:

```ts
const todos = db.live(todoQuery);   // Stream<readonly TodoRow[], Ripple.DbError>
```

Teardown is fiber interruption — `useLive`'s cleanup is one
`Fiber.interrupt`. Writes are `run(db.transact(function* (tx) { … }))` and one
row is `db.pull(eid, pattern)`; a write bumps the connection's basis, so the
standing stream re-runs with no refetch and no invalidation call at the write
site.
