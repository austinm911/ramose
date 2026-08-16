/**
 * Compile-time fixtures for the catalog-generic transaction builder.
 *
 * `bun run typecheck` compiles this file. A mismatch turns `Expect<Equal<…>>`
 * into a type error, or leaves a `@ts-expect-error` unused.
 */

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { TxAck } from "../../src/Client.ts";
import type { DatabaseError } from "../../src/DatabaseTypes.ts";
import {
  Attr,
  Catalog,
  type EntityHandle,
  type Equal,
  type Expect,
  type Extends,
  Long,
  Namespace,
  Ref,
  type TxBuilder,
  type TypedReadDatabaseClient,
  type TypedReadWriteDatabaseClient,
  type TypedWriteDatabaseClient,
  unsafeDatabase,
  unsafeReadDatabase,
  unsafeWriteDatabase,
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

const Meta = Namespace("meta", {
  source: Attr(Schema.String),
});

const Tag = Namespace("tag", {
  label: Attr(Schema.String),
});

const Movies = Catalog({ user: User, movie: Movie, meta: Meta });
const db = unsafeDatabase(Movies);

// ── generator transact is the happy path ───────────────────────────────────

const crossNs = db.transact(function* (tx) {
  const ada = yield* tx.entity();
  yield* ada.add(User.name, "Ada");
  yield* ada.add(User.age, 36);
  yield* ada.add(Meta.source, "import");
  // bag: Movie.title on a user handle is legal — do not close the world
  yield* ada.add(Movie.title, "not a movie but types allow any ns");
});
type _crossNsAck = Expect<Equal<Effect.Success<typeof crossNs>, TxAck>>;
type _crossNsErr = Expect<Extends<DatabaseError, Effect.Error<typeof crossNs>>>;

// Effect-returning callback stays for composition (not the default)
const viaEffect = db.transact((tx) =>
  Effect.gen(function* () {
    const e = yield* tx.entity();
    yield* e.add(User.name, "Ada");
  }),
);
type _viaEffect = Expect<Equal<Effect.Success<typeof viaEffect>, TxAck>>;

// ── unknown attr is a type error ───────────────────────────────────────────

db.transact(function* (tx) {
  const e = yield* tx.entity();
  // @ts-expect-error unknown attr on the namespace
  yield* e.add(User.nope, "x");
  // @ts-expect-error ident not in the catalog
  yield* e.add({ ident: ":user/nope" } as const, "x");
  // @ts-expect-error namespace not in this catalog
  yield* e.add(Tag.label, "x");
  // @ts-expect-error unknown ident string
  yield* tx.add(e, ":user/nope", "x");
});

// ── wrong value type is a type error ───────────────────────────────────────

db.transact(function* (tx) {
  const e = yield* tx.entity();
  // @ts-expect-error name is string, not number
  yield* e.add(User.name, 42);
  // @ts-expect-error year is number, not string
  yield* e.add(Movie.year, "2016");
  // @ts-expect-error ident form: name is string, not number
  yield* tx.add(e, ":user/name", 42);
  // @ts-expect-error friends is a ref (number), not a string
  yield* e.add(User.friends, "Ada");
});

// ── retract / retractEntity typecheck ──────────────────────────────────────

const retracts = db.transact(function* (tx) {
  const e = yield* tx.entity(1001);
  yield* e.retract(User.age, 35);
  yield* e.retract(User.name);
  yield* e.retractEntity();
  yield* tx.retract(e, User.friends, 1002);
  yield* tx.retractEntity(e);
  const byLookup = yield* tx.entity([User.name, "Ada"]);
  yield* byLookup.add(Meta.source, "lookup");
  yield* tx.add([":user/name", "Ada"], User.age, 36);
});
type _retractAck = Expect<Equal<Effect.Success<typeof retracts>, TxAck>>;

// ── Write vs Read still distinguishes transact ─────────────────────────────

type ReadK = keyof TypedReadDatabaseClient<typeof Movies>;
type WriteK = keyof TypedWriteDatabaseClient<typeof Movies>;
type RW = TypedReadWriteDatabaseClient<typeof Movies>;

type _readNoTx = Expect<Equal<"transact" extends ReadK ? true : false, false>>;
type _writeHasTx = Expect<Equal<"transact" extends WriteK ? true : false, true>>;
type _writeNoQ = Expect<
  Equal<"q" extends WriteK ? true : false, false>
>;
type _rwHasBoth = Expect<
  Equal<
    "transact" extends keyof RW
      ? "q" extends keyof RW
        ? true
        : false
      : false,
    true
  >
>;

const readOnly = unsafeReadDatabase(Movies);
const writeOnly = unsafeWriteDatabase(Movies);
void readOnly.q;
void writeOnly.transact;
// @ts-expect-error read client has no transact
readOnly.transact;
// @ts-expect-error write client has no q
writeOnly.q;

const writeTx = writeOnly.transact(function* (tx) {
  const e = yield* tx.entity();
  yield* e.add(User.name, "Ada");
});
type _writeTx = Expect<Equal<Effect.Success<typeof writeTx>, TxAck>>;

// ── callback errors / context union into transact ──────────────────────────

class ExtraLoad extends Data.TaggedError("ExtraLoad")<{}> {}

const withExtra = db.transact(function* (tx) {
  const e = yield* tx.entity();
  yield* e.add(User.name, "Ada");
  return yield* Effect.fail(new ExtraLoad());
});
type _extraErr = Expect<
  Extends<ExtraLoad, Effect.Error<typeof withExtra>>
>;
type _stillDb = Expect<Extends<DatabaseError, Effect.Error<typeof withExtra>>>;

// ── builder types are catalog-generic ──────────────────────────────────────

type _handle = Expect<
  Extends<
    Effect.Success<ReturnType<TxBuilder<typeof Movies>["entity"]>>,
    EntityHandle<typeof Movies>
  >
>;

void 0 as unknown as [_crossNsAck, _viaEffect, _retractAck, _writeTx, _handle];
