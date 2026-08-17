/**
 * Compile-time fixtures for the Effect-native schema catalog.
 *
 * `bun run typecheck` compiles this file. A mismatch turns `Expect<Equal<…>>`
 * into a type error, or leaves a `@ts-expect-error` unused. Deliberately
 * breaking one assertion must fail tsc.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import {
  Attr,
  Bytes,
  Catalog,
  type CatalogIdent,
  type ClientOptions,
  type Databases,
  type DatabasesShape,
  type Db,
  type DbError,
  type Eid,
  type Equal,
  type Expect,
  type Extends,
  Instant,
  Long,
  Namespace,
  type ReadDb,
  Ref,
  type TxReport,
  Uuid,
  UuidString,
  type ValueAtIdent,
  layer,
} from "../../src/db/internal.ts";

import { Meta, Movie, Movies, User } from "./fixture.ts";

// ── catalog / namespace / attr inference ───────────────────────────────────

type _nsName = Expect<Equal<(typeof User)["ns"], "user">>;
type _attrIdent = Expect<
  Equal<(typeof User)["attributes"]["name"]["ident"], ":user/name">
>;
type _userNameRef = Expect<
  Equal<(typeof User)["name"]["ident"], ":user/name">
>;
type _attrCard = Expect<
  Equal<(typeof User)["attributes"]["name"]["cardinality"], "one">
>;
type _attrUnique = Expect<
  Equal<(typeof User)["attributes"]["name"]["unique"], "identity">
>;
type _manyCard = Expect<
  Equal<(typeof User)["attributes"]["friends"]["cardinality"], "many">
>;
type _nameType = Expect<
  Equal<Schema.Schema.Type<(typeof User)["attributes"]["name"]["schema"]>, string>
>;
type _ageType = Expect<
  Equal<Schema.Schema.Type<(typeof User)["attributes"]["age"]["schema"]>, number>
>;
type _idents = Expect<
  Equal<
    CatalogIdent<typeof Movies>,
    | ":user/name"
    | ":user/age"
    | ":user/friends"
    | ":user/bestFriend"
    | ":movie/title"
    | ":movie/year"
    | ":meta/source"
  >
>;
type _valueName = Expect<Equal<ValueAtIdent<typeof Movies, ":user/name">, string>>;
type _valueFriends = Expect<
  Equal<ValueAtIdent<typeof Movies, ":user/friends">, number>
>;
type _nameVt = Expect<
  Equal<(typeof User)["name"]["valueType"], ":db.type/string">
>;
type _ageVt = Expect<
  Equal<(typeof User)["age"]["valueType"], ":db.type/long">
>;
type _friendsVt = Expect<
  Equal<(typeof User)["friends"]["valueType"], ":db.type/ref">
>;

// helpers + primitives stamp valueType; explicit valueType overrides
const Typed = Namespace("typed", {
  s: Attr(Schema.String),
  n: Attr(Schema.Number),
  b: Attr(Schema.Boolean),
  l: Attr(Long),
  r: Attr(Ref),
  u: Attr(Uuid),
  us: Attr(UuidString),
  i: Attr(Instant),
  by: Attr(Bytes),
  override: Attr(Schema.String, { valueType: ":db.type/uuid" }),
});
type _sVt = Expect<Equal<(typeof Typed)["s"]["valueType"], ":db.type/string">>;
type _nVt = Expect<Equal<(typeof Typed)["n"]["valueType"], ":db.type/double">>;
type _bVt = Expect<Equal<(typeof Typed)["b"]["valueType"], ":db.type/boolean">>;
type _lVt = Expect<Equal<(typeof Typed)["l"]["valueType"], ":db.type/long">>;
type _rVt = Expect<Equal<(typeof Typed)["r"]["valueType"], ":db.type/ref">>;
type _uVt = Expect<Equal<(typeof Typed)["u"]["valueType"], ":db.type/uuid">>;
type _usVt = Expect<Equal<(typeof Typed)["us"]["valueType"], ":db.type/uuid">>;
type _iVt = Expect<Equal<(typeof Typed)["i"]["valueType"], ":db.type/instant">>;
type _byVt = Expect<Equal<(typeof Typed)["by"]["valueType"], ":db.type/bytes">>;
type _overrideVt = Expect<
  Equal<(typeof Typed)["override"]["valueType"], ":db.type/uuid">
>;

// .with is callable on inferred refs; a non-ref is a type error
const _refWith = Typed.r.with({ s: Typed.s });
void _refWith;
// @ts-expect-error Schema.String / non-ref .with is never
Typed.s.with({ s: Typed.s });
// @ts-expect-error Schema.Number / non-ref .with is never
Typed.n.with({ s: Typed.s });

// ── layer / Databases / db(name, catalog) ──────────────────────────────────

declare const options: ClientOptions;
const built = layer(options);
/** Getting a `Databases` cannot fail, and needs nothing else provided. */
type _layer = Expect<Equal<typeof built, Layer.Layer<Databases, never, never>>>;

