# @ramose/react

React bindings for Ramose. The provider owns one `Client` per subtree —
connect on mount, close on unmount or when its options change — and the hooks
hand it back. Named imports, not a namespace:

```tsx
import { RamoseProvider, useDb } from "@ramose/react";

<RamoseProvider url={RAMOSE_URL} token={tokenSource}>
  <App />
</RamoseProvider>;

const db = useDb("todos", Todos); // inside <App />
```

## API

- `<RamoseProvider {...ClientOptions}>` — calls `Ramose.connect(options)`,
  memoised on `url` and the identity of `token` / `fetch` / `webSocket`;
  closes the previous client when they change and on unmount. StrictMode's
  mount → close → mount re-connects, so the tree never holds a closed client.
- `useRamose(): Client` — the client the nearest provider owns. Throws
  outside a provider.
- `useDb(name, catalog): Db` — `client.db(name, catalog)`, memoised on
  `[client, name, catalog]`, so a stable `Db` reference falls out for effect
  and memo deps.
- `useLive(db, query): Live` / `useLive(stream): Live` — a standing read as
  state: `{ rows, error, ticks }`. The query form memoises `db.live(query)`
  on the *view* (structural, so an inline `db.asOf(t)` keeps one
  subscription per `t`, not per render) and `query` identity; the stream
  form takes a stream built elsewhere and re-subscribes when its identity
  changes — no provider needed. `rows` is `undefined` until the first emission and resets when the
  inputs change; `error` is the terminal failure only (completion of a
  pinned view keeps the last `rows`); `ticks` counts emissions after the
  first.
- `useQuery(db, query): Async<R>` — one-shot `db.q(query)`. Re-runs when the
  *view* changes (structural, so an inline `db.asOf(t)` re-runs per `t`, not
  per render) or `query` identity changes. `loading: true` over the previous
  `data` is the in-flight state — no flash to `undefined` on scrub — and
  stale results are dropped last-write-wins by issue order.
- `usePull(db, subject, pattern): Live<Pull | null>` — standing
  `db.livePull`. `subject` is compared structurally (`{ id }` or a lookup
  ref written inline is fine); `null` (entity retracted) is an emission, not
  an end; over a pinned view the stream emits once and completes.
- `useBasis(db): number | undefined` — `db.basis()` on mount, re-read on
  every session wake (a tick, a local write, a reconnect); on `asOf(t)`
  views answers `t` on the first render with no request.
- `useTransact(options?): Transact` — one hook for running writes (any
  Effect with `R = never`, really) from event handlers:

  ```tsx
  // src/todos.ts — the write is a generator over the tx builder
  export const addTodo = (db: TodosDb, title: string) =>
    db.transact(function* (tx) {
      const t = yield* tx.entity();
      yield* t.add(Todo.title, title);
    });

  // in the component
  const tx = useTransact({ onError: (e) => toast(errorMessage(e)) });

  <button
    disabled={tx.pending}
    onClick={() => void tx.run(addTodo(db, title))}
  />;
  ```

  `run` resolves to the `Exit` instead of throwing, so handlers stay
  `void`-safe; `pending` is true while any run is in flight; `error` holds
  the last-settled failure's error (not the cause) for inline rendering,
  clears when a run settles successfully or on `clearError()`, and
  `onError` fires per failure. Concurrent runs settle independently — the
  last settler wins `error`, whatever order the runs started in. It takes
  no `db` argument — it runs whatever Effect the caller built, so it
  composes with a module-singleton `Db` just as well as with `useDb`, and
  works without a provider. An effect settling after unmount touches no
  state, but `onError` still fires: the toast host usually outlives the
  form that ran the write.
- `errorMessage(error): string` — `e.message ?? e._tag ?? String(e)`, the
  one-liner every toast wants. Every `DbError` carries a `message`, so a
  policy denial (`Unauthorized`) toasts its server-written message; bare
  tagged errors fall back to the tag.

## Two rules the memo imposes

- **`token` must be stable.** Build the `TokenSource` once —
  `Ramose.token.jwt(mint)` at module scope, or in a `useMemo` — and pass that.
  An Effect built inline in the render changes identity every render, and the
  provider re-connects every render.
- **Multi-tenant remount is React's `key`.** `<RamoseProvider key={tenant}
  url={…}>` closes the old tenant's client and connects the new one when
  `tenant` changes.

## One rule the hooks impose

Queries and pull patterns are compared by **identity** — hoist them (they
are stable values), or the run / subscription re-keys every render. The
`db` argument and `usePull`'s `subject` are the exceptions: both are
compared structurally across `useLive` / `useQuery` / `usePull` /
`useBasis`, so `db.asOf(t)` and `{ id: 17 }` written inline are fine.
