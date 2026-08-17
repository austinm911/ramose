# Query

Ripple’s primary read surface is a **typed navigational query value**. You build it
from catalog attributes (`Todo.done.eq(false)`, `Todo.owner.name`), run it with
`db.q` / `db.live`, and the client lowers it to the datalog + pull IR the engine
already evaluates.

The legacy callback builder (`db.q((q) => q.where("?e", Todo.title, "?t").find("?t"))`)
still works. Prefer the navigational form for new code.

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
// Stream<…, LiveError> — same value

yield* db.asOf(t).q(openTodos);
// same value, pinned basis
```

A query is a **value**, not a method on `db`, so one question runs once, live, or
in the past, and can live at module scope (stable dependency for `useLive`).

---

## Schema: targeted refs

Navigation needs a typed ref target. Use `Ripple.Ref(() => Namespace)` or
`Ripple.Ref.self` for self-edges. Untargeted `Ripple.Ref` still works for
`:db.type/ref` storage, but paths like `Todo.owner.name` require a target.

```ts
export const User = Ripple.Namespace("user", {
  name: Ripple.Attr(Schema.String),
  email: Ripple.Attr(Schema.String, { unique: "identity" }),
  friends: Ripple.Attr(Ripple.Ref.self, { cardinality: "many" }),
});

export const Todo = Ripple.Namespace("todo", {
  title: Ripple.Attr(Schema.String),
  done: Ripple.Attr(Schema.Boolean),
  due: Ripple.Attr(Ripple.Instant),
  owner: Ripple.Attr(Ripple.Ref(() => User)),
});

export const Todos = Ripple.Catalog({ user: User, todo: Todo });
```

Attribute metadata for navigation uses `attrName` (not `.name`) so a path like
`Todo.owner.name` is not shadowed by the attribute’s own name field. Self-ref
and mutually recursive namespaces use depth-capped / lazy target substitution so
`Todo.owner.friends.name` types under TypeScript without “excessively deep”
instantiation.

---

## Building a query

```ts
Ripple.query(Todo)           // scope: entities that carry at least one :todo/* datom
  .where(...predicates)      // conjunctive filters
  .orderBy(attr, dir?, opts?)
  .limit(n)
  .offset(n)
  .select(shape)             // result shape; omit for eid list (see completeness)
  .build()                   // optional — db.q / db.live accept the builder too