declare const ripple: DatabasesShape;
const movies = ripple.db("movies", Movies);
type _dbIsDb = Expect<Equal<typeof movies, Db<typeof Movies>>>;
type _dbCatalog = Expect<Equal<(typeof movies)["catalog"], typeof Movies>>;
type _dbName = Expect<Equal<(typeof movies)["name"], string>>;

// a different catalog is a different db type
const Other = Catalog({
  tag: Namespace("tag", { label: Attr(Schema.String) }),
});
const other = ripple.db("other", Other);
type _notSame = Expect<Equal<Equal<typeof movies, typeof other>, false>>;

// ── asOf / history preserve the catalog and drop the write half ────────────

const asOf = movies.asOf(3);
const hist = movies.history;
type _asOf = Expect<Equal<typeof asOf, ReadDb<typeof Movies>>>;
type _hist = Expect<Equal<typeof hist, ReadDb<typeof Movies>>>;
type _asOfCatalog = Expect<Equal<(typeof asOf)["catalog"], typeof Movies>>;
type _asOfNoWrite = Expect<
  Equal<"transact" extends keyof typeof asOf ? true : false, false>
>;
/** `history` is a property, not a method — a view is a value. */
type _histIsProperty = Expect<
  Equal<typeof hist extends (...args: never) => unknown ? true : false, false>
>;

// ── the transaction is the generator, and reports a TxReport ───────────────

const written = movies.transact(function* (tx) {
  const ada = yield* tx.entity();
  yield* ada.add(User.name, "Ada");
  yield* ada.add(User.age, 36);
  yield* ada.add(Meta.source, "import");
  yield* ada.retract(User.age, 35);
  const arrival = yield* tx.entity();
  yield* arrival.add(Movie.title, "Arrival");
  yield* tx.retract(1001, User.age, 36);
  yield* tx.retractEntity(1001);
});
type _writtenOk = Expect<
  Equal<Effect.Success<typeof written>, TxReport<typeof Movies>>
>;
type _writtenErr = Expect<Equal<Effect.Error<typeof written>, DbError>>;
/** Every signature's `R` is `never`. */
type _writtenR = Expect<Equal<Effect.Services<typeof written>, never>>;

// `dbAfter` is the same `Db`, so it composes without a cast
declare const report: TxReport<typeof Movies>;
type _dbAfter = Expect<Equal<typeof report.dbAfter, Db<typeof Movies>>>;
type _txEid = Expect<Equal<typeof report.txEid, Eid<typeof Movies>>>;

// ── eids are data ──────────────────────────────────────────────────────────

declare const eid: Eid<typeof Movies>;
type _eidId = Expect<Equal<typeof eid.id, number>>;
// no methods and no I/O: `Eid` is `{ id }`
type _eidNoPull = Expect<Equal<"pull" extends keyof typeof eid ? true : false, false>>;

// ── tagged errors remain on the Effect (catchTags still typechecks) ────────

const caught = movies
  .transact(function* (tx) {
    const e = yield* tx.entity();
    yield* e.add(User.name, "Ada");
  })
  .pipe(
    Effect.catchTags({
      TxRejected: (e) => Effect.succeed(e.code),
      Unavailable: (e) => Effect.succeed(e.message),
      InvalidRequest: (e) => Effect.succeed(e.message),
      DatabaseNotFound: (e) => Effect.succeed(e.message),
      Unauthorized: (e) => Effect.succeed(e.message),
      QueryBudgetExceeded: (e) => Effect.succeed(e.clause),
      InternalError: (e) => Effect.succeed(e.message),
      NetworkError: (e) => Effect.succeed(e.message),
    }),
  );
type _caught = Expect<
  Equal<Effect.Success<typeof caught>, TxReport<typeof Movies> | string>
>;
type _caughtErr = Expect<Equal<Effect.Error<typeof caught>, never>>;
