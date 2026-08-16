/**
 * Catalog-generic System / Database clients.
 *
 * Same privilege split as the untyped client (Read / Write / ReadWrite),
 * same `asOf` / `history` / `minT` / tagged errors, plus a catalog
 * parameter. `create` / `connect` take the catalog, validate the name
 * (`BadRequest`), and type ensure-schema onto the error channel
 * (`SchemaEnsureError`).
 *
 * Methods that would hit a peer are proposal stubs (`Effect.die`). They
 * exist to be typed. Name validation on create/connect is real. The
 * untyped client in `../Client.ts` is unchanged.
 *
 * `makeReadWriteSystemClient` (and the read/write halves) have the same
 * `(source: SystemSource) => Client` shape the Binding / Http / Local
 * layers are already generic over, so a catalog-typed system client drops
 * in without a new layer family.
 */

import type { TxData } from "@ripple/core";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import type {
  DatabaseHealth,
  QueryOptions,
  QueryResponse,
  SystemSource,
  TxAck,
} from "../Client.ts";
import { systemSource, type SystemClientOptions } from "../Client.ts";
import { DATABASE_NAME_RE, invalidDatabaseName } from "../DatabaseName.ts";
import type { BadRequest, DatabaseError } from "../DatabaseTypes.ts";
import type { AnyCatalog } from "./Catalog.ts";
import { SchemaEnsureError } from "./Errors.ts";
import type { EntityRef } from "./idents.ts";
import { type QueryBuilder, queryBuilder } from "./Query.ts";
import type { EntityMap, PullPattern, PullResult } from "./Read.ts";
import type { TxBuilder, WireTx } from "./Tx.ts";

export type OpenError = BadRequest | SchemaEnsureError;

const die = <A, E = never, R = RuntimeContext>(
  what: string,
): Effect.Effect<A, E, R> => Effect.die(new Error(`ripple/schema: proposal stub — ${what} (no peer I/O)`));

/** Read half, generic on the catalog. No `transact`. */
export interface TypedReadDatabaseClient<C extends AnyCatalog = AnyCatalog> {
  readonly catalog: C;
  readonly name: string;

  /** Start a catalog-typed query builder. */
  q(): QueryBuilder<C, {}>;
  /**
   * Callback form: `yield* db.q(q => q.where(...).find(...))`.
   * The builder tracks bindings; `find` is the typed terminal.
   */
  q<A>(
    build: (
      q: QueryBuilder<C, {}>,
    ) => Effect.Effect<A, DatabaseError, RuntimeContext>,
  ): Effect.Effect<A, DatabaseError, RuntimeContext>;
  /** Untyped escape hatch — today's object / string query. */
  q<T = unknown>(
    query: string | object,
    inputs?: unknown[],
    options?: QueryOptions,
  ): Effect.Effect<T, DatabaseError, RuntimeContext>;

  query<T = unknown>(
    query: string | object,
    inputs?: unknown[],
    options?: QueryOptions,
  ): Effect.Effect<QueryResponse<T>, DatabaseError, RuntimeContext>;

  pull<const P extends PullPattern<C>>(
    eid: EntityRef<C>,
    pattern: P,
  ): Effect.Effect<PullResult<C, P> | null, DatabaseError, RuntimeContext>;

  entity(
    eid: number,
  ): Effect.Effect<EntityMap<C> | undefined, DatabaseError, RuntimeContext>;

  info(): Effect.Effect<Record<string, unknown>, DatabaseError, RuntimeContext>;
  health(): Effect.Effect<DatabaseHealth, DatabaseError, RuntimeContext>;

  asOf(t: number): TypedReadDatabaseClient<C>;
  history(): TypedReadDatabaseClient<C>;
}

/** Write half. */
export interface TypedWriteDatabaseClient<C extends AnyCatalog = AnyCatalog> {
  readonly catalog: C;
  readonly name: string;

  /**
   * Catalog-typed transaction builder. An entity is a bag — attrs from
   * any namespace go on the same handle. The callback is what `yield*`s;
   * this returns `TxAck` plus whatever error / context the callback adds.
   *
   * ```ts
   * yield* db.transact((tx) =>
   *   Effect.gen(function* () {
   *     const ada = yield* tx.entity()
   *     yield* ada.add(User.name, "Ada")
   *     yield* ada.add(Meta.source, "import")
   *   }),
   * )
   * ```
   */
  transact<E = never, R = never>(
    build: (tx: TxBuilder<C>) => Effect.Effect<unknown, E, R>,
  ): Effect.Effect<TxAck, DatabaseError | E, RuntimeContext | R>;

  /** Keyword-soup maps (`{ ":user/name": "Ada" }`), still catalog-checked. */
  transactWire(
    tx: WireTx<C>,
  ): Effect.Effect<TxAck, DatabaseError, RuntimeContext>;

  /** Today's untyped escape hatch. */
  transactUntyped(
    tx: TxData,
  ): Effect.Effect<TxAck, DatabaseError, RuntimeContext>;
}

export interface TypedReadWriteDatabaseClient<C extends AnyCatalog = AnyCatalog>
  extends TypedReadDatabaseClient<C>,
    TypedWriteDatabaseClient<C> {}

export interface TypedReadSystemClient {
  create<C extends AnyCatalog>(
    name: string,
    catalog: C,
  ): Effect.Effect<TypedReadDatabaseClient<C>, OpenError, RuntimeContext>;
  connect<C extends AnyCatalog>(
    name: string,
    catalog: C,
  ): Effect.Effect<TypedReadDatabaseClient<C>, OpenError, RuntimeContext>;
  health(): Effect.Effect<DatabaseHealth, DatabaseError, RuntimeContext>;
}

