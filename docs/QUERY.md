# Query

Ripple’s read surface is a **typed navigational query value**. You build it
from catalog attributes (`Todo.done.eq(false)`, `Todo.owner.name`), run it with
`db.q` / `db.live`, and the client lowers it to the datalog + pull IR the engine
already evaluates — filters, shape, order and paging all run on the peer, in one
round trip.

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
// Stream<…, DbError> — same value

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
  .select(shape)             // result shape; omit for a list of Eid
  .build()                   // optional — db.q / db.live accept the builder too
```

`Todo.id` is the `:db/id` pseudo-attribute: selectable, orderable, and
comparable (`Todo.id.eq(eid)`, `Todo.id.gt(n)`).

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
  the result — on the peer, as a `where` clause, so a `.limit` counts only the
  rows you keep.
- **`.optional`**: types `T | undefined` and keeps the parent when the attr is
  absent.
- **Card-one ref `.select({…})`**: nested object; unfiltered nested shapes lower
  to `(pull ?e …)` inside `:find` (server-side, not client N+1). A required
  nested select is required through the ref: the parent is dropped when the
  ref is missing or the nested object fails *its* required fields.
- **Card-many `.select({…})`**: an array; a missing many is `[]`, never a drop.

### Order, limit, offset

```ts
.orderBy(Todo.due, "asc", { empty: "last" })
.limit(20)
.offset(0)
```

All three lower to the query AST (`:order` / `:limit` / `:offset`) and run on
the peer: rows are sorted, then paged, *then* pulled, so a `:limit 20` pulls
twenty entities and the client never sees the rows a page dropped.

- `orderBy` takes any card-one path — `Todo.due`, `Todo.owner.name`, `Todo.id`.
  Several `orderBy` calls compose in order; ties fall through to the next key.
- `empty: "first" | "last"` (default `"last"`) says where rows **without** a
  value at that path go — an EAV absence is not SQL `NULL`. It holds in *both*
  directions: `desc` does not float missing values to the top. Multi-hop paths
  keep such rows too (no owner, or an owner with no name, are both "empty").
- Mixed value types sort by a deterministic total order (numbers, then strings,
  booleans, instants, the rest).
- A path that crosses a **cardinality-many** attribute (`User.friends.name`) is
  rejected when you build the query: the sort key would be a set, not a value.

---

## Running

```ts
db.q(openTodos)            // Effect once
db.live(openTodos)         // Stream; re-runs as the session basis advances
db.asOf(t).q(openTodos)    // pinned basis
db.asOf(t).live(openTodos) // emits once and completes
```

Both `db.q` and `db.live` take a navigational query value or its builder.
Scalars decode through Effect Schema (`Instant` → `Date`, etc.). A query with
no `.select` yields `readonly Eid<C>[]`, typed against the catalog of the `db`
that ran it.

`db.live` re-runs the query at every basis tick and after a local `transact`.
A pass whose rows are identical to the last emission is **not** emitted again —
a write the query does not see is not a re-render.

`db.pull(eid, pattern)` remains the entity-by-id door. Prefer a navigational
query when you need filters, live, or `asOf` on the same artifact:

```ts
Ripple.query(Todo).where(/* … */).select(shape)
```

---

## How lowering works

A navigational query compiles to a find-pull query:

1. **Namespace scope** → `or` over `:n/*` attributes binding the root var `?e`.
2. **Where** → datalog clauses (path joins become fresh vars; predicates become
   ground clauses or function calls; `:db/id` predicates unify or compare `?e`
   itself).
3. **Required fields** → one `[?e :attr _]` clause per required card-one field
   of the shape (recursively through required nested selects), so the peer's
   row set is already the one the client keeps.
4. **Order** → each sort key binds a fresh variable through an `or-join`: one
   branch walks the path, the other proves it absent (`not`) and grounds `null`,
   which the engine places per `empty`. The `:order` vector names those
   variables; `:limit` / `:offset` pass through.
5. **Select** → pull pattern embedded in `:find` as `(pull ?e pattern)`.

The engine sorts the joined relation, pages it, and only then resolves the
pulls. The client's `finalizeNavResult` reshapes rows (pull maps into the
selected shape, bare ids into `Eid`s) and changes neither their number nor
their order.

For example, `query(Todo).orderBy(Todo.owner.name).limit(2).select({ title: Todo.title })`
lowers to:

```clojure
{:find  [(pull ?e [:todo/title])]
 :where [(or [?e :todo/title _] [?e :todo/done _] [?e :todo/due _] [?e :todo/owner _])
         [?e :todo/title _]
         (or-join [?e ?o0]
           (and [?e :todo/owner ?j1] [?j1 :user/name ?o0])
           (and (not [?e :todo/owner ?j2] [?j2 :user/name _])
                [(ground [nil]) [?o0 ...]]))]
 :order [[?o0 :asc :last]]
 :limit 2}
```

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
| Runners | `db.q` / `db.live` on query values; find-pull lowering; identical-result suppression on `live` | `db.changes`; `Ripple.explain` / `withBasis` |
| Order/limit | AST + engine `order` / `limit` / `offset`; required-field filtering on the peer, before `limit`; card-many `orderBy` rejected | — |
| IR hatch | — (the string-var callback builder is retired) | `@ripple/alchemy/db/datalog` typed IR, rules |

---

## Roadmap

Rough priority; nothing here changes the shipped API above without an explicit
cut.

### Next (engine / client gaps that unblock everyday queries)

- **`some` / `every` / `none`**, `Ripple.or` / `Ripple.not`, and card-many path
  sugar.
- **Reverse refs** (`Todo.owner.reverse`) and **filtered nested shapes**
  (correlated nested relation / `pull*`-style operator).
- **`in`**, ref `is`, `endsWith` / `matches`.

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
doc is the query language that sits on `db.q` / `db.live`; for how reads are
meant to be written, this file is the source of truth.
