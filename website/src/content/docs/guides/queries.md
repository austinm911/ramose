---
title: Query and pull
description: The typed navigational query — build a value from catalog attributes, run it once, live, or in the past.
---

Ripple's primary read surface is a **typed navigational query value**. You
build it from catalog attributes, run it with `db.q` or `db.live`, and the
client lowers it to the datalog + pull IR the engine evaluates at the edge.

```ts
import * as Ripple from "@ripple/alchemy/db";

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
  .select(shape)             // result shape; omit for an eid list
```

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
  title: Todo.title,                               // required — entities missing it are dropped
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

`empty: "first" | "last"` says where missing sort keys go (an EAV absence is
not SQL `NULL`). Today order / limit / offset run client-side on the projected
rows; server-side ordering is on the roadmap (`docs/QUERY.md` in the
repository tracks the feature matrix).

## Running

```ts
db.q(openTodos)            // Effect, once
db.live(openTodos)         // Stream; re-runs as the session basis advances
db.asOf(t).q(openTodos)    // pinned basis
db.asOf(t).live(openTodos) // emits once and completes
```

Scalars decode through Effect Schema (`Instant` → `Date`, and so on). Both
runners also still accept the legacy callback builder
(`db.q((q) => q.where("?e", Todo.title, "?t").find("?t"))`) — prefer the
navigational form for new code.

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
