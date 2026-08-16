/**
 * Compile-time fixtures for `db.live`. `bun run typecheck` compiles this file.
 */

import * as Schema from "effect/Schema";
import type {
  Eid,
  Equal,
  Expect,
  LiveStore,
  TypedLiveDatabaseClient,
} from "../../src/schema/index.ts";
import { Attr, Namespace } from "../../src/schema/index.ts";

import { Movies, User } from "./fixture.ts";

declare const db: TypedLiveDatabaseClient<typeof Movies>;

/** A well-formed attr that this catalog has never heard of. */
const Other = Namespace("other", { x: Attr(Schema.String) });

// ── `.pull` rows are the pull result plus the eid ──────────────────────────

const named = db.live((q) =>
  q.where("?e", User.name, "_").find("?e").pull({
    name: User.name,
    age: User.age.optional,
  }),
);
type Named = NonNullable<ReturnType<typeof named.get>>;
type _namedRow = Expect<
  Equal<
    Named,
    readonly {
      readonly name: string;
      readonly age: number | undefined;
      readonly eid: Eid<typeof Movies>;
    }[]
  >
>;
type _namedStore = Expect<Equal<typeof named, LiveStore<Named>>>;
type _namedUndefined = Expect<
  Equal<ReturnType<typeof named.get>, Named | undefined>
>;

// a pull map with its own `eid` key loses it to the row's entity
const shadowed = db.live((q) =>
  q.where("?e", User.name, "_").find("?e").pull({ eid: User.name }),
);
type _shadowed = Expect<
  Equal<
    NonNullable<ReturnType<typeof shadowed.get>>[number]["eid"],
    Eid<typeof Movies>
  >
>;

// nested pulls come through the same as `eid.pull`
const friends = db.live((q) =>
  q
    .where("?e", User.name, "?n")
    .find("?e")
    .pull({ friends: User.friends.with({ name: User.name }) }),
);
type Friends = NonNullable<ReturnType<typeof friends.get>>;
type _friends = Expect<
  Equal<Friends[number]["friends"], readonly { readonly name: string }[]>
>;

// ── no `.pull` is a store of eids ──────────────────────────────────────────

const eids = db.live((q) => q.where("?e", User.name, "_").find("?e"));
type _eids = Expect<
  Equal<ReturnType<typeof eids.get>, readonly Eid<typeof Movies>[] | undefined>
>;

// a ref-bound value var is an entity var too
const bestFriends = db.live((q) => q.where("?e", User.bestFriend, "?f").find("?f"));
type _bestFriends = Expect<
  Equal<
    ReturnType<typeof bestFriends.get>,
    readonly Eid<typeof Movies>[] | undefined
  >
>;

// `options` stays on the chain
db.live((q) => q.options({ explain: true }).where("?e", User.name, "_").find("?e"));

// ── find takes exactly one entity var ──────────────────────────────────────

// @ts-expect-error two vars: live find is one entity, not a tuple
db.live((q) => q.where("?e", User.name, "?n").find("?e", "?n"));

// @ts-expect-error a value var is not an entity var
db.live((q) => q.where("?e", User.name, "?n").find("?n"));

// @ts-expect-error an unbound var is not in the bindings
db.live((q) => q.where("?e", User.name, "?n").find("?zzz"));

// @ts-expect-error an attr var binds an ident string, not an entity
db.live((q) => q.where("?e", "?a", "?v").find("?a"));

// ── the pull map is still catalog-checked ──────────────────────────────────

// @ts-expect-error an attr outside the catalog fails ValidatePull
db.live((q) => q.where("?e", User.name, "_").find("?e").pull({ x: Other.x }));

// @ts-expect-error unknown ident in the where clause
db.live((q) => q.where("?e", ":user/nope", "_").find("?e"));