export interface TypedWriteSystemClient {
  create<C extends AnyCatalog>(
    name: string,
    catalog: C,
  ): Effect.Effect<TypedWriteDatabaseClient<C>, OpenError, RuntimeContext>;
  connect<C extends AnyCatalog>(
    name: string,
    catalog: C,
  ): Effect.Effect<TypedWriteDatabaseClient<C>, OpenError, RuntimeContext>;
  health(): Effect.Effect<DatabaseHealth, DatabaseError, RuntimeContext>;
}

export interface TypedReadWriteSystemClient {
  create<C extends AnyCatalog>(
    name: string,
    catalog: C,
  ): Effect.Effect<TypedReadWriteDatabaseClient<C>, OpenError, RuntimeContext>;
  connect<C extends AnyCatalog>(
    name: string,
    catalog: C,
  ): Effect.Effect<TypedReadWriteDatabaseClient<C>, OpenError, RuntimeContext>;
  health(): Effect.Effect<DatabaseHealth, DatabaseError, RuntimeContext>;
}

const makeRead = <C extends AnyCatalog>(
  catalog: C,
  name: string,
): TypedReadDatabaseClient<C> => ({
  catalog,
  name,
  q: ((
    queryOrBuild?:
      | string
      | object
      | ((
          q: QueryBuilder<C, {}>,
        ) => Effect.Effect<unknown, DatabaseError, RuntimeContext>),
    _inputs?: unknown[],
    _options?: QueryOptions,
  ) => {
    if (queryOrBuild === undefined) return queryBuilder(catalog);
    if (typeof queryOrBuild === "function") {
      return queryOrBuild(queryBuilder(catalog));
    }
    return die("q");
  }) as TypedReadDatabaseClient<C>["q"],
  query: () => die("query"),
  pull: () => die("pull"),
  entity: () => die("entity"),
  info: () => die("info"),
  health: () => die("health"),
  asOf: () => makeRead(catalog, name),
  history: () => makeRead(catalog, name),
});

const makeWrite = <C extends AnyCatalog>(
  catalog: C,
  name: string,
): TypedWriteDatabaseClient<C> => ({
  catalog,
  name,
  transact: ((_build: (tx: TxBuilder<C>) => Effect.Effect<unknown, unknown, unknown>) =>
    die("transact")) as TypedWriteDatabaseClient<C>["transact"],
  transactWire: () => die("transactWire"),
  transactUntyped: () => die("transactUntyped"),
});

const makeReadWrite = <C extends AnyCatalog>(
  catalog: C,
  name: string,
): TypedReadWriteDatabaseClient<C> => ({
  ...makeRead(catalog, name),
  ...makeWrite(catalog, name),
});

const openRead = <C extends AnyCatalog>(
  name: string,
  catalog: C,
): Effect.Effect<TypedReadDatabaseClient<C>, OpenError, RuntimeContext> =>
  DATABASE_NAME_RE.test(name)
    ? Effect.succeed(makeRead(catalog, name))
    : Effect.fail(invalidDatabaseName(name));

const openWrite = <C extends AnyCatalog>(
  name: string,
  catalog: C,
): Effect.Effect<TypedWriteDatabaseClient<C>, OpenError, RuntimeContext> =>
  DATABASE_NAME_RE.test(name)
    ? Effect.succeed(makeWrite(catalog, name))
    : Effect.fail(invalidDatabaseName(name));

const openReadWrite = <C extends AnyCatalog>(
  name: string,
  catalog: C,
): Effect.Effect<TypedReadWriteDatabaseClient<C>, OpenError, RuntimeContext> =>
  DATABASE_NAME_RE.test(name)
    ? Effect.succeed(makeReadWrite(catalog, name))
    : Effect.fail(invalidDatabaseName(name));

/** Build the read half of the typed system client. */
export const makeReadSystemClient = (
  _source: SystemSource,
): TypedReadSystemClient => ({
  create: openRead,
  connect: openRead,
  health: () => die("health"),
});

/** Build the write half of the typed system client. */
export const makeWriteSystemClient = (
  _source: SystemSource,
): TypedWriteSystemClient => ({
  create: openWrite,
  connect: openWrite,
  health: () => die("health"),
});

/** Build the read-write typed system client. */
export const makeReadWriteSystemClient = (
  _source: SystemSource,
): TypedReadWriteSystemClient => ({
  create: openReadWrite,
  connect: openReadWrite,
  health: () => die("health"),
});

/**
 * A typed system client over concrete values (no Alchemy Outputs).
 * Same idea as `Client.makeSystem`.
 */
export const makeSystem = (
  options: SystemClientOptions,
): TypedReadWriteSystemClient =>
  makeReadWriteSystemClient(systemSource(options));

/** @internal used by type fixtures that need a client without opening one. */
export const unsafeDatabase = <C extends AnyCatalog>(
  catalog: C,
  name = "db",
): TypedReadWriteDatabaseClient<C> => makeReadWrite(catalog, name);

export const unsafeReadDatabase = <C extends AnyCatalog>(
  catalog: C,
  name = "db",
): TypedReadDatabaseClient<C> => makeRead(catalog, name);

export const unsafeWriteDatabase = <C extends AnyCatalog>(
  catalog: C,
  name = "db",
): TypedWriteDatabaseClient<C> => makeWrite(catalog, name);

