---
title: Query and pull
description: Seek-driven datalog at the edge — the literate query builder, find, and typed pull patterns.
---

Reads are two shapes: `q`, a datalog query built with a literate builder, and
`pull`, a typed pattern against one entity. `live` is the same builder with a
different terminal — see [Live queries](/guides/live-queries/).

## `q` — the query builder

```ts
const rows = yield* db.q((q) =>
  q
    .where("?m", Movie.title, "?title")
    .where("?m", Movie.year, 2016)
    .find("?title"),
);
// readonly [string][]
```

- `.where(e, a, v)` adds a clause. Positions take a variable (`"?m"`), a
  literal (`2016`), a blank (`"_"`), or a typed attribute reference.
- Clauses join on shared variables — the engine is seek-driven and plans the
  join order against index statistics.
- `.find(...vars)` is the terminal. The row type is inferred from the bound
  variables: binding `?title` through `Movie.title` makes it a `string`.

Variables bound in `find` can also be entity ids, and an eid-typed result is
an `Eid<C>` you can feed to `pull` or a transaction.

## `pull` — one entity, one pattern

```ts
const pattern = {
  title: Movie.title,
  year: Movie.year,
  addedBy: Movie.addedBy.with({ name: User.name }),
  releasedAt: Movie.releasedAt.optional,
};

const movie = yield* db.pull(eid, pattern);
// Ripple.Pull<typeof Movies, typeof pattern> | null
```

- Patterns nest through refs with `.with({ … })`.
- `.optional` marks an attribute that may be absent — without it, an entity
  missing a required key is dropped from the result.
- The subject is an `Eid<C>` or a `LookupRef<C>`
  (`[User.email, "grace@acme.dev"]`).
- `Pull<C, P>` is a plain type: a React prop can be
  `Ripple.Pull<typeof Movies, typeof pattern>`.

## `find(...).pull(...)` — queries that return trees

After a one-eid `find`, `.pull(pattern)` reshapes each row:

```ts
const movies = yield* db.q((q) =>
  q.where("?m", Movie.title, "_").find("?m").pull({
    title: Movie.title,
    year: Movie.year,
  }),
);
// readonly [Eid<typeof Movies>, { title: string; year: number }][]
```

## Reading the past

`q` and `pull` compose unchanged over the time-travel views:

```ts
yield* db.asOf(t).q((q) => q.where("?m", Movie.title, "?t").find("?t"));
yield* db.history.q((q) => q.where("?m", Movie.title, "?t").find("?t"));
```

See [Time travel](/concepts/time-travel/).

## Budgets and explain

Every query runs under a memory guardrail (`RIPPLE_QUERY_MAX_CELLS`, default
~48 MB of cells). An over-budget query fails with `QueryBudgetExceeded`
(HTTP 413) naming the clause and the cell count — restructure the query or
raise the budget deliberately.

`.explain(...vars)` is the diagnostic terminal: it returns the plan instead of
rows. Under a policy, `explain` is admin-only.

## Where reads run

Queries execute in the peer Worker at the edge, reading immutable segments
from R2 through a cache and novelty from the replica's basis — never from the
writer. Response headers carry the cost: `x-ripple-ms`, `r2-gets`,
`cache-hits`.
