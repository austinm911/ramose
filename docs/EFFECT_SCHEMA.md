# Effect-native schema catalog

Typed surface over today's untyped client. Do not rewrite the transactor,
worker, replica, storage, or the existing untyped client.

The caller experience is `packages/alchemy/src/schema/usage.ts` (compiled
by `bun run typecheck`). Compile-time fixtures in
`packages/alchemy/test/schema/*-types.ts` and `types.ts` are the contract.

Export stays `export * as SchemaFx from "./schema/index.ts"` on `@ripple/alchemy`.

## Public API

Namespaces compose into a catalog. `User.name` is the stamped attr ref;
idents (`:user/name`) are derived for the wire.

```ts
import * as Schema from "effect/Schema"
import { SchemaFx } from "@ripple/alchemy"

const User = SchemaFx.Namespace("user", {
  name: SchemaFx.Attr(Schema.String, { unique: "identity" }),
  age: SchemaFx.Attr(SchemaFx.Long),
  friends: SchemaFx.Attr(SchemaFx.Ref, { cardinality: "many" }),
})
const Meta = SchemaFx.Namespace("meta", {
  source: SchemaFx.Attr(Schema.String),
})
const Movies = SchemaFx.Catalog({ user: User, meta: Meta })

const system = SchemaFx.makeSystem({ url })
const db = yield* system.create("movies", Movies)
```

`create` / `connect` take the catalog and **ensure** it. Name validation
is still `BadRequest`. Ensure failure is `SchemaEnsureError` on the same
Effect.

**transact** — generator callback. An entity is a bag: attrs from any
namespace on the same handle. `ada.add` is the write. `tx.add(e, attr, value)`
stays for eid / tempid / lookup. An Effect-returning callback stays for
composition; it is not the default.

```ts
yield* db.transact(function* (tx) {
  const ada = yield* tx.entity()
  yield* ada.add(User.name, "Ada")
  yield* ada.add(Meta.source, "import")
})
```

**q** — catalog-generic builder. Bindings accumulate; `find` is a row tuple.
Object/string `q<T>` stays as the escape.

**Eid.pull** — a `find` var bound as an entity (entity slot or
`:db.type/ref`) is an Eid wrapper, not a number. `.pull` is a plain object
of attr refs. Keys are the names that come back. A bare ref is required
(`T`). `.optional` is maybe. `.with({ … })` follows a ref (object, or
`T[]` if many). Mix namespaces on one map. Ident-keyed arrays stay as the
escape. `Eid.of(Movies, 1001)` wraps a known number.

```ts
const rows = yield* db.q((q) =>
  q.where("?e", User.name, "?n").find("?e", "?n"),
)
const ada = yield* rows[0][0].pull({
  name: User.name,
  age: User.age.optional,
  friends: User.friends.with({ name: User.name }),
})
```

Privilege / `asOf` / `history` / `catchTags` match the untyped client.
`asOf` / `history` still expose `q` and still have no `transact`.

## Ensure contract

- `schemaTx(catalog)` lowers to ident-datom maps (`:db/ident`,
  `:db/valueType`, `:db/cardinality`, …) — the body the engine already
  persists.
- Ensure is a **separate** ident-upsert tx. You cannot define and use an
  attribute in the same transaction.
- `:db/ident` is `:db.unique/identity`. Re-asserting the same definition
  upserts. `create` / `connect` stay the name upsert; ensure is the extra
  schema tx.
- Name check first (`BadRequest`); then ensure (`SchemaEnsureError`).

## Wire to the existing client

Wraps today's untyped `Ripple.System` / `ReadWriteDatabaseClient`. Does not
rewrite the transactor. Builder ops / pull maps / `schemaTx` lower onto
what the peer already accepts (`:db/add`, pull with `:as`, ident maps).

Real I/O (no proposal stubs on the happy path):

- `create` / `connect` — validate name, transact `schemaTx(catalog)`,
  return the typed client
- `transact` / `transactWire` / `transactUntyped` — collect ops, submit
- `q` / `query` / `Eid.pull` / `info` / `health` — real reads

`unsafeDatabase` / `Eid.of` without a peer still die (type-fixture
helpers). Integration tests live in `packages/alchemy/test/schema/io.test.ts`.

## Out of scope

- Closed entity types — the catalog is a bag; `Movie.title` on a user
  handle is legal
- `Struct` pull aliases / wrapping every pattern in `SchemaFx.Struct`
- `db.entity` / `db.pull` as a second door
- Nested-map transact (`{ user: { name } }`) as the happy path —
  `NestedEntity` is secondary only
