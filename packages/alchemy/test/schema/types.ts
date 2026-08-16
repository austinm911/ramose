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
import type { TxAck } from "../../src/Client.ts";
import { BadRequest, type DatabaseError } from "../../src/DatabaseTypes.ts";
import {
  type AnyCatalog,
  attr,
  type CatalogIdent,
  Catalog,
  type EntityMap,
  type Equal,
  type Expect,
  type Extends,
  type NestedEntity,
  Namespace,
  type OpenError,
  SchemaEnsureError,
  type TypedReadDatabaseClient,
  type TypedReadWriteDatabaseClient,
  type TypedTx,
  type TypedWriteDatabaseClient,
  type ValueAtIdent,
  type WireEntity,
  Long,
  Ref,
  makeSystem,
  optional,
  Struct,
  unsafeDatabase,
  unsafeReadDatabase,
  unsafeWriteDatabase,
} from "../../src/schema/index.ts";

// ── fixture catalog ────────────────────────────────────────────────────────

const User = Namespace("user", {
  name: attr(Schema.String, { unique: "identity" }),
  age: attr(Long, { valueType: ":db.type/long" }),
  friends: attr(Ref, { cardinality: "many", valueType: ":db.type/ref" }),
});

const Movie = Namespace("movie", {
  title: attr(Schema.String, { index: true }),
  year: attr(Long, { valueType: ":db.type/long" }),
});

const Meta = Namespace("meta", {
  source: attr(Schema.String),
});

const Movies = Catalog({ user: User, movie: Movie, meta: Meta });

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
    ":user/name" | ":user/age" | ":user/friends" | ":movie/title" | ":movie/year" | ":meta/source"
  >
>;
type _valueName = Expect<Equal<ValueAtIdent<typeof Movies, ":user/name">, string>>;
type _valueFriends = Expect<
  Equal<ValueAtIdent<typeof Movies, ":user/friends">, number>
>;

// ── create / connect return a client generic on that catalog ───────────────

const system = makeSystem({ url: "https://peer.example" });
const created = system.create("movies", Movies);
const connected = system.connect("movies", Movies);

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
  tag: Namespace("tag", { label: attr(Schema.String) }),
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

// secondary: nested / list-form types still exist (not the transact happy path)
const _validNested: TypedTx<typeof Movies> = [
  { user: { name: "Ada", age: 36 }, meta: { source: "import" } },
  { movie: { title: "Arrival", year: 2016 } },
  { ":db/id": "ada", user: { name: "Ada" } },
  [":db/add", "ada", ":user/name", "Ada"],
  [":db/retract", 1001, ":user/age", 36],
  [":db/retractEntity", 1001],
];
void _validNested;

const _validWire: WireEntity<typeof Movies> = {
  ":db/id": "ada",
  ":user/name": "Ada",
  ":user/friends": [1001, 1002],
  ":meta/source": "import",
};

void db.transactWire([_validWire]);
void db.transactUntyped([{ ":user/name": "Ada" }]);

// ── wire / nested secondary forms still reject unknown / wrong types ───────

// @ts-expect-error unknown nested attribute
const _badNestedAttr: NestedEntity<typeof Movies> = { user: { nope: "x" } };
void _badNestedAttr;

// @ts-expect-error unknown namespace
const _badNestedNs: NestedEntity<typeof Movies> = { studio: { name: "A24" } };
void _badNestedNs;

// @ts-expect-error unknown wire ident
db.transactWire([{ ":user/nope": "x" }]);

// @ts-expect-error name is string, not number
const _badNestedVal: NestedEntity<typeof Movies> = { user: { name: 42 } };
void _badNestedVal;

// @ts-expect-error wire name is string, not number
db.transactWire([{ ":user/name": 42 }]);

// ── entity / pull infer attr value types ───────────────────────────────────

type Ada = EntityMap<typeof Movies>;
type _eid = Expect<Equal<Ada[":db/id"], number>>;
type _adaName = Expect<Equal<Ada[":user/name"], string | undefined>>;
type _adaAge = Expect<Equal<Ada[":user/age"], number | undefined>>;
type _adaFriends = Expect<Equal<Ada[":user/friends"], readonly number[] | undefined>>;
type _adaTitle = Expect<Equal<Ada[":movie/title"], string | undefined>>;

