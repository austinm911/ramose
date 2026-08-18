---
title: Query and pull
description: The typed navigational query — build a value from catalog attributes, run it once, live, or in the past.
---

Ripple's primary read surface is a **typed navigational query value**. You
build it from catalog attributes, run it with `db.q` or `db.live`, and the
client lowers it to the datalog + pull IR the engine evaluates at the edge.

```ts
import * as Ripple from "@ripplegraph/alchemy/db";

const openTodos = Ripple.query(Todo)
  .where(Todo.done.eq(false), Todo.owner.name.startsWith("A"))
  .orderBy(Todo.due, "asc", { empty: "last" })
  .limit(20)
  .select({
    title: Todo.title,
    owner: Todo.owner.select({ name: User.name }),
  });

yield* db.q(openTodos);
// Effect<readonly { title: string; owner: { name: string } }[], DbError>

db.live(openTodos);
// Stream — the same value, standing

yield* db.asOf(t).q(openTodos);
// the same value, pinned basis
```

A query is a **value**, not a method on `db`: one question runs once, live, or
in the past, and can live at module scope — a stable dependency for a React
hook.

## Building a query

```ts
Ripple.query(Todo)           // scope: entities carrying at least one :todo/* datom
  .where(...predicates)      // conjunctive filters
  .orderBy(attr, dir?, opts?)
  .limit(n)
  .offset(n)
  .select(shape)             // result shape; omit for a list of Eid
```

`Todo.id` is the `:db/id` pseudo-attribute — selectable, orderable, and
comparable (`Todo.id.eq(eid)`).

### Predicates

Catalog attributes carry the predicate vocabulary, and paths join through
refs:

| on | verbs |
| --- | --- |
| scalar / string / instant attrs | `eq` `ne` `lt` `lte` `gt` `gte` `exists` `missing` |
| string | `startsWith` `includes` (case-sensitive) |

```ts
Todo.done.eq(false)              // asserted false — a missing :todo/done does not match
Todo.done.missing()              // no :todo/done datom at all
Todo.owner.name.startsWith("A")  // join through owner, then filter
```

`eq` / `ne` / comparisons require the attribute to be present; use `exists` /
`missing` when absence is the question.

### Shape — `select`

`select` is the result shape. Keys you ask for appear in the type; keys you
omit are absent, not `undefined`.

```ts
.select({
  id: Todo.id,                                     // the entity id
  title: Todo.title,                               // required — entities missing it are dropped (on the peer)
  due: Todo.due.optional,                          // Date | undefined; keeps the parent
  owner: Todo.owner.select({ name: User.name }),   // nested object through a ref
})
```

Nested shapes on card-one refs lower to a server-side pull inside the query —
one round trip, not client-side N+1.

### Order, limit, offset

```ts
.orderBy(Todo.due, "asc", { empty: "last" })
.limit(20)
.offset(0)
```

All three run on the peer: rows are sorted, then paged, *then* pulled — so
`.limit(20)` pulls twenty entities and the client never sees the rows a page
dropped. Required fields in the shape are also enforced on the peer, before the
limit, so the page you get is the page you keep.

- `orderBy` takes any card-one path (`Todo.due`, `Todo.owner.name`, `Todo.id`);
  several calls compose, ties falling through to the next key.
- `empty: "first" | "last"` (default `"last"`) says where rows **without** a
  value at that path go — an EAV absence is not SQL `NULL` — and holds in both
  directions: `desc` does not float missing values to the top.
- A path across a **cardinality-many** attribute (`User.friends.name`) is
  rejected when the query is built: the sort key would be a set, not a value.

## Running

```ts
db.q(openTodos)            // Effect, once
db.live(openTodos)         // Stream; re-runs as the session basis advances
db.asOf(t).q(openTodos)    // pinned basis
db.asOf(t).live(openTodos) // emits once and completes
```

Scalars decode through Effect Schema (`Instant` → `Date`, and so on). A query
with no `.select` yields `readonly Eid<C>[]`. `db.live` re-emits only when the
rows changed — a tick the query's rows did not notice is not a re-render.

## `pull` — one entity, one shape

`db.pull(eid, shape)` is the entity-by-id door, using the same shape grammar
as `select`:

```ts
const shape = {
  title: Movie.title,
  year: Movie.year,
  addedBy: Movie.addedBy.select({ name: User.name }),
  releasedAt: Movie.releasedAt.optional,
};

const movie = yield* db.pull(eid, shape);
// Ripple.Pull<typeof Movies, typeof shape> | null
```

- The subject is an `Eid<C>` or a `LookupRef<C>`
  (`[User.email, "grace@acme.dev"]`).
- `Pull<C, P>` is a plain type: a React prop can be
  `Ripple.Pull<typeof Movies, typeof shape>`.

Prefer a navigational query when you need filters, live, or `asOf` on the
same artifact.

## Reading the past

Queries compose unchanged over the time-travel views:

```ts
yield* db.asOf(t).q(openTodos);
yield* db.history.q(openTodos);
```

See [Time travel](/concepts/time-travel/).

## Budgets

Every query runs under a memory guardrail (`RIPPLE_QUERY_MAX_CELLS`, default
~48 MB of cells). An over-budget query fails with `QueryBudgetExceeded`
(HTTP 413) naming the clause and the cell count — restructure the query or
raise the budget deliberately.

## Where reads run

Queries execute in the peer Worker at the edge, reading immutable segments
from R2 through a cache and novelty from the replica's basis — never from the
writer. Response headers carry the cost: `x-ripple-ms`, `r2-gets`,
`cache-hits`.
