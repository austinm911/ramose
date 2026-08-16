/**
 * The Effect-native Ripple client.
 *
 * One implementation, three ways to get at it: a Worker service binding
 * (`*DatabaseBinding`), plain HTTPS (`*DatabaseHttp`), or an Action / script
 * (`*DatabaseLocal`). They differ only in how the {@link DatabaseSource} —
 * where to send, under what name, with which token — is obtained; the request
 * shapes, the JSON transport and the error classification are shared.
 *
 * The wire format is exactly the peer Worker's HTTP API
 * (packages/worker/src/index.ts), and the body transport is
 * `toJson`/`fromJson` from `@ripple/core`, so instants (`Date`), byte arrays
 * and uuids survive the round trip — same as `@ripple/client`.
 */

import { fromJson, toJson } from "@ripple/core";
import type { TxData } from "@ripple/core";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { DATABASE_NAME_RE, invalidDatabaseName } from "./DatabaseName.ts";
import {
  type BadRequest,
  type DatabaseError,
  fromResponse,
  NetworkError,
} from "./DatabaseTypes.ts";

/** Where a client sends, as what, with which credential. Resolved per call. */
export interface DatabaseEndpoint {
  /** Peer base URL, no trailing slash (e.g. `https://ripple.example.workers.dev`). */
  readonly url: string;
  /** Ripple database name — the `:name` in `/db/:name`. */
  readonly name: string;
  /** Bearer token; ignored when the peer runs with `RIPPLE_TOKENS` unset. */
  readonly token?: Redacted.Redacted<string> | string | undefined;
  /** Extra headers on every request (e.g. `x-ripple-replica-hint`). */
  readonly headers?: Record<string, string> | undefined;
}

/** The `fetch` seam. A service binding supplies `env[…].fetch`; everything else the global. */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string | undefined;
  },
) => Promise<Response>;

/**
 * Everything the client builders need. `endpoint` is an Effect so Alchemy
 * Outputs resolve lazily, per call — which is where the `RuntimeContext`
 * requirement on every client method comes from (see `DatabaseRuntime.ts`).
 */
export interface DatabaseSource {
  readonly endpoint: Effect.Effect<DatabaseEndpoint, never, RuntimeContext>;
  readonly fetch: FetchLike;
}

/** Response meta carried by the `x-ripple-*` headers. */
export interface QueryMeta {
  readonly ms: number | null;
  readonly r2Gets: number | null;
  readonly cacheHits: number | null;
  readonly colo?: string | undefined;
  readonly replicaHint?: string | undefined;
  readonly basisT: number | null;
  readonly basisHit: boolean;
  readonly basisReason?: string | undefined;
  readonly basisBehind: boolean;
}

export interface TxAck {
  readonly t: number;
  readonly txEid: number;
  readonly tempids: Record<string, number>;
  readonly datoms: number;
}

export interface QueryResponse<T = unknown> {
  readonly t: number;
  readonly root: number;
  readonly result: T;
  readonly explain?: unknown[];
  readonly meta: QueryMeta;
}

export interface QueryOptions {
  /** Ask the planner for its clause-by-clause plan. */
  readonly explain?: boolean;
  /**
   * Read fence: the server refetches its basis when the cached one is older
   * than `t` (pass the `t` of your last transact for read-your-writes).
   */
  readonly minT?: number;
}

export interface DatabaseHealth {
  readonly ok: boolean;
  readonly service: string;
  readonly stage: string;
  readonly time: number;
}

