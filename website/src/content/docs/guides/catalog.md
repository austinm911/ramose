---
title: Define a catalog
description: The catalog is the schema — attributes, uniqueness, and cardinality in plain TypeScript, checked at compile time.
---

`@ripplegraph/alchemy/db` is the schema. A catalog is namespaces of attributes,
built from three constructors and shared verbatim by the deploy stack, the
Worker, and the browser. No codegen, no IDL, no drift.

```ts
import * as Ripple from "@ripplegraph/alchemy/db";
import * as Schema from "effect/Schema";

export const User = Ripple.Namespace("user", {
  email: Ripple.Attr(Schema.String, { unique: "identity" }),
  name: Ripple.Attr(Schema.String),
});

export const Movie = Ripple.Namespace("movie", {
  title: Ripple.Attr(Schema.String),
  year: Ripple.Attr(Schema.Number),
  cast: Ripple.Attr(Ripple.Ref(() => User), { cardinality: "many" }),
  addedBy: Ripple.Attr(Ripple.Ref(() => User)),
  releasedAt: Ripple.Attr(Ripple.Instant),
});

export const Movies = Ripple.Catalog({ user: User, movie: Movie });
```

## The constructors

| name | signature |
| --- | --- |
| `Attr` | `(schema: Schema.Top, options?) => Attribute` |
| `Namespace` | `(name: string, attrs: Record<string, Attribute>) => Namespace` |
| `Catalog` | `(namespaces: Record<string, Namespace>) => Catalog` |

An attribute's ident is `:namespace/attr` — `Movie.title` is `:movie/title`
on the wire. In transaction maps and policies you always reference the typed
attribute (`Movie.title`), never the string.

## Value types

Most attributes are plain Effect `Schema` values (`Schema.String`,
`Schema.Number`, `Schema.Boolean`, …). Ripple ships branded schemas for the
database types TypeScript cannot infer:

| schema | database type |
| --- | --- |
| `Ripple.Instant` | a point in time (use `Date` values) |
| `Ripple.Uuid` / `Ripple.UuidString` | UUIDs |
| `Ripple.Ref(() => Namespace)` | a reference to an entity of that namespace — the typed target is what lets queries navigate `Movie.addedBy.name` |
| `Ripple.Ref.self` | a self-edge (`user.friends` → users) |
| `Ripple.Ref` | an untargeted reference; stores fine, but navigational paths need a target |
| `Ripple.Long` | 64-bit integer |
| `Ripple.Bytes` | binary |

## Options

**Uniqueness** — `{ unique: "identity" }` makes an attribute a lookup key:
`[User.email, "grace@acme.dev"]` is a `LookupRef` usable anywhere an entity id
is, and transactions that assert an existing value *upsert* onto that entity.

**Cardinality** — `{ cardinality: "many" }` makes an attribute a set.
Asserting a second value adds to the set; card-one attributes instead retract
the previous value implicitly.

## Types flow from the catalog

Everything downstream is typed by the catalog — no annotations at use sites:

```ts
// Eid<typeof Movies> — a catalog-branded entity id; data, no methods
declare const e: Ripple.Eid<typeof Movies>;

// Pull results type themselves from the shape
const shape = { title: Movie.title, year: Movie.year };
type Row = Ripple.Pull<typeof Movies, typeof shape>;
// { title: string; year: number }
```

Shapes nest through refs (`Movie.addedBy.select({ name: User.name })`) and go
optional (`Movie.releasedAt.optional`) — the same grammar `Ripple.query`'s
`select` uses. A React component's props can be
`Pull<typeof Movies, typeof shape>` — the UI types are the database types.

## Evolving a catalog

Installing a catalog is an idempotent upsert (`Ripple.Database` at deploy or
`db.install()` at tenant creation — see
[A database is a name](/concepts/databases-are-names/#installing-a-catalog)).
Adding attributes or namespaces is an ordinary install; existing facts are
untouched. Because facts are immutable, there is no destructive migration —
old datoms keep their attribute, and history keeps reading correctly.