const entityFx = db.entity(1001);
type EntitySuccess = Effect.Success<typeof entityFx>;
type _entity = Expect<Equal<EntitySuccess, Ada | undefined>>;

// Struct pull is the happy path — see pull-types.ts for the full matrix.
const pullFx = db.pull(1001, Struct({ name: User.name, age: optional(User.age) }));
type PullSuccess = Effect.Success<typeof pullFx>;
type _pullName = Expect<Equal<NonNullable<PullSuccess>["name"], string>>;
type _pullAge = Expect<
  Equal<NonNullable<PullSuccess>["age"], number | undefined>
>;
type _pullNoIdent = Expect<
  Equal<":user/name" extends keyof NonNullable<PullSuccess> ? true : false, false>
>;

// keyword-soup pull remains (idents, still catalog-checked, all optional)
const pullSoup = db.pull(1001, [":user/name", ":user/age"] as const);
type _soupName = Expect<
  Equal<NonNullable<Effect.Success<typeof pullSoup>>[":user/name"], string | undefined>
>;
type _soupAge = Expect<
  Equal<NonNullable<Effect.Success<typeof pullSoup>>[":user/age"], number | undefined>
>;

// bag: Movie.title on a user eid is legal (Struct keys are the rename)
const pullBag = db.pull(1001, Struct({ name: User.name, title: Movie.title }));
type _bagTitle = Expect<
  Equal<NonNullable<Effect.Success<typeof pullBag>>["title"], string>
>;

// @ts-expect-error unknown attr on the namespace
db.pull(1001, [User.nope]);
// @ts-expect-error ident not in the catalog
db.pull(1001, [":user/nope"]);

// ── asOf / history preserve the catalog parameter ──────────────────────────

const asOf = db.asOf(3);
const hist = db.history();
type _asOf = Expect<Equal<typeof asOf, TypedReadDatabaseClient<typeof Movies>>>;
type _hist = Expect<Equal<typeof hist, TypedReadDatabaseClient<typeof Movies>>>;
type _asOfCatalog = Expect<Equal<(typeof asOf)["catalog"], typeof Movies>>;
type _asOfNoWrite = Expect<
  Equal<"transact" extends keyof typeof asOf ? true : false, false>
>;

// ── Read vs Write vs ReadWrite still distinguishes transact ────────────────

type ReadK = keyof TypedReadDatabaseClient<typeof Movies>;
type WriteK = keyof TypedWriteDatabaseClient<typeof Movies>;
type RW = TypedReadWriteDatabaseClient<typeof Movies>;

type _readNoTx = Expect<Equal<"transact" extends ReadK ? true : false, false>>;
type _writeHasTx = Expect<Equal<"transact" extends WriteK ? true : false, true>>;
type _writeNoEntity = Expect<Equal<"entity" extends WriteK ? true : false, false>>;
type _rwHasBoth = Expect<
  Equal<
    "transact" extends keyof RW ? ("entity" extends keyof RW ? true : false) : false,
    true
  >
>;

const readOnly = unsafeReadDatabase(Movies);
const writeOnly = unsafeWriteDatabase(Movies);
void readOnly.entity;
void writeOnly.transact;
// @ts-expect-error read client has no transact
readOnly.transact;
// @ts-expect-error write client has no entity
writeOnly.entity;

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

// ── nested entity shape ────────────────────────────────────────────────────

type Nested = NestedEntity<typeof Movies>;
const _nestedOk: Nested = { user: { name: "Ada" }, movie: { title: "Dune" } };
void _nestedOk;

// cardinality-many in the nested form is an array of refs
const _manyOk: Nested = { user: { friends: [1001, 1002] } };
void _manyOk;

// keep AnyCatalog / DatabaseError referenced so unused-import never fires
type _hold = [AnyCatalog, DatabaseError];
void 0 as unknown as _hold;
