/**
 * Compile-time fixtures for the catalog-generic query builder.
 *
 * `bun run typecheck` compiles this file. A mismatch turns `Expect<Equal<…>>`
 * into a type error, or leaves a `@ts-expect-error` unused.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  Attr,
  Catalog,
  type Eid,
  type Equal,
  type Expect,
  type FindRows,
  Long,
  Namespace,
  Ref,
  type TypedReadDatabaseClient,
  unsafeDatabase,
} from "../../src/schema/index.ts";

const User = Namespace("user", {
  name: Attr(Schema.String, { unique: "identity" }),
  age: Attr(Long),
  friends: Attr(Ref, { cardinality: "many" }),
});

const Movie = Namespace("movie", {
  title: Attr(Schema.String, { index: true }),
  year: Attr(Long),
});

const Movies = Catalog({ user: User, movie: Movie });
const db = unsafeDatabase(Movies);

// ── find row type matches bound attr types ─────────────────────────────────

const nameRows = db
  .q()
  .where("?e", User.name, "?n")
  .find("?n");
type NameRows = Effect.Success<typeof nameRows>;
type _nameRow = Expect<Equal<NameRows, readonly [string][]>>;

const identRows = db
  .q()
  .where("?e", ":user/name", "?n")
  .find("?n");
type _identRow = Expect<
  Equal<Effect.Success<typeof identRows>, readonly [string][]>
>;

const ageRows = db
  .q()
  .where("?e", User.age, "?a")
  .find("?a");
type _ageRow = Expect<Equal<Effect.Success<typeof ageRows>, readonly [number][]>>;

const eidAndName = db
  .q()
  .where("?e", User.name, "?n")
  .find("?e", "?n");
type EidNameRows = Effect.Success<typeof eidAndName>;
type EidCell = EidNameRows[number][0];
type NameCell = EidNameRows[number][1];
type _eidIsWrapper = Expect<Equal<EidCell, Eid<typeof Movies>>>;
type _eidNotNumber = Expect<Equal<EidCell extends number ? true : false, false>>;
type _nameStaysPrimitive = Expect<Equal<NameCell, string>>;
type _eidName = Expect<
  Equal<EidNameRows, readonly [Eid<typeof Movies>, string][]>
>;

// callback form infers the same row
const viaCb = db.q((q) => q.where("?e", User.name, "?n").find("?n"));
type _cbRow = Expect<Equal<Effect.Success<typeof viaCb>, readonly [string][]>>;

// ── ref-attr value binding is an Eid, not number ───────────────────────────

const friendRows = db
  .q()
  .where("?e", User.friends, "?f")
  .find("?f");
type _friendEid = Expect<
  Equal<Effect.Success<typeof friendRows>, readonly [Eid<typeof Movies>][]>
>;

const identRefRows = db
  .q()
  .where("?e", ":user/friends", "?f")
  .find("?f");
type _identRefEid = Expect<
  Equal<Effect.Success<typeof identRefRows>, readonly [Eid<typeof Movies>][]>
>;

// ── wrapper.pull infers the literate result ────────────────────────────────

declare const found: EidCell;
const fromFind = found.pull({
  name: User.name,
  age: User.age.optional,
  friends: User.friends.with({ name: User.name }),
});
type FromFind = NonNullable<Effect.Success<typeof fromFind>>;
type _fromFindName = Expect<Equal<FromFind["name"], string>>;
type _fromFindAge = Expect<Equal<FromFind["age"], number | undefined>>;
type _fromFindFriends = Expect<
  Equal<FromFind["friends"], readonly { readonly name: string }[]>
>;

// @ts-expect-error unknown attr on wrapper.pull
found.pull({ name: User.nope });

// ── unknown attr in where is a type error ──────────────────────────────────

// @ts-expect-error unknown ident
db.q().where("?e", ":user/nope", "?n");

// @ts-expect-error unknown ident string is not an attr slot
db.q().where("?e", ":movie/director", "?d");

// ── wrong constant value type is a type error ──────────────────────────────

// @ts-expect-error name is string, not number
db.q().where("?e", User.name, 42);

// @ts-expect-error year is number, not string
db.q().where("?e", Movie.year, "2016");

// @ts-expect-error ident form: name is string, not number
db.q().where("?e", ":user/name", 42);

// ── `_` and a variable in the attr slot are legal ──────────────────────────

const blankAttr = db.q().where("?e", "_", "?v").find("?e", "?v");
type _blankOk = Expect<
  Equal<Effect.Success<typeof blankAttr>, readonly [Eid<typeof Movies>, unknown][]>
>;

const varAttr = db.q().where("?e", "?a", "?v").find("?e", "?a", "?v");
type _varAttrOk = Expect<
  Equal<
    Effect.Success<typeof varAttr>,
    readonly [Eid<typeof Movies>, string, unknown][]
  >
>;

const blankVal = db.q().where("?e", User.name, "_").find("?e");
type _blankVal = Expect<
  Equal<Effect.Success<typeof blankVal>, readonly [Eid<typeof Movies>][]>
>;

// ── joining two clauses types both vars ────────────────────────────────────

const joined = db
  .q()
  .where("?e", User.name, "?n")
  .where("?e", User.age, "?age")
  .find("?n", "?age");
type _joined = Expect<
  Equal<Effect.Success<typeof joined>, readonly [string, number][]>
>;

const joinedMovie = db
  .q()
  .where("?e", User.name, "?n")
  .where("?m", Movie.title, "?t")
  .find("?n", "?t");
type _joinedMovie = Expect<
  Equal<Effect.Success<typeof joinedMovie>, readonly [string, string][]>
>;

// ── asOf / history still expose the builder ────────────────────────────────

const asOf = db.asOf(3);
const hist = db.history();
type _asOfQ = Expect<
  Equal<typeof asOf.q, TypedReadDatabaseClient<typeof Movies>["q"]>
>;
const asOfRows = asOf.q().where("?e", User.name, "?n").find("?n");
type _asOfRows = Expect<
  Equal<Effect.Success<typeof asOfRows>, readonly [string][]>
>;
const histRows = hist
  .q((q) => q.where("?e", User.name, "?n").find("?n"));
type _histRows = Expect<
  Equal<Effect.Success<typeof histRows>, readonly [string][]>
>;

// ── FindRows helper matches the Effect success ─────────────────────────────

type Bound = {
  readonly "?n": string;
  readonly "?e": Eid<typeof Movies>;
};
type _helper = Expect<
  Equal<
    FindRows<Bound, readonly ["?n", "?e"]>,
    readonly [string, Eid<typeof Movies>][]
  >
>;