/** Read half: queries, pulls, entities, info, and the `asOf` / `history` views. */
export interface ReadDatabaseClient {
  /** Run a datalog query and return just the result relation. */
  q<T = unknown>(
    query: string | object,
    inputs?: unknown[],
    options?: QueryOptions,
  ): Effect.Effect<T, DatabaseError, RuntimeContext>;
  /** Run a datalog query and keep `t` / `root` / `explain` / the `x-ripple-*` meta. */
  query<T = unknown>(
    query: string | object,
    inputs?: unknown[],
    options?: QueryOptions,
  ): Effect.Effect<QueryResponse<T>, DatabaseError, RuntimeContext>;
  /** Pull a pattern from one entity (eid, lookup ref, or ident). */
  pull<T = Record<string, unknown> | null>(
    eid: number | string | [string, unknown],
    pattern: string | unknown[],
  ): Effect.Effect<T, DatabaseError, RuntimeContext>;
  /** The whole entity map, or `undefined` when it has no datoms. */
  entity(
    eid: number,
  ): Effect.Effect<
    Record<string, unknown> | undefined,
    DatabaseError,
    RuntimeContext
  >;
  /** Transactor + replica + peer stats for this database. */
  info(): Effect.Effect<Record<string, unknown>, DatabaseError, RuntimeContext>;
  /** Peer liveness (`GET /health`), not database-scoped. */
  health(): Effect.Effect<DatabaseHealth, DatabaseError, RuntimeContext>;
  /** Read-only view as of transaction `t`. */
  asOf(t: number): ReadDatabaseClient;
  /** History view — asserts *and* retracts, with tx and op. */
  history(): ReadDatabaseClient;
  /**
   * The same peer, fetch, token and headers, against Ripple database `name`
   * (db-per-tenant). Invalid names fail every request with `BadRequest`.
   */
  for(name: string): ReadDatabaseClient;
}

/** Write half. */
export interface WriteDatabaseClient {
  /** Submit a transaction; resolves once it is committed and durable. */
  transact(tx: TxData): Effect.Effect<TxAck, DatabaseError, RuntimeContext>;
  /**
   * The same peer, fetch, token and headers, against Ripple database `name`
   * (db-per-tenant). Invalid names fail every request with `BadRequest`.
   */
  for(name: string): WriteDatabaseClient;
}

export interface ReadWriteDatabaseClient
  extends ReadDatabaseClient,
    WriteDatabaseClient {
  /**
   * The same peer, fetch, token and headers, against Ripple database `name`
   * (db-per-tenant). Invalid names fail every request with `BadRequest`.
   */
  for(name: string): ReadWriteDatabaseClient;
}

/** The `asOf` / `history` coordinates a read view carries. */
interface View {
  readonly asOf?: number | undefined;
  readonly history?: boolean | undefined;
}

/**
 * What a built client actually holds: the source, plus — when `for` was handed
 * a name the peer would reject — the failure every request answers with
 * instead of going near the network. `for` never throws, so the bad name has
 * to be carried until someone runs an Effect.
 */
interface Target {
  readonly source: DatabaseSource;
  readonly invalid?: BadRequest | undefined;
}

/**
 * Re-point a target at another Ripple database. Everything but
 * `endpoint.name` — url, token, headers, and the `fetch` function object
 * itself — is reused by reference; only the resolved endpoint is rewritten,
 * so an Alchemy Output still resolves lazily, per call.
 *
 * A name the peer would reject does not throw and does not silently fall back
 * to the old database: it poisons the returned client, whose every method
 * (`health` included, so there is one rule to remember) fails with
 * `BadRequest`. An already-poisoned target stays poisoned by its first bad
 * name.
 */
const forName = (target: Target, name: string): Target =>
  DATABASE_NAME_RE.test(name)
    ? {
        source: {
          endpoint: target.source.endpoint.pipe(
            Effect.map((endpoint) => ({ ...endpoint, name })),
          ),
          fetch: target.source.fetch,
        },
        invalid: target.invalid,
      }
    : {
        source: target.source,
        invalid: target.invalid ?? invalidDatabaseName(name),
      };

const number = (s: string | null): number | null =>
  s === null ? null : Number(s);

const metaOf = (headers: { get(name: string): string | null }): QueryMeta => ({
  ms: number(headers.get("x-ripple-ms")),
  r2Gets: number(headers.get("x-ripple-r2-gets")),
  cacheHits: number(headers.get("x-ripple-cache-hits")),
  colo: headers.get("x-ripple-colo") ?? undefined,
  replicaHint: headers.get("x-ripple-replica-hint") ?? undefined,
  basisT: number(headers.get("x-ripple-basis-t")),
  basisHit: headers.get("x-ripple-basis-hit") === "1",
  basisReason: headers.get("x-ripple-basis-reason") ?? undefined,
  basisBehind: headers.get("x-ripple-basis-behind") === "1",
});

