/**
 * Compile-time fixtures for the catalog-generic query builder.
 *
 * `bun run typecheck` compiles this file. A mismatch turns `Expect<Equal<…>>`
 * into a type error, or leaves a `@ts-expect-error` unused.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  attr,
  Catalog,
  type CatalogIdent,
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
  name: attr(Schema.String, { unique: "identity" }),
  age: attr(Long, { valueType: ":db.type/long" }),
  friends: attr(Ref, { cardinality: "many", valueType: ":db.type/ref" }),
});

const Movie = Namespace("movie", {
  title: attr(Schema.String, { index: true }),
  year: attr(Long, { valueType: ":db.type/long" }),
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
type _eidName = Expect<
  Equal<Effect.Success<typeof eidAndName>, readonly [number, string][]>
>;

// callback form infers the same row
const viaCb = db.q((q) => q.where("?e", User.name, "?n").find("?n"));
type _cbRow = Expect<Equal<Effect.Success<typeof viaCb>, readonly [string][]>>;

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
  Equal<Effect.Success<typeof blankAttr>, readonly [number, unknown][]>
>;

const varAttr = db.q().where("?e", "?a", "?v").find("?e", "?a", "?v");
type _varAttrOk = Expect<
  Equal<Effect.Success<typeof varAttr>, readonly [number, string, unknown][]>
>;

const blankVal = db.q().where("?e", User.name, "_").find("?e");
type _blankVal = Expect<
  Equal<Effect.Success<typeof blankVal>, readonly [number][]>
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

type Bound = { readonly "?n": string; readonly "?e": number };
type _helper = Expect<
  Equal<FindRows<Bound, readonly ["?n", "?e"]>, readonly [string, number][]>
>;

// keep CatalogIdent referenced
type _idents = CatalogIdent<typeof Movies>;
void 0 as unknown as _idents;
