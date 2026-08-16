/**
 * Compile-time fixtures for the Struct pull.
 *
 * `bun run typecheck` compiles this file. A mismatch turns `Expect<Equal<…>>`
 * into a type error, or leaves a `@ts-expect-error` unused.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  attr,
  Catalog,
  type Equal,
  type Expect,
  Long,
  Namespace,
  nested,
  optional,
  pick,
  Ref,
  Struct,
  unsafeDatabase,
} from "../../src/schema/index.ts";

const User = Namespace("user", {
  name: attr(Schema.String, { unique: "identity" }),
  age: attr(Long, { valueType: ":db.type/long" }),
  friends: attr(Ref, { cardinality: "many", valueType: ":db.type/ref" }),
  bestFriend: attr(Ref, { valueType: ":db.type/ref" }),
});

const Movie = Namespace("movie", {
  title: attr(Schema.String, { index: true }),
  year: attr(Long, { valueType: ":db.type/long" }),
});

const Meta = Namespace("meta", {
  source: attr(Schema.String),
});

const Movies = Catalog({ user: User, movie: Movie, meta: Meta });
const db = unsafeDatabase(Movies);

// ── renamed keys, required vs optional ─────────────────────────────────────

const required = db.pull(
  1001,
  Struct({
    name: User.name,
    age: User.age,
  }),
);
type RequiredPull = NonNullable<Effect.Success<typeof required>>;
type _reqName = Expect<Equal<RequiredPull["name"], string>>;
type _reqAge = Expect<Equal<RequiredPull["age"], number>>;
// ident keys are not on the result
type _noIdent = Expect<
  Equal<":user/name" extends keyof RequiredPull ? true : false, false>
>;

const maybe = db.pull(
  1001,
  Struct({
    name: optional(User.name),
    age: optional(User.age),
  }),
);
type MaybePull = NonNullable<Effect.Success<typeof maybe>>;
type _optName = Expect<Equal<MaybePull["name"], string | undefined>>;
type _optAge = Expect<Equal<MaybePull["age"], number | undefined>>;

// ── nested ref: many → array, one → object ─────────────────────────────────

const withFriends = db.pull(
  1001,
  Struct({
    name: User.name,
    friends: nested(
      User.friends,
      Struct({
        name: User.name,
        age: optional(User.age),
      }),
    ),
  }),
);
type FriendsPull = NonNullable<Effect.Success<typeof withFriends>>;
type _friends = Expect<
  Equal<
    FriendsPull["friends"],
    readonly { readonly name: string; readonly age: number | undefined }[]
  >
>;
type _selfName = Expect<Equal<FriendsPull["name"], string>>;

const withBest = db.pull(
  1001,
  Struct({
    bestFriend: nested(User.bestFriend, Struct({ name: User.name })),
    maybeBest: optional(
      nested(User.bestFriend, Struct({ name: User.name })),
    ),
  }),
);
type BestPull = NonNullable<Effect.Success<typeof withBest>>;
type _best = Expect<
  Equal<BestPull["bestFriend"], { readonly name: string }>
>;
type _maybeBest = Expect<
  Equal<BestPull["maybeBest"], { readonly name: string } | undefined>
>;

// two levels
const deep = db.pull(
  1001,
  Struct({
    friends: nested(
      User.friends,
      Struct({
        name: User.name,
        friends: nested(User.friends, Struct({ name: User.name })),
      }),
    ),
  }),
);
type DeepPull = NonNullable<Effect.Success<typeof deep>>;
type _deep = Expect<
  Equal<
    DeepPull["friends"],
    readonly {
      readonly name: string;
      readonly friends: readonly { readonly name: string }[];
    }[]
  >
>;

// ── cross-namespace fields on one pull ─────────────────────────────────────

const bag = db.pull(
  1001,
  Struct({
    name: User.name,
    source: Meta.source,
    title: Movie.title,
  }),
);
type BagPull = NonNullable<Effect.Success<typeof bag>>;
type _bagName = Expect<Equal<BagPull["name"], string>>;
type _bagSource = Expect<Equal<BagPull["source"], string>>;
type _bagTitle = Expect<Equal<BagPull["title"], string>>;

// ── pick ───────────────────────────────────────────────────────────────────

const picked = db.pull(1001, pick(User, "name", "age"));
type Picked = NonNullable<Effect.Success<typeof picked>>;
type _picked = Expect<
  Equal<Picked, { readonly name: string; readonly age: number }>
>;

// ── bare object is the same as Struct ──────────────────────────────────────

const bare = db.pull(1001, { name: User.name, age: optional(User.age) });
type Bare = NonNullable<Effect.Success<typeof bare>>;
type _bareName = Expect<Equal<Bare["name"], string>>;
type _bareAge = Expect<Equal<Bare["age"], number | undefined>>;

// ── ident-keyed escape still works ─────────────────────────────────────────

const soup = db.pull(1001, [User.name, User.age] as const);
type Soup = NonNullable<Effect.Success<typeof soup>>;
type _soupName = Expect<Equal<Soup[":user/name"], string | undefined>>;
type _soupAge = Expect<Equal<Soup[":user/age"], number | undefined>>;

// ── unknown attr is a type error ───────────────────────────────────────────

// @ts-expect-error unknown attr on the namespace
db.pull(1001, Struct({ name: User.nope }));

// @ts-expect-error ident not in the catalog
db.pull(1001, [":user/nope"]);

// ── wrong nested attr is a type error ──────────────────────────────────────

db.pull(
  1001,
  Struct({
    // @ts-expect-error cannot nest a non-ref attr
    friends: nested(User.name, Struct({ name: User.name })),
  }),
);

db.pull(
  1001,
  Struct({
    // @ts-expect-error unknown attr inside the nested pattern
    friends: nested(User.friends, Struct({ nope: User.nope })),
  }),
);

const Other = Namespace("tag", { label: attr(Schema.String) });
// @ts-expect-error attr from a catalog that is not on this client
db.pull(1001, Struct({ label: Other.label }));