/** Drop `undefined` fields — JSON would otherwise send them as `null`. */
const compact = (o: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
};

const bearer = (
  token: Redacted.Redacted<string> | string | undefined,
): string | undefined => {
  if (token === undefined) return undefined;
  const value = typeof token === "string" ? token : Redacted.value(token);
  return value.length > 0 ? value : undefined;
};

interface RawResult {
  readonly body: unknown;
  readonly headers: { get(name: string): string | null };
}

/** One request: JSON in, `fromJson` out, non-2xx classified into a tagged failure. */
const send = (
  target: Target,
  method: string,
  path: (name: string) => string,
  body?: unknown,
  extra?: Record<string, string>,
): Effect.Effect<RawResult, DatabaseError, RuntimeContext> =>
  Effect.gen(function* () {
    if (target.invalid !== undefined) return yield* Effect.fail(target.invalid);
    const source = target.source;
    const endpoint = yield* source.endpoint;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...(endpoint.headers ?? {}),
      ...(extra ?? {}),
    };
    const token = bearer(endpoint.token);
    if (token !== undefined) headers.authorization = `Bearer ${token}`;

    const response = yield* Effect.tryPromise({
      try: () =>
        source.fetch(endpoint.url + path(endpoint.name), {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(toJson(body)),
        }),
      catch: (cause) =>
        new NetworkError({
          message: `ripple: ${method} ${path(endpoint.name)} failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          cause,
        }),
    });

    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) =>
        new NetworkError({
          message: "ripple: response body could not be read",
          cause,
        }),
    });

    let parsed: unknown;
    try {
      parsed = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      parsed = { error: text };
    }

    if (!response.ok) {
      return yield* Effect.fail(
        fromResponse(response.status, parsed, response.headers),
      );
    }
    return { body: fromJson(parsed), headers: response.headers };
  });

const dbPath =
  (suffix: string) =>
  (name: string): string =>
    `/db/${encodeURIComponent(name)}${suffix}`;

const record = (value: unknown): Record<string, unknown> =>
  (typeof value === "object" && value !== null
    ? value
    : {}) as Record<string, unknown>;

const makeRead = (target: Target, view: View): ReadDatabaseClient => {
  const query = <T = unknown>(
    q: string | object,
    inputs: unknown[] = [],
    options: QueryOptions = {},
  ): Effect.Effect<QueryResponse<T>, DatabaseError, RuntimeContext> =>
    send(
      target,
      "POST",
      dbPath("/query"),
      compact({
        query: q,
        inputs,
        asOf: view.asOf,
        history: view.history === true ? true : undefined,
        explain: options.explain,
      }),
      options.minT === undefined
        ? undefined
        : { "x-ripple-min-t": String(options.minT) },
    ).pipe(
      Effect.map(({ body, headers }) => {
        const r = record(body);
        return {
          t: r.t as number,
          root: r.root as number,
          result: r.result as T,
          explain: r.explain as unknown[] | undefined,
          meta: metaOf(headers),
        };
      }),
    );

  return {
    query,
    q: <T = unknown>(
      q: string | object,
      inputs: unknown[] = [],
      options: QueryOptions = {},
    ) => query<T>(q, inputs, options).pipe(Effect.map((r) => r.result)),
    pull: <T = Record<string, unknown> | null>(
      eid: number | string | [string, unknown],
      pattern: string | unknown[],
    ) =>
      send(
        target,
        "POST",
        dbPath("/pull"),
        compact({
          eid,
          pattern,
          asOf: view.asOf,
          history: view.history === true ? true : undefined,
        }),
      ).pipe(Effect.map(({ body }) => record(body).result as T)),
    entity: (eid: number) =>
      send(
        target,
        "GET",
        dbPath(
          `/entity/${eid}${view.asOf === undefined ? "" : `?asOf=${view.asOf}`}`,
        ),
      ).pipe(
        Effect.map(({ body }) => {
          const entity = record(body).entity;
          return entity === null || entity === undefined
            ? undefined
            : (entity as Record<string, unknown>);
        }),
      ),
    info: () =>
      send(target, "GET", dbPath("/info")).pipe(
        Effect.map(({ body }) => record(body)),
      ),
    health: () =>
      send(target, "GET", () => "/health").pipe(
        Effect.map(({ body }) => record(body) as unknown as DatabaseHealth),
      ),
    asOf: (t: number) => makeRead(target, { ...view, asOf: t }),
    history: () => makeRead(target, { ...view, history: true }),
    // `for` keeps the view, so `db.for(n).asOf(t)` and `db.asOf(t).for(n)`
    // are the same request.
    for: (name: string) => makeRead(forName(target, name), view),
  };
};

const makeWrite = (target: Target): WriteDatabaseClient => ({
  transact: (tx: TxData) =>
    send(target, "POST", dbPath("/transact"), { tx }).pipe(
      Effect.map(({ body }) => record(body) as unknown as TxAck),
    ),
  for: (name: string) => makeWrite(forName(target, name)),
});

const makeReadWrite = (target: Target): ReadWriteDatabaseClient => ({
  ...makeRead(target, {}),
  ...makeWrite(target),
  // Spreading the two halves would leave the write half's `for` (transact and
  // nothing else) in place; the read-write client re-points both.
  for: (name: string) => makeReadWrite(forName(target, name)),
});

/** Build the read half of the client. */
export const makeReadClient = (source: DatabaseSource): ReadDatabaseClient =>
  makeRead({ source }, {});

/** Build the write half of the client. */
export const makeWriteClient = (source: DatabaseSource): WriteDatabaseClient =>
  makeWrite({ source });

/** Build the read-write client from its two halves. */
export const makeReadWriteClient = (
  source: DatabaseSource,
): ReadWriteDatabaseClient => makeReadWrite({ source });

/** The ambient `fetch`, bound once. */
export const globalFetch: FetchLike = (url, init) =>
  fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
  });

export interface ClientOptions {
  /** Peer base URL (trailing slashes are trimmed). */
  readonly url: string;
  /** Ripple database name. */
  readonly name: string;
  readonly token?: Redacted.Redacted<string> | string | undefined;
  readonly headers?: Record<string, string> | undefined;
  /**
   * Injection seam — defaults to the ambient `fetch`.
   *
   * A Worker service binding fits straight through it, which keeps the request
   * on Cloudflare's internal network instead of the public internet:
   * `fetch: (url, init) => env.Movies.fetch(url, init)`. `url` is then only a
   * routing key for the peer, so any absolute base works.
   */
  readonly fetch?: FetchLike | undefined;
}

/** A {@link DatabaseSource} over concrete values (no Alchemy Outputs involved). */
export const source = (options: ClientOptions): DatabaseSource => ({
  endpoint: Effect.succeed({
    url: options.url.replace(/\/+$/, ""),
    name: options.name,
    token: options.token,
    headers: options.headers,
  }),
  fetch: options.fetch ?? globalFetch,
});

/**
 * The same Effect-native client, for code that is not running inside an
 * Alchemy stack — bun scripts, tests, a server outside Cloudflare.
 *
 * @example
 * ```typescript
 * const db = Ripple.Client.make({ url: "https://ripple.example.workers.dev", name: "movies" });
 * const rows = yield* db.q(`[:find ?n :where [?e :user/name ?n]]`);
 * ```
 *
 * `name` is only the default database. One client — one peer, one token, one
 * `fetch` — reaches all of them through `for`, which is how db-per-tenant is
 * meant to be done: a Worker passes its service binding in as the `fetch` and
 * picks the database per request.
 *
 * @example Db-per-tenant over a service binding
 * ```typescript
 * const peer = Ripple.Client.make({
 *   url: "https://peer",                       // routing key only
 *   name: "control",
 *   fetch: (url, init) => env.Movies.fetch(url, init),
 * });
 * const ack = yield* peer.for(tenantId).transact([{ ":user/name": "Ada" }]);
 * ```
 */
export const make = (options: ClientOptions): ReadWriteDatabaseClient =>
  makeReadWriteClient(source(options));
