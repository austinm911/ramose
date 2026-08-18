---
title: React
description: "@ripple/react — RippleProvider owns one Client per subtree; useRipple, useDb and useLive hand it back as hooks."
---

`@ripple/react` is the React binding: hooks only, no UI. Named imports, not a
namespace:

```tsx
import { RippleProvider, useDb, useLive } from "@ripple/react";
```

## Provider

| name | signature |
| --- | --- |
| `RippleProvider` | `(props: ClientOptions & { children? }) => JSX` |
| `useRipple` | `() => Client` — throws outside a provider |
| `useDb` | `(name: string, catalog: C) => Db<C>` |

`RippleProvider` calls `Ripple.connect(options)`, memoised on `url` and the
*identity* of `token` / `fetch` / `webSocket`, and closes the previous client
when any of them change and on unmount. StrictMode's mount → close → mount
re-connects, so the tree never holds a closed client. Two rules the memo
imposes: `token` must be a stable `TokenSource` (built at module scope or in
a `useMemo`, not inline in the render), and multi-tenant remount is React's
own `key` — `<RippleProvider key={tenant} url={…}>`.

`useDb(name, catalog)` is `client.db(name, catalog)`, memoised on
`[client, name, catalog]`. The call is pure — no network, no socket — so the
memo is purely about identity: a stable `Db` reference for effect and memo
deps. Pass a module-scope catalog or the memo is worthless.

## useLive

| name | signature |
| --- | --- |
| `useLive` (query form) | `(db: ReadDb<C>, query: QueryInput<R>) => Live<R>` |
| `useLive` (stream form) | `(stream: Stream.Stream<A, E>) => Live<A, E>` |
| `Live` | `{ rows: A \| undefined; error: Cause.Cause<E> \| undefined; ticks: number }` |

A standing read as React state. The query form memoises `db.live(query)` on
`[db, query]` — pass a hoisted query (a query is a stable object) and the
`Db` from `useDb`, or an `asOf(t)` / `history` view held in a memo. The
stream form takes any stream an Effect user built themselves and
re-subscribes when its identity changes; it needs no provider — `live`
requires nothing, so the drain is a plain `Effect.runFork`.

- `rows` is `undefined` until the first emission, and again right after the
  inputs change (the hook resets to the blank state and re-subscribes).
- `error` is the stream's **terminal** failure only. Transient errors never
  land here — `live` retries them in place — and completion is not an error:
  over `db.asOf(t)` the stream emits once and completes, and the last `rows`
  stay.
- `ticks` counts emissions after the first — how many times the basis moved
  under this subscription. Reef's "live" pill is `ticks` changing.

```tsx
const todoQuery = Ripple.query(Todo)
  .orderBy(Todo.createdAt, "asc")
  .select({ id: Todo.id, title: Todo.title, done: Todo.done });

const TodoList = () => {
  const db = useDb("todos", Todos);
  const { rows, error, ticks } = useLive(db, todoQuery);
  if (error !== undefined) return <Failed cause={error} />;
  if (rows === undefined) return <Loading />;
  return <ul>{rows.map((r) => <li key={r.id.id}>{r.title}</li>)}</ul>;
};
```

Later slices extend this page with `useQuery` / `usePull` / `useBasis` and
`useTransact`.
