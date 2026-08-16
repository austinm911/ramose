# Effect-native schema catalog

Proposal + types. No engine implementation. The untyped
`Ripple.System` / `create(name)` / `ReadWriteDatabaseClient` is unchanged.

A catalog is a TypeScript value that *describes* the ident datoms a Ripple
database already stores. `create` / `connect` take that catalog, ensure it
(typed onto the Effect error channel), and hand back a client generic on it.
Unknown attributes and wrong value types are type errors. Reads that the
catalog can type do not collapse to `unknown`.

## Interface

Namespaces compose into a catalog. Attribute names are the keys; idents are
derived (`:user/name`) so they still map onto today's wire. The namespace
prefix lives on `User.ns`; `User.name` is the stamped attribute (an attr
ref the query builder accepts).

```ts
import * as Schema from "effect/Schema"
import { SchemaFx } from "@ripple/alchemy"

const User = SchemaFx.Namespace("user", {
  name: SchemaFx.attr(Schema.String, { unique: "identity" }),
  age: SchemaFx.attr(SchemaFx.Long),
  friends: SchemaFx.attr(SchemaFx.Ref, { cardinality: "many" }),
})

const Movie = SchemaFx.Namespace("movie", {
  title: SchemaFx.attr(Schema.String, { index: true }),
  year: SchemaFx.attr(SchemaFx.Long),
})

const Movies = SchemaFx.Catalog({ user: User, movie: Movie })
```

`create` / `connect` stay the same name-upsert they are today
(`DATABASE_NAME_RE` → `BadRequest`). The new argument is the catalog. Ensure
is part of the Effect.

```ts
const system = SchemaFx.makeSystem({ url })
const db = yield* system.create("movies", Movies)
// db : TypedReadWriteDatabaseClient<typeof Movies>
```

The typed write surface is a nested map keyed by namespace name. List ops
keep the Datomic shape, with the attribute slot restricted to catalog idents
and the value slot correlated to that ident.

```ts
yield* db.transact([
  { user: { name: "Ada", age: 36 } },
  { movie: { title: "Arrival", year: 2016 } },
  [":db/add", "ada", ":user/name", "Ada"],
])

// type error: unknown attr
db.transact([{ user: { nope: "x" } }])
// type error: wrong value type
db.transact([{ user: { name: 42 } }])
```

`entity` / `pull` project catalog value types. `q` is a catalog-generic
builder: bindings accumulate as clauses are added, and `find` produces a
row tuple from the selected variables. Today's object/string `q<T>` stays
as the escape hatch. `transactUntyped` is the write-side escape.
`transactWire` is the keyword-soup form (`{ ":user/name": "Ada" }`), still
catalog-checked.

```ts
const ada = yield* db.entity(1001)
// ada?.[":user/name"] : string | undefined
// ada?.[":user/friends"] : readonly number[] | undefined

const pulled = yield* db.pull(1001, [":user/name", ":user/age"])
// pulled?.[":user/name"] : string | undefined

const rows = yield* db.q((q) =>
  q.where("?e", User.name, "?n").find("?n"),
)
// rows : readonly [string][]

// fluent form is the same builder
const also = yield* db.q().where("?e", User.age, "?a").find("?e", "?a")
// also : readonly [number, number][]
```

The attribute slot accepts an attr ref (`User.name`), a catalog ident
(`":user/name"`), a variable (`"?a"`), or `_`. Restricting it to idents
only is what made the previous attempt reject blanks and vars. A variable
in the value slot of a known attr inherits that attr's type; a constant
of the wrong type is a type error. `asOf` / `history` expose the same
`q`.

Privilege, views, and tagged errors are the same split as the untyped
client. `asOf` / `history` return a read client that still carries the
catalog (and still has no `transact`). `catchTags` typechecks on both
`create` (`BadRequest` | `SchemaEnsureError`) and `transact` (`DatabaseError`).

```ts
const before = db.asOf(ack.t - 1)   // TypedReadDatabaseClient<typeof Movies>
yield* system.create("movies", Movies).pipe(
  Effect.catchTags({
    BadRequest: (e) => /* invalid name */,
    SchemaEnsureError: (e) => /* ensure tx failed */,
  }),
)
```

`SchemaFx.makeReadWriteSystemClient` (and the read / write halves) have the
same `(source: SystemSource) => Client` shape `makeSystemBinding` /
`makeSystemHttp` / `makeSystemLocal` are already generic over. A catalog-typed
system client drops into those layers; it does not replace today's
`ReadWriteSystem` default.

## Ensure contract

