---
title: Live queries
description: db.live keeps a query answered. Write a row and every standing query re-runs — no refetch call, no cache invalidation.
---

A live query answers itself. You hand `db.live` the same query value you would
give `db.q`, and instead of one result you get a stream of results: the rows
now, and the rows again every time the database moves. Nothing at your write
site has to announce the change, and there is no cache to invalidate.

The query is a value, and it lives with your other queries:

```ts title="src/todos.ts"
import * as Ripple from "@ripple/alchemy/db";
import { Todo } from "../schema.ts";

export const todoQuery = Ripple.query(Todo)
  .orderBy(Todo.createdAt, "asc")
  .select({
    id: Todo.id,
    title: Todo.title,
    done: Todo.done,
    createdAt: Todo.createdAt,
  });
```

## In React

The hook is shipped — `useLive` from
[`@ripple/react`](/reference/react/):

```tsx title="src/App.tsx"
import { useLive } from "@ripple/react";
import { db } from "./db.ts";
import { todoQuery } from "./todos.ts";

export const TodoList = () => {
  const { rows, error } = useLive(db, todoQuery);
  if (error !== undefined) return <p>offline…</p>;
  if (rows === undefined) return <p>loading…</p>;
  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>{row.title}</li>
      ))}
    </ul>
  );
};
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

:::caution[The stream form builds its stream outside render]
`db.live(query)` creates a new stream every time it is called, and
`useLive(stream)` re-subscribes whenever the stream's identity changes. When
you pass a stream, build it once at module scope (or in a `useMemo` with
stable inputs) — never in the body of a component. The `useLive(db, query)`
form has no such caveat.
:::

## Where live queries work

A live query needs a WebSocket, because that connection is how the database
tells the client it moved.

| environment | live queries |
| --- | --- |
| a browser, through `Ripple.connect` (or `Ripple.layer` for Effect users) | yes — this is the intended home |
| a Worker binding another Worker (`Ripple.ServerBinding`) | **no.** There is no socket on that hop; calling `db.live` fails the fiber outright rather than returning an error you can catch |
| Node or Bun | only where a global `WebSocket` exists, or one you pass to `Ripple.connect` / `Ripple.layer` |

:::note[Two tabs, locally]
On the local emulator writes do not propagate between isolates, so a second
tab picks them up on reload. Your own tab always updates, because its own write
moves its own connection forward. Against a deployed peer, every connected
client updates.
:::

## What re-runs, and when

- **A write moves the whole connection.** Your `transact` sets the connection's
  version to the report's `t`, so every standing query on that connection
  re-runs — including in the tab that wrote.
- **A re-run is a whole re-run.** There is no diffing: the query is evaluated
  again. Policies and budgets apply exactly as they do to `db.q`.
- **Only news is emitted.** A re-run whose rows are identical to the last
  emission is not emitted again, so a write the query does not see is not a
  re-render.
- **The socket carries a version number, never rows.** It is a signal that the
  database advanced, not a data channel.
- **Dropped connections recover on their own.** Network failures and 5xx
  responses retry with a backoff from 250 ms up to 5 s, and the socket
  reconnects in place, re-reading your token. Standing streams are not torn
  down.
- **Four failures are terminal**, because retrying them changes nothing:
  `InvalidRequest`, `DatabaseNotFound`, `Unauthorized`, and
  `QueryBudgetExceeded`.
- **A pinned view emits once and completes.** `db.asOf(t).live(query)` has no
  news to deliver.
- **Teardown is interruption.** Interrupt the fiber draining the stream and
  everything unwinds; there is no unsubscribe call.

## What it costs

There is no per-query subscription state on the server. A live query is a
re-run of the same read path, triggered by a version tick, served from the
replica's view plus cached immutable data. Bursts of small writes coalesce
naturally, because re-runs happen per tick rather than per write.

**Checkpoint.** Tick a box in the running app and watch the list redraw with no
refetch.

Next: [put permissions on it](/guides/permissions/) so a standing query only
ever returns rows that caller is allowed to see.
