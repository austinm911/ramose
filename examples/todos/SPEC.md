# Reactive todo POC

A one-screen React todo app on the session socket and `db.live`. Writing a
todo re-renders the list. No refetch, no list `useState`, no `bump`, no
invalidation call at the write site.

The store lives in the browser tab that called `db.live`. The Worker only
terminates the socket. Close the tab (or `session.close()`) and the store
is gone.

## Surface (already on master)

```ts
const { session, db } = await run(
  SchemaFx.Session.connect({
    url: import.meta.env.VITE_RIPPLE_URL ?? "http://localhost:8787",
    name: "todos",
    catalog: Todos,
    token: import.meta.env.VITE_RIPPLE_TOKEN,
  }),
)

const todos = db.live((q) =>
  q.where("?e", Todo.title, "_").find("?e").pull({
    title: Todo.title,
    done: Todo.done,
    createdAt: Todo.createdAt,
  }),
)
// todos.get(): readonly { title, done, createdAt, eid }[] | undefined
// useSyncExternalStore(todos.subscribe, todos.get)

await run(
  db.transact(function* (tx) {
    const t = yield* tx.entity()
    yield* t.add(Todo.title, title)
    yield* t.add(Todo.done, false)
    yield* t.add(Todo.createdAt, new Date())
  }),
)
```

`ack.t` on that socket wakes the store. Writers never mention it. Other
tabs wake the same way (the isolate polls `/basis` and the Worker sends
`t` frames). No 2s client poll. No `live.ts` store of our own.

`session.close()` stops every store on that session.

## Catalog

```ts
export const Todo = SchemaFx.Namespace("todo", {
  title: SchemaFx.Attr(Schema.String),
  done: SchemaFx.Attr(Schema.Boolean),
  createdAt: SchemaFx.Attr(SchemaFx.Instant),
})
export const Todos = SchemaFx.Catalog({ todo: Todo })
```

## App

One screen: input, list, checkbox, delete.

- `schema.ts` — catalog above, shared by browser and stack
- `src/db.ts` — `Session.connect`, phantom `run`, export `{ session, db }`
- `src/todos.ts` — `addTodo` / `setDone` / `deleteTodo` as plain `db.transact`
- `src/useLive.ts` — `useSyncExternalStore(store.subscribe, store.get)`
- `src/App.tsx` — `TodoList` / `TodoRow` / `NewTodo`; only `useState` is the input
- stack — copy `examples/kv-style/{resources,alchemy.run}.ts`, retarget
  `create("todos", Todos)`. No app Worker. Vite serves the UI.

```
bun alchemy dev examples/todos/alchemy.run.ts
VITE_RIPPLE_URL=http://localhost:8787 bunx vite examples/todos
```

`@ripple/alchemy` is TS-source and its barrel pulls the deploy engine, so
Vite aliases `@ripple/alchemy/schema` (and `@ripple/core` if needed).
Put `react`, `react-dom`, `@types/react`,
`vite`, `@vitejs/plugin-react` in the **root** `devDependencies`
(`examples/` is not a workspace).