Schema is per-database ident datoms. The eight `:db.type/*` values, cardinality,
unique, index, isComponent, and doc are what the engine already persists.

- **Lowering.** `schemaTx(catalog)` produces one map form per attribute
  (`:db/ident`, `:db/valueType`, `:db/cardinality`, …). That is the body a
  future ensure would transact. It does not talk to a peer.
- **Separate tx.** An attribute cannot be defined and used in the same
  transaction. Ensure is its own schema tx, before any data tx that names
  those attrs.
- **Idempotent.** `:db/ident` is `:db.unique/identity`. Re-asserting the
  same definition upserts the same entity. `create` and `connect` stay the
  same upsert for the *name*; ensure is the extra, idempotent schema tx.
- **Failure.** Name validation is still `BadRequest` and still happens
  before anything else. Ensure failure is `SchemaEnsureError` on
  `create` / `connect`'s error channel. A real ensure would also need
  `RuntimeContext` (it is a transact); the typed signature already carries
  that requirement.
- **Not implemented.** The typed client's `transact` / `entity` / `q` /
  `health` are proposal stubs (`Effect.die`). `create` / `connect` validate
  the name and return a typed client; they do not install schema against a
  live database.

## Open tradeoffs

**Nested maps vs keyword soup.** Nested `{ user: { name: "Ada" } }` is the
typed default because excess-property checking and value-type correlation
are straightforward, and it feels like `Schema.Struct`. The wire form
`{ ":user/name": "Ada" }` is `transactWire` — same checks, uglier keys, what
the peer already accepts. Showing both is deliberate: the nested form is
the one that typechecks cleanly; the wire form is the one a future
implementation would send (or lower the nested form to).

**Typed `q` is a builder, not a Schema encoding of EDN.** The last writeup
left `q<T = unknown>` as the escape hatch because a `where` slot restricted
to catalog idents rejected `_` and variables. The builder keeps those
legal: the attr slot is `User.name | ":user/name" | "?a" | "_"`. Bindings
are a type-level map that grows with each `where`. `find("?n", "?age")`
is a tuple of the bound types. The object/string `q<T>` remains for
queries the builder does not type.

Remaining limits, honestly:

- A var or `_` in the *attr* slot leaves the value binding `unknown` —
  the catalog cannot say which attr it is.
- Predicate clauses (`(< ?age 18)`), `or` / `not` / rules, pull-in-find,
  and aggregates have no builder encoding yet. Use the `q<T>` escape.
- `:in` inputs are not on the builder (pass them on the escape hatch).
- A string constant that looks like a var (`"?n"` as a *value* for
  `:user/name`) is treated as a variable, not the three-character name.
- Re-binding a var to a different type keeps the first binding; the
  second `where` is not a type error.
- History 5-tuples (`?e ?a ?v ?tx ?added`) are untyped.
- Named find (`{ n: "?n" }`) is not offered; the tuple form infers
  cleanly.

**Uuid wart.** Uuid attributes currently read back as `{ vt: 6, v: "…" }`,
not a string (`fromJson` in `@ripple/core`). `SchemaFx.Uuid` is that tagged
struct so `entity` / `pull` stay honest. `SchemaFx.UuidString` is a string
that still lowers to `:db.type/uuid`, for writes that want a canonical
string. A real implementation has to pick one Type and decode the other;
this proposal does not paper over the engine.

**`Schema.Number` is double.** Ripple has both `:db.type/long` and
`:db.type/double`. Plain `Schema.Number` lowers to double. `SchemaFx.Long`
and `SchemaFx.Ref` are annotated `Schema.Number`s so inference can tell
them apart without a parallel schema language. Override with
`attr(schema, { valueType })` when the Schema is not a primitive or one of
those helpers.

**Cardinality-many in maps vs list ops.** Nested / wire maps take an array
for a many-attr (`friends: [1001, 1002]`). `:db/add` still takes one value
(one datom), even for many. That matches today's transactor.

**Ensure on `create` vs a separate `ensure`.** Putting ensure on
`create` / `connect` matches the requirement and keeps the happy path to
one yield. The cost is that opening a name now conceptually does I/O
(today it does not). An alternative is `create(name)` as now and
`db.ensure(catalog)` as a second Effect; the types would still work. This
proposal follows the stated `create("movies", Movies)` shape.

**Stubs vs a wrapping client.** Methods that would hit a peer die with a
"proposal stub" error rather than delegating to the untyped client. The
point of this PR is the TypeScript experience, not a silent pass-through
that would let a typed `transact` send an untyped body and look
implemented.
