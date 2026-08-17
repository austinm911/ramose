/**
 * Compile-time fixtures for `db.live`. `bun run typecheck` compiles this file.
 *
 * `live` and `q` are two terminals over one builder, so the row types are the
 * same ones `query-types.ts` pins; what is specific here is that `live` is a
 * `Stream` whose requirements channel is `never` (no `Scope` in the type).
 */

import * as Schema from "effect/Schema";
import type * as Stream from "effect/Stream";
import type {
  Db,
  DbError,
  Eid,
  Equal,
  Expect,
  Pull,
} from "../../src/db/internal.ts";
import { Attr, Namespace } from "../../src/db/internal.ts";

import { Movies, User } from "./fixture.ts";

declare const db: Db<typeof Movies>;

/** A well-formed attr that this catalog has never heard of. */
const Other = Namespace("other", { x: Attr(Schema.String) });

// ── the stream's element is the query's row type ───────────────────────────

const pattern = { name: User.name, age: User.age.optional };
const named = db.live((q) =>
  q.where("?e", User.name, "_").find("?e").pull(pattern),
);
type NamedRows = readonly (readonly [
  Eid<typeof Movies>,
  Pull<typeof Movies, typeof pattern>,
])[];
type _named = Expect<Equal<typeof named, Stream.Stream<NamedRows, DbError>>>;
/** `live` requires nothing: teardown is fiber interruption, not a `Scope`. */
type _namedR = Expect<Equal<Stream.Services<typeof named>, never>>;
type _namedErr = Expect<Equal<Stream.Error<typeof named>, DbError>>;

// nested pulls come through the same as `db.pull`
const friends = db.live((q) =>
  q
    .where("?e", User.name, "?n")
    .find("?e")
    .pull({ friends: User.friends.select({ name: User.name }) }),
);
type Friends = Stream.Success<typeof friends>;
type _friends = Expect<
  Equal<Friends[number][1]["friends"], readonly { readonly name: string }[]>
>;

// ── no `.pull` is a stream of find rows ────────────────────────────────────

const eids = db.live((q) => q.where("?e", User.name, "_").find("?e"));
type _eids = Expect<
  Equal<
    Stream.Success<typeof eids>,
    readonly [Eid<typeof Movies>][]
  >
>;

// a ref-bound value var is an entity var too
const bestFriends = db.live((q) =>
  q.where("?e", User.bestFriend, "?f").find("?f").pull({ name: User.name }),
);
type _bestFriends = Expect<
  Equal<
    Stream.Success<typeof bestFriends>[number][0],
    Eid<typeof Movies>
  >
>;

// multi-var find is fine for `live` — it is `.pull` that needs one entity var
const pairs = db.live((q) => q.where("?e", User.name, "?n").find("?e", "?n"));
type _pairs = Expect<
  Equal<
    Stream.Success<typeof pairs>,
    readonly [Eid<typeof Movies>, string][]
  >
>;

// ── a pinned view still gives a Stream ─────────────────────────────────────

const past = db.asOf(3).live((q) => q.where("?e", User.name, "?n").find("?n"));
type _past = Expect<
  Equal<typeof past, Stream.Stream<readonly [string][], DbError>>
>;
const hist = db.history.live((q) => q.where("?e", User.name, "?n").find("?n"));
type _hist = Expect<
  Equal<typeof hist, Stream.Stream<readonly [string][], DbError>>
>;

// ── the builder is still catalog-checked ───────────────────────────────────

// @ts-expect-error an attr outside the catalog fails ValidatePull
db.live((q) => q.where("?e", User.name, "_").find("?e").pull({ x: Other.x }));

// @ts-expect-error unknown ident in the where clause
db.live((q) => q.where("?e", ":user/nope", "_").find("?e"));

// @ts-expect-error a value var is not an entity var, so it cannot be pulled
db.live((q) => q.where("?e", User.name, "?n").find("?n").pull({ name: User.name }));