```

### Scope

`Ripple.query(N)` denotes entities that carry **at least one** `:n/*` datom. The
lowerer emits an `or` over the namespace’s attributes so membership does not
require a `:db/ns` marker.

### Predicates

Catalog attributes carry the predicate vocabulary. Paths join through refs:

| On | Verbs |
|---|---|
| scalar / string / instant attrs | `eq` `ne` `lt` `lte` `gt` `gte` `exists` `missing` |
| string | `startsWith` `includes` (case-sensitive) |

```ts
Todo.done.eq(false)                 // asserted false — missing :todo/done does not match
Todo.done.missing()                 // no :todo/done datom
Todo.owner.name.startsWith("A")     // join through owner, then filter
```

`eq` / `ne` / comparisons require the attribute to be present. Use `exists` /
`missing` when absence is the question.

### Shape (`select`)

`select` is the result shape. Keys you ask for appear in the type; keys you omit
are absent, not `undefined`.

```ts
.select({
  title: Todo.title,
  due: Todo.due.optional,                              // Date | undefined
  owner: Todo.owner.select({ name: User.name }),       // nested object
})
```

- **Required field** (bare attr): entities missing that datom are dropped from
  the result (pull required-field filtering).
- **`.optional`**: types `T | undefined` and keeps the parent when the attr is
  absent.
- **Card-one ref `.select({…})`**: nested object; unfiltered nested shapes lower
  to `(pull ?e …)` inside `:find` (server-side, not client N+1).

### Order, limit, offset

```ts
.orderBy(Todo.due, "asc", { empty: "last" })
.limit(20)
.offset(0)
```

`empty: "first" | "last"` controls where missing sort keys go (EAV absence is
not SQL `NULL`). Today **order / limit / offset run client-side** on the
projected rows after pull; the core query AST does not yet carry top-level
order/limit (see [Roadmap](#roadmap)).

---

## Running

```ts
db.q(openTodos)            // Effect once
db.live(openTodos)         // Stream; re-runs as the session basis advances
db.asOf(t).q(openTodos)    // pinned basis
db.asOf(t).live(openTodos) // emits once and completes
```

Both `db.q` and `db.live` accept:

1. a navigational query / builder, or
2. the legacy `(q) => …` callback builder.

Scalars decode through Effect Schema (`Instant` → `Date`, etc.).

`db.pull(eid, pattern)` remains the entity-by-id door. Prefer a navigational
query when you need filters, live, or `asOf` on the same artifact:

```ts
Ripple.query(Todo).where(/* … */).select(shape)
```

---

## How lowering works

A navigational query compiles to a find-pull query:

1. **Where** → datalog clauses (path joins become fresh vars; predicates become
   ground clauses or function calls).
2. **Namespace scope** → `or` over `:n/*` attributes binding the root var.
3. **Select** → pull pattern embedded in `:find` as `(pull ?e pattern)`.
4. **Order / limit / offset** → applied on the client to the reshaped rows.

So filtered + projected reads are one round trip. Nested `select` on refs is the
same pull grammar the engine already supports.

---

## Feature completeness

Status of the navigational surface relative to the intended design.

| Area | Shipped | Not yet |
|---|---|---|
| Schema | `Ref(() => N)`, `Ref.self`, navigable attrs | namespace-branded `Eid<N>` cleanup |
| Build | `Ripple.query(N)`, `.where`, `.select`, `.orderBy`, `.limit`, `.offset`, `.build` | `Ripple.params`, `.one` / `.oneOrFail`, `.groupBy`, `.after(cursor)` |
| Predicates | `eq` `ne` `lt` `lte` `gt` `gte` `startsWith` `includes` `exists` `missing` | `in`, card-many `some` / `every` / `none`, ref `is`, `endsWith` / `matches` |
| Combinators | — | `Ripple.or` `Ripple.not` `Ripple.when` |
| Shape | nested `ref.select`, `.optional` (same grammar for `db.pull`) | `.reverse`, nested `where` / `orderBy` / `limit` on collections, `.expand`, `.orDefault`, `Ripple.all(N)` |
| Aggregates | — | `count` `sum` `avg` `min` `max` `countDistinct`, `having` |
| Graph | — | `.traverse` `.paths` `attr.reaches` `Ripple.either` |
| Runners | `db.q` / `db.live` on query values; find-pull lowering; legacy builder | identical-result suppression; `db.changes`; `Ripple.explain` / `withBasis` |
| Order/limit | client-side after pull | AST + engine `order` / `limit` / `offset`; server-side before `limit` required-field filter |
| IR hatch | legacy string-var builder | `@ripple/alchemy/db/datalog` typed IR, rules |

---

## Roadmap

Rough priority; nothing here changes the shipped API above without an explicit
cut.

### Next (engine / client gaps that unblock everyday queries)

- Top-level **`order` / `limit` / `offset` in the core AST**, with `{ empty }` via
  `get-else` sentinels — remove client-side sorting/paging.
- **Required-field filtering before `limit`** on the server (today pull filtering
  can disagree with a client `limit`).
- **`some` / `every` / `none`**, `Ripple.or` / `Ripple.not`, and card-many path
  sugar.
- **Reverse refs** (`Todo.owner.reverse`) and **filtered nested shapes**
  (correlated nested relation / `pull*`-style operator).
- Suppress **identical consecutive `live` emissions** client-side.

### Later

- **`Ripple.params` + `Ripple.when`** for stable, serializable parameterized
  queries.
- **Aggregates / `groupBy`**, `.one()` / `.oneOrFail()`, cursors (`.after`).
- **`.expand`** for bounded recursive trees in shapes; then **`.traverse` /
  `.paths` / `reaches`** for graph walks.
- Typed **`@ripple/alchemy/db/datalog`** escape hatch (logic vars as values,
  rules as P1).
- Live **footprint invalidation**, **`db.changes`**, shape-hash multiplexing.
- Optional **`:db/ns` marker** instead of or-join scope; `db.asOf(date)` /
  tx-instant navigation.

### Design notes still open

- Attribute values + lexical shadowing vs lambdas-everywhere for scope.
- Whether `/db/datalog` is promised public API or an unpromised hatch.
- Unbounded `.expand` typing vs literal-`max` type unrolling.
- Default `select` (eids only today) vs implicit `Ripple.all(N)`.
- Named error for schema-drift decode failures on long-lived clients.

---

## Relation to `docs/API.md`

`docs/API.md` describes the portable client (`Db`, catalog, tx, errors). This
doc is the query language that sits on `db.q` / `db.live`. Until API.md’s
signatures are updated to list navigational queries beside the callback builder,
treat this file as the source of truth for how reads are meant to be written.
