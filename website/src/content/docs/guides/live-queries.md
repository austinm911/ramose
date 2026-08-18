---
title: Live queries
description: db.live is a Stream on the session socket — write a row, it re-runs. No refetch, no invalidation.
---

`db.live` takes the same query value as `q` and stands it up: the result is
an Effect `Stream` that emits the current rows, then re-emits whenever a write
lands.

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
```

There is no invalidation call at the write site and no refetch in the UI. The
session socket ticks `t` when the database advances; the client re-runs the
query against the new basis. Because a query is a value, `todoQuery` can live
at module scope — one artifact for the once, live, and `asOf` forms, and a
stable dependency for a React hook.

## Consuming the stream

Hoist the stream (build it once, not per render), then drain it on its own
fiber. The `useLive` hook from the todos example is twelve lines:

```tsx
export const useLive = <A, E>(stream: Stream.Stream<A, E>) => {
  const [s, set] = useState<{ rows?: A; error?: Cause.Cause<E> }>({});
  useEffect(() => {
    const fiber = Effect.runFork(
      Stream.runForEach(stream, (rows) => Effect.sync(() => set({ rows }))).pipe(
        Effect.catchCause((error) => Effect.sync(() => set((p) => ({ ...p, error })))),
      ),
    );
    return () => void Effect.runFork(Fiber.interrupt(fiber));
  }, [stream]); // `stream` must be hoisted, not built in render
  return s;
};
```

## Semantics

- **`live` requires nothing.** The `Stream`'s requirements channel is
  `never` — no `Scope` in the type. Teardown is fiber interruption.
- **A write advances the whole connection.** `transact` bumps the session
  basis to `report.t`, so every standing `live` on that connection re-runs —
  including your own write, immediately.
- **Only news is emitted.** A re-run whose rows are identical to the last
  emission is not emitted again, so a write the query does not see is not a
  re-render.
- **`live` survives the network.** Dropped sockets, 5xx responses, and
  `NetworkError` are retried with backoff; the socket reconnects in place.
  The stream fails only on terminal errors: `InvalidRequest`, `Unauthorized`,
  or `DatabaseNotFound`.
- **Pinned views complete.** `live` over `asOf(t)` or `history` emits once
  and completes — a pinned view has no news.
- **The tick carries `t` only.** The socket is a per-database write-activity
  channel, never per-row data. Re-runs read through the normal query path,
  so policies and budgets apply unchanged.

## Cost model

A live query is a client-side re-run of the same one-round-trip query — the
peer holds no server-side subscription state per query. Frequent small writes coalesce
naturally: re-runs happen at basis ticks, and the read path serves them from
the replica basis plus cached segments.
