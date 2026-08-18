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

In React, the hook is shipped — `useLive` from
[`@ripple/react`](/reference/react/):

```tsx
import { useLive } from "@ripple/react";

const { rows, error, ticks } = useLive(db, todoQuery);
```

It owns the memoisation (keyed on `[db, query]`, so nothing re-subscribes per
render), resets when the inputs change, and exposes `ticks` — the number of
emissions after the first, i.e. how many times the basis moved under this
subscription. Effect users who built the stream themselves pass it directly:
`useLive(stream)` re-subscribes when the stream's identity changes.

<details>
<summary>What the hook does</summary>

Drain the stream on its own fiber; interrupt the fiber on cleanup — that is
the whole lifecycle, because `live` requires nothing and teardown is fiber
interruption:

```tsx
useEffect(() => {
  setState(INITIAL); // new inputs, blank slate
  const fiber = Effect.runFork(
    Stream.runForEach(stream, (rows) => Effect.sync(() => setState({ rows, … }))).pipe(
      Effect.catchCause((error) => Effect.sync(() => setState((p) => ({ ...p, error })))),
    ),
  );
  return () => void Effect.runFork(Fiber.interrupt(fiber));
}, [stream]);
```

Only a terminal failure reaches the `catchCause`: interruption skips
recovery, and completion (a pinned `asOf` / `history` view emitted its one
pass) is not a `Cause` — the last `rows` stay.

</details>

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
