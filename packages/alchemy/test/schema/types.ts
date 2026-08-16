/**
 * Compile-time fixtures for the Effect-native schema catalog.
 *
 * `bun run typecheck` compiles this file. A mismatch turns `Expect<Equal<…>>`
 * into a type error, or leaves a `@ts-expect-error` unused. Deliberately
 * breaking one assertion must fail tsc.
 */

import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type {
  ReadSystemClient,
  ReadWriteSystemClient,
  TxAck,
  WriteSystemClient,
} from "../../src/Client.ts";
import { BadRequest } from "../../src/DatabaseTypes.ts";
import {
  Attr,
  type CatalogIdent,
  Catalog,
  type Equal,
  type Expect,
  type Extends,
  Namespace,
  type OpenError,
  SchemaEnsureError,
  type TypedReadDatabaseClient,
  type TypedReadSystemClient,
  type TypedReadWriteDatabaseClient,
  type TypedReadWriteSystemClient,
  type TypedWriteSystemClient,
  type ValueAtIdent,
  type WireEntity,
  Long,
  Ref,
  Uuid,
  UuidString,
  Instant,
  Bytes,
  Eid,
  fromRead,
  fromReadWrite,
  fromWrite,
  makeSystem,
  unsafeDatabase,
} from "../../src/schema/index.ts";

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

// ── create / connect return a client generic on that catalog ───────────────

const system = makeSystem({ url: "https://peer.example" });
const created = system.create("movies", Movies);
const connected = system.connect("movies", Movies);

// Alchemy bindings return the untyped system; wrap to get create(name, catalog).
declare const untypedRead: ReadSystemClient;
declare const untypedWrite: WriteSystemClient;
declare const untypedRW: ReadWriteSystemClient;
const typedR = fromRead(untypedRead);
const typedW = fromWrite(untypedWrite);
const typedRW = fromReadWrite(untypedRW);
type _fromR = Expect<Equal<typeof typedR, TypedReadSystemClient>>;
type _fromW = Expect<Equal<typeof typedW, TypedWriteSystemClient>>;
type _fromRW = Expect<Equal<typeof typedRW, TypedReadWriteSystemClient>>;
const wrapCreated = typedRW.create("movies", Movies);
const wrapRead = typedR.create("movies", Movies);
type _wrapClient = Expect<
  Equal<Effect.Success<typeof wrapCreated>, TypedReadWriteDatabaseClient<typeof Movies>>
>;
type _wrapErr = Expect<
  Equal<Effect.Error<typeof wrapCreated>, BadRequest | SchemaEnsureError>
>;
type _wrapReadErr = Expect<Equal<Effect.Error<typeof wrapRead>, BadRequest>>;

type CreatedClient = Effect.Success<typeof created>;
type ConnectedClient = Effect.Success<typeof connected>;

type _createClient = Expect<
  Equal<CreatedClient, TypedReadWriteDatabaseClient<typeof Movies>>
>;
type _connectClient = Expect<
  Equal<ConnectedClient, TypedReadWriteDatabaseClient<typeof Movies>>
>;
type _createCatalog = Expect<
  Equal<CreatedClient["catalog"], typeof Movies>
>;

// A different catalog is a different client type.
const Other = Catalog({
  tag: Namespace("tag", { label: Attr(Schema.String) }),
});
type OtherClient = Effect.Success<ReturnType<typeof system.create<typeof Other>>>;
type _notSame = Expect<
  Equal<Equal<CreatedClient, OtherClient>, false>
>;

// ── transact builder is the typed write path ───────────────────────────────

const db = unsafeDatabase(Movies);

const _validTx = db.transact(function* (tx) {
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
void _validTx;

const _validWire: WireEntity<typeof Movies> = {
  ":db/id": "ada",
  ":user/name": "Ada",
  ":user/friends": [1001, 1002],
  ":meta/source": "import",
};

void db.transactWire([_validWire]);
void db.transactUntyped([{ ":user/name": "Ada" }]);

// ── wire form still rejects unknown / wrong types ───────────────────────────

// @ts-expect-error unknown wire ident
db.transactWire([{ ":user/nope": "x" }]);

// @ts-expect-error wire name is string, not number
db.transactWire([{ ":user/name": 42 }]);

// ── eid wrapper / pull infer attr value types ──────────────────────────────

const eid = Eid.of(Movies, 1001);
type _eidWrap = Expect<Equal<typeof eid, Eid<typeof Movies>>>;

// literate pull is the happy path — see pull-types.ts for the full matrix.

// ── asOf / history preserve the catalog parameter ──────────────────────────

const asOf = db.asOf(3);
const hist = db.history();
type _asOf = Expect<Equal<typeof asOf, TypedReadDatabaseClient<typeof Movies>>>;
type _hist = Expect<Equal<typeof hist, TypedReadDatabaseClient<typeof Movies>>>;
type _asOfCatalog = Expect<Equal<(typeof asOf)["catalog"], typeof Movies>>;
type _asOfNoWrite = Expect<
  Equal<"transact" extends keyof typeof asOf ? true : false, false>
>;

// Read vs Write vs ReadWrite key separation — see tx-types.ts.

// ── tagged errors remain on the Effect (catchTags still typechecks) ────────

const caught = db
  .transact(function* (tx) {
    const e = yield* tx.entity();
    yield* e.add(User.name, "Ada");
  })
  .pipe(
    Effect.catchTags({
      TxRejected: (e) => Effect.succeed(e.code),
      TransactorDead: (e) => Effect.succeed(e.message),
      BadRequest: (e) => Effect.succeed(e.message),
      NotFound: (e) => Effect.succeed(e.message),
      Unauthorized: (e) => Effect.succeed(e.message),
      QueryBudgetExceeded: (e) => Effect.succeed(e.clause),
      Internal: (e) => Effect.succeed(e.message),
      NetworkError: (e) => Effect.succeed(e.message),
      MissingPeer: (e) => Effect.succeed(e.message),
    }),
  );
type CaughtSuccess = Effect.Success<typeof caught>;
type _caught = Expect<Equal<CaughtSuccess, TxAck | string>>;
type _caughtErr = Expect<Equal<Effect.Error<typeof caught>, never>>;

// ── ensure-schema failure is on create / connect's error channel ───────────

type CreateErr = Effect.Error<typeof created>;
type ConnectErr = Effect.Error<typeof connected>;
type _openErr = Expect<Equal<CreateErr, OpenError>>;
type _openHasEnsure = Expect<Extends<SchemaEnsureError, CreateErr>>;
type _openHasBad = Expect<Extends<BadRequest, CreateErr>>;
type _connectHasEnsure = Expect<Extends<SchemaEnsureError, ConnectErr>>;
type _openIsEnsureOrBad = Expect<
  Equal<CreateErr, BadRequest | SchemaEnsureError>
>;

const opened = system.create("movies", Movies).pipe(
  Effect.catchTags({
    BadRequest: (e) => Effect.succeed(e.message),
    SchemaEnsureError: (e) => Effect.succeed(e.message),
  }),
);
type _openedOk = Expect<
  Equal<
    Effect.Success<typeof opened>,
    TypedReadWriteDatabaseClient<typeof Movies> | string
  >
>;
type _openedErr = Expect<Equal<Effect.Error<typeof opened>, never>>;

// create still requires RuntimeContext (ensure is a schema tx).
type _createR = Expect<
  Extends<RuntimeContext, Effect.Services<typeof created>>
>;
