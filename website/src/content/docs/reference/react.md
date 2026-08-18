---
title: React
description: "@ramose/react — RamoseProvider owns one Client per subtree; useDb, useLive, useQuery, usePull, useBasis and useTransact work from it."
---

`@ramose/react` is the React binding: hooks only, no UI. Named imports, not a
namespace:

```tsx
import { RamoseProvider, useDb, useLive, useTransact } from "@ramose/react";
```

## Provider

| name | signature |
| --- | --- |
| `RamoseProvider` | `(props: ClientOptions & { children? }) => JSX` |
| `useRamose` | `() => Client` — throws outside a provider |
| `useDb` | `(name: string, catalog: C) => Db<C>` |

`RamoseProvider` calls `Ramose.connect(options)`, memoised on `url` and the
*identity* of `token` / `fetch` / `webSocket`, and closes the previous client
when any of them change and on unmount. StrictMode's mount → close → mount
re-connects, so the tree never holds a closed client. Two rules the memo
imposes: `token` must be a stable `TokenSource` (built at module scope or in
a `useMemo`, not inline in the render), and multi-tenant remount is React's
own `key` — `<RamoseProvider key={tenant} url={…}>`.

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
the view and `query` — the view is structural, so an inline `db.asOf(t)`
keeps one subscription per `t`, not per render; the query is identity, so
pass a hoisted query (a query is a stable object). The
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
const todoQuery = Ramose.query(Todo)
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

## useQuery, usePull, useBasis

| name | signature |
| --- | --- |
| `useQuery` | `(db: ReadDb<C>, query: QueryInput<R>) => Async<R>` — one-shot `db.q` |
| `usePull` | `(db: ReadDb<C>, subject: Eid<C> \| LookupRef<C>, pattern: P) => Live<Pull<C, P> \| null>` — standing `db.livePull` |
| `useBasis` | `(db: ReadDb<C>) => number \| undefined` — where the basis is |
| `Async` | `{ data: A \| undefined; error: Cause.Cause<E> \| undefined; loading: boolean }` |

Every hook takes `db` explicitly, so it composes with `db.asOf(t)` /
`db.history` views — and the view is compared **structurally**: `db.asOf(t)`
is pure and builds a new object per call, and an inline
`useQuery(db.asOf(t), q)` re-runs per `t`, not per render. `usePull`'s
`subject` is structural too (`{ id: 17 }` or a lookup ref written inline is
fine). `query` and `pattern` are compared by identity: hoist them.

**`useQuery`** runs one `db.q` per view/query pair. The in-flight state is
`loading: true` over the **previous** `data` — a scrub over a time-travel
slider never flashes to `undefined`. Stale results are dropped
last-write-wins by issue order, not by resolution order: a slower answer to
an older run can never overwrite a newer run's rows. `error` is the failed
run's `Cause`, cleared when a new run starts, with the last `data` kept.

```tsx
const board = useQuery(db.asOf(t), boardQuery); // one query per slider move
```

**`usePull`** is `db.livePull(subject, pattern)` through `useLive`'s stream
engine — the same `Live` shape, over one entity. `rows` is the projection or
`null` (a retracted entity is a legitimate emission; the subscription keeps
standing), and over a pinned view the stream emits once, completes, and
keeps its rows. The `pattern` is identity — hoist it, or a fresh object
every render re-keys the subscription — while the `subject` is structural,
so `{ id: issueId }` written inline is fine.

```tsx
const issuePattern = { title: Issue.title, done: Issue.done };

const issue = usePull(db, { id: issueId }, issuePattern);
if (issue.rows === null) return <Gone />;
```

**`useBasis`** is `db.basis()` once on mount, then again on every wake of the
db's session — a basis tick, a local `transact`, a reconnect — one
`GET /db/:name/info` each; observing the basis bumps the session, so a
standing `live` that missed a tick re-runs too. On an `asOf(t)` view the
answer is `t` itself, synchronously on the first render, with no request. On
an HTTPS-only client (no `WebSocket`) there is no session to tick and the
read is one-shot. `undefined` until the first answer lands.

```tsx
const max = useBasis(db);            // the slider's upper bound, live
const pinned = useBasis(db.asOf(t)); // t, immediately, no request
```

## useTransact

| name | signature |
| --- | --- |
| `useTransact` | `(options?: { onError?: (error: unknown) => void }) => Transact` |
| `Transact` | `{ run<A, E>(effect: Effect<A, E>): Promise<Exit<A, E>>; pending: boolean; error: unknown \| undefined; clearError(): void }` |
| `errorMessage` | `(error: unknown) => string` — `e.message ?? e._tag ?? String(e)` |

One hook for running writes (any Effect with `R = never`, really) from event
handlers. `run` resolves to the `Exit` instead of throwing, so handlers stay
`void`-safe; `pending` is true while any run is in flight; `error` holds the
last-settled failure's error for inline rendering, clears when a run settles
successfully or on `clearError()`, and `onError` fires per failure. It takes
no `db` argument — it runs whatever Effect the caller built — and needs no
provider. After unmount a settling run touches no state, but `onError` still
fires: the toast host usually outlives the form that ran the write.

```tsx
const tx = useTransact({ onError: (e) => toast(errorMessage(e)) });

<button disabled={tx.pending} onClick={() => void tx.run(addTodo(db, title))} />;
```
