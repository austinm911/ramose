---
title: Define your data
description: The catalog is your schema — attributes, uniqueness, cardinality, and references in plain TypeScript, checked when you build.
---

Your data model lives in one TypeScript file. You get autocomplete on every
attribute, a compile error when you write the wrong type, and no code
generation step to run. That file is the catalog, and the deploy script, the
browser, and any server code all import the same one.

The Quickstart's app ships this catalog:

```ts title="examples/todos/schema.ts"
import * as Ramose from "@ramose/alchemy/db";
import * as Schema from "effect/Schema";

export const Todo = Ramose.Namespace("todo", {
  title: Ramose.Attr(Schema.String),
  done: Ramose.Attr(Schema.Boolean),
  createdAt: Ramose.Attr(Ramose.Instant),
});

export const Todos = Ramose.Catalog({ todo: Todo });
```

Three pieces, and that is the whole vocabulary:

- **`Attr`** declares one attribute and the values it accepts.
- **`Namespace`** groups attributes under a prefix. `Todo.title` is
  `:todo/title` on the wire; you always write `Todo.title`.
- **`Catalog`** collects namespaces into the thing a database installs.

The value types come from [Effect Schema](https://effect.website), a runtime
type library — `Schema.String`, `Schema.Boolean`, and so on. Ramose adds a few
of its own for values TypeScript cannot describe on its own, such as
`Ramose.Instant` for a point in time.

## Growing the catalog

The rest of these guides use the same todos catalog with two more attributes
and a second namespace, so the examples have something to filter, sort, and
own. This is the version every later page assumes — read it here rather than
editing the shipped example, whose tests use the smaller catalog:

```ts title="schema.ts — the grown catalog (not the file in examples/todos)"
import * as Ramose from "@ramose/alchemy/db";
import * as Schema from "effect/Schema";

export const User = Ramose.Namespace("user", {
  /** the `sub` claim of your identity provider's token */
  sub: Ramose.Attr(Schema.String, { unique: "identity" }),
  name: Ramose.Attr(Schema.String),
  email: Ramose.Attr(Schema.String, { unique: "identity" }),
});

export const Todo = Ramose.Namespace("todo", {
  title: Ramose.Attr(Schema.String),
  done: Ramose.Attr(Schema.Boolean),
  createdAt: Ramose.Attr(Ramose.Instant),
  due: Ramose.Attr(Ramose.Instant),
  owner: Ramose.Attr(Ramose.Ref(() => User)),
});

export const Todos = Ramose.Catalog({ user: User, todo: Todo });
```

`Ramose.Ref(() => User)` is a reference: `Todo.owner` holds another entity, and
naming the target is what lets a query walk `Todo.owner.name` in one hop. The
arrow function is there so two namespaces can point at each other.

## Value types

Most attributes are ordinary Effect `Schema` values. Ramose ships branded ones
for the database types that cannot be inferred from TypeScript alone:

| schema | stores |
| --- | --- |
| `Ramose.Instant` | a point in time — you pass and receive `Date` |
| `Ramose.Long` | a 64-bit integer (plain `Schema.Number` is a double) |
| `Ramose.Uuid` / `Ramose.UuidString` | a UUID, as bytes or as a string |
| `Ramose.Ref(() => Namespace)` | a reference to an entity of that namespace |
| `Ramose.Ref.self` | a reference to the enclosing namespace (friends of a user) |
| `Ramose.Ref` | an untargeted reference — it stores fine, but queries cannot navigate through it |
| `Ramose.Bytes` | binary data |

:::caution
`String`, `Number`, and `Boolean` are inferred; everything else is not. If you
declare an attribute with a schema Ramose cannot map — a `Schema.Struct`, say —
pass the database type yourself with
`Ramose.Attr(mySchema, { valueType: ":db.type/string" })`, or installing the
catalog fails with `ramose/schema: cannot infer :db.type/* from this Schema`.
The check runs when the catalog is installed — at deploy (`Ramose.Database`) or
at `db.install()` — not when the module loads, so pass `valueType` as you write
the attribute.
:::

## Options

```ts title="schema.ts"
export const Todo = Ramose.Namespace("todo", {
  // …
  tags: Ramose.Attr(Schema.String, { cardinality: "many" }),
  notes: Ramose.Attr(Schema.String, { doc: "visible to admins only" }),
});
```

| option | default | effect |
| --- | --- | --- |
| `unique` | none | `"identity"` makes the attribute a key: writing an existing value updates that entity instead of making a new one, and `[User.email, "grace@acme.dev"]` addresses it |
| `cardinality` | `"one"` | `"many"` makes the attribute a set; a second value adds rather than replaces |
| `index` | true when `unique` is set, otherwise false | keeps a value-ordered index, which is what lets you look an entity up by value |
| `isComponent` | `false` | the referenced entity belongs to its parent and is retracted with it |
| `doc` | none | a docstring stored with the attribute |
| `valueType` | inferred | the database type, when it cannot be inferred |

## Types flow out of the catalog

Nothing downstream needs a type annotation:

```ts title="rows.ts"
import * as Ramose from "@ramose/alchemy/db";
import { Todo, Todos, User } from "./schema.ts";

const shape = {
  title: Todo.title,
  due: Todo.due.optional,
  owner: Todo.owner.select({ name: User.name }),
} as const;

export type TodoRow = Ramose.Pull<typeof Todos, typeof shape>;
// { title: string; due: Date | undefined; owner: { name: string } }
```

That type is a fine prop type for a React component: your UI types are your
database types, and they cannot drift.

## Changing a catalog later

Installing a catalog is an idempotent update — `Ramose.Database` does it at
deploy, `db.install()` does it when you mint a tenant (see [A database is a
name](/concepts/databases-are-names/#installing-a-catalog)). Adding attributes
or namespaces is just another install.

There is no destructive migration to fear, because facts are never rewritten:
old data keeps the attribute it was written with, and reads of the past keep
working. Removing an attribute from the catalog does not delete the facts that
used it.

**Checkpoint.** `bun test examples/todos` — four passing tests, driving the
same `todoQuery` and `addTodo` the rest of these guides use.

Next: [write some data](/guides/transactions/).
