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

const Meta = SchemaFx.Namespace("meta", {
  source: SchemaFx.attr(Schema.String),
})

const Movies = SchemaFx.Catalog({ user: User, movie: Movie, meta: Meta })
```

`create` / `connect` stay the same name-upsert they are today
(`DATABASE_NAME_RE` → `BadRequest`). The new argument is the catalog. Ensure
is part of the Effect.

```ts
const system = SchemaFx.makeSystem({ url })
const db = yield* system.create("movies", Movies)
// db : TypedReadWriteDatabaseClient<typeof Movies>
```

The typed write surface is a generator `transact` accepts directly. An
entity is a **bag of attributes**: any catalog namespace can be asserted
on the same handle. Transactions do not prescribe a nested
`{ user: {…}, meta: {…} }` shape — that forced an entity to live under
one namespace key and made metadata namespaces awkward. `User.name` is
the typed slot; the value type is correlated. `ada.add` is the handle
path. `db.transact` returns `Effect<TxAck, DatabaseError, RuntimeContext>`
plus whatever the body adds. An Effect-returning callback
(`(tx) => Effect.gen(...)`) stays for composition; it is not the default.

```ts
yield* db.transact(function* (tx) {
  const ada = yield* tx.entity()
  yield* ada.add(User.name, "Ada")
  yield* ada.add(User.age, 36)
  yield* ada.add(Meta.source, "import")  // different namespace, same entity
  yield* ada.retract(User.age, 35)

  const arrival = yield* tx.entity()
  yield* arrival.add(Movie.title, "Arrival")
})

// type error: unknown attr
ada.add(User.nope, "x")
// type error: wrong value type
ada.add(User.name, 42)
```

`entity` still returns the whole ident-keyed bag (no projection).
`pull` is a `Schema.Struct`-shaped pattern: callers map attr refs onto
the result keys they want. Required fields are `T`; `optional` is
`T | undefined`; `nested` follows a ref (object, or `T[]` if many).
Keyword-soup ident arrays remain as an escape. `q` is a catalog-generic
builder: bindings accumulate as clauses are added, and `find` produces
a row tuple from the selected variables. Today's object/string `q<T>`
stays as the escape hatch. `transactUntyped` is the write-side escape.
`transactWire` is the keyword-soup form (`{ ":user/name": "Ada" }`),
still catalog-checked — a bag, but not the Effect-savvy path.
`tx.add(e, attr, value)` stays for an eid / tempid / lookup that is
not a handle.

```ts
const ada = yield* db.entity(1001)
// ada?.[":user/name"] : string | undefined
// ada?.[":user/friends"] : readonly number[] | undefined

const Friend = SchemaFx.Struct({
  name: User.name,
  age: SchemaFx.optional(User.age),
})
const pulled = yield* db.pull(
  1001,
  SchemaFx.Struct({
    name: User.name,
    age: SchemaFx.optional(User.age),
    source: Meta.source,
    friends: SchemaFx.nested(User.friends, Friend),
  }),
)
// pulled : {
//   readonly name: string
//   readonly age: number | undefined
//   readonly source: string
//   readonly friends: readonly { readonly name: string; readonly age: number | undefined }[]
// } | null

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

**Builder vs nested maps vs keyword soup.** An entity is a bag of
attributes from *any* catalog namespace (think metadata namespaces:
`User.name` and `Meta.source` on the same entity). A nested
`{ user: { name: "Ada" } }` map prescribes a shape and puts the entity
under one namespace key — you cannot naturally mix namespaces. The
generator `transact` is the typed default: `tx.entity()` is a handle,
`ada.add(User.name, "Ada")` is one datom, value type is correlated to the
attr ref. `tx.add(e, attr, value)` is for eid / tempid / lookup, not the
lead. An Effect-returning callback stays for composition. `transactWire`
(`{ ":user/name": "Ada" }`) is still a bag and still catalog-checked, but
it is keyword soup. Nested maps remain as a `NestedEntity` type
(secondary / lowering), not the happy path. A future implementation
lowers the builder's collected `:db/add` / `:db/retract` ops to what the
peer already accepts.

**Pull is a Struct, not ident keys.** An ident-keyed
`db.pull(1001, [User.name])` → `{ ":user/name"?: string }` is honest
about the engine, and it is the wrong happy path. Callers do not want
to write `":user/name"` in application code, they cannot rename, they
cannot mark required vs maybe, and they cannot nest a ref into a
typed object. A nested map under namespace keys (`{ user: { name } }`)
is the same mistake the write path already rejected: it partitions
the entity and cannot mix `User.name` + `Meta.source`.

`SchemaFx.Struct` is the Effect-shaped answer. Keys are the names that
come back (`name`, not `":user/name"`). Values are the same attr refs
writes already use. `optional` is `Schema.optional`. `nested(ref, pattern)`
follows a `:db.type/ref` — card-one is an object, card-many is
`readonly T[]`. `pick(User, "name", "age")` is `Schema.pick` for the
same-namespace case. Recursion is just a nested Struct; two levels
typecheck. The catalog is still a bag: `Movie.title` on a user pull
is legal if you name the key.

The engine can still return ident maps. A future implementation
lowers `Struct({ name: User.name })` to today's pull with `:as`
(`(:user/name :as "name")`) and nested map specs. The typed result
is the decoded shape, not the wire. `[User.name, ":user/age"]`
stays as the keyword-soup escape — ident keys, every field optional.

`entity(eid)` still returns the whole bag (no projection). The catalog
does not partition entities into types.

**Typed `q` is a builder, not a Schema encoding of EDN.** The last writeup
left `q<T = unknown>` as the escape hatch because a `where` slot restricted
to catalog idents rejected `_` and variables. The builder keeps those
legal: the attr slot is `User.name | ":user/name" | "?a" | "_"`. Bindings
are a type-level map that grows with each `where`. `find("?n", "?age")`
is a tuple of the bound types. The object/string `q<T>` remains for
queries the builder does not type.

Remaining limits (pull):

- `entity(eid)` is still the whole ident-keyed bag. Use `pull` + Struct
  to project and rename.
- `nested` requires `valueType: ":db.type/ref"` on the attr. A `Ref`
  schema without that option is not enough for the type checker.
- Reverse refs (`:user/_friends`), `:as` on the wire, `limit` /
  `default`, and recursive `...` are not encoded. Use the ident-keyed
  escape or `q<T>`.
- The entity itself is still `| null` when the eid is missing;
  required fields describe the payload given that it exists.
- Patterns are finite values. There is no typed recursive-self pull
  (`friends` of `friends` of `…`); nest a couple of levels by hand.

Remaining limits (query builder):

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

**Cardinality-many is one add per datom.** `ada.add(User.friends, 1001)`
asserts one ref. Call `add` again for the next. That matches today's
`:db/add` (one datom). Wire maps still take an array for a many-attr
(`":user/friends": [1001, 1002]`) because that is the map form the peer
already speaks.

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
