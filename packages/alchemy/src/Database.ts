/**
 * `Ripple.Database` — a logical Ripple database living on a peer Worker.
 *
 * A Ripple database is not a cloud object you create with an API call: it is
 * a *name*. The peer Worker routes `/db/:name/*` to a Transactor Durable
 * Object (`idFromName(name)`) and to region-local QueryReplicas, and the log
 * and segments live under `db/<name>/…` in R2. The first transaction
 * materializes it.
 *
 * So this resource does what there is to do: it pins the name (stable across
 * deploys, replaced only when you rename it), resolves the peer's URL, and —
 * on a live deploy — proves the peer is actually up before anything downstream
 * binds to it.
 *
 * @resource
 * @product Ripple
 * @category Storage & Databases
 * @section Creating a Database
 * @example Declaring a database on the peer Worker
 * ```typescript
 * import * as Cloudflare from "alchemy/Cloudflare";
 * import * as Ripple from "@ripple/alchemy";
 *
 * export const Peer = Cloudflare.Worker("Worker", { main: "./src/index.ts" });
 * export const Movies = Ripple.Database("Movies", { peer: Peer, name: "movies" });
 * ```
 *
 * @section Using it from a Worker
 * @example Transact and query
 * ```typescript
 * const db = yield* Ripple.ReadWriteDatabase(Movies);
 * const ack = yield* db.transact([{ ":user/name": "Ada" }]);
 * const rows = yield* db.q({ find: ["?n"], where: [["?e", ":user/name", "?n"]] });
 * ```
 *
 * Provide `Ripple.ReadWriteDatabaseBinding` (a Worker service binding to the
 * peer) or `Ripple.ReadWriteDatabaseHttp` (plain HTTPS) in the Worker's
 * runtime layer, and `Ripple.ReadWriteDatabaseLocal` inside an
 * `Alchemy.Action`. Use `Ripple.ReadDatabase` / `Ripple.WriteDatabase` for
 * least-privilege read- or write-only access.
 */

import type { Worker } from "alchemy/Cloudflare/Workers";
import { isResolved } from "alchemy/Diff";
import type { Input } from "alchemy/Input";
import * as ProviderLayer from "alchemy/Local/ProviderLayer";
import { createPhysicalName } from "alchemy/PhysicalName";
import * as Provider from "alchemy/Provider";
import { isResourceOfType, Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import { BadRequest, NetworkError } from "./DatabaseTypes.ts";
import type { Providers } from "./Providers.ts";

export const isDatabase = (value: unknown): value is Database =>
  isResourceOfType(value, "Ripple.Database");

/**
 * The peer that serves this database: a `Cloudflare.Worker` (the resource, or
 * the Effect that declares it), an explicit `{ url }`, or a bare base URL.
 *
 * `workerName` is only needed by the `*DatabaseBinding` layers, which lower a
 * `service` binding onto the host Worker; the `*Http` / `*Local` layers work
 * from `url` alone.
 */
export type DatabasePeer =
  | Worker
  | {
      readonly url: string | undefined;
      readonly workerName?: string | undefined;
    }
  | string;

/** Deploy-time liveness probe of the peer (live provider only). */
export interface DatabaseProbe {
  /** Total attempts before failing the deploy. @default 5 */
  readonly attempts?: number;
  /** Delay between attempts. @default 500 */
  readonly delayMs?: number;
}

export type DatabaseProps = {
  /** The peer Worker (or a URL) that serves `/db/:name/*`. */
  peer: DatabasePeer;
  /**
   * The database name — the `:name` in `/db/:name`. Must match
   * `/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/`.
   *
   * @default ${stack}-${id}-${stage}-${instance}, lowercased
   */
  name?: string;
  /**
   * Bearer token for this database, when the peer is deployed with
   * `RIPPLE_TOKENS`. Stored as a `Redacted` attribute and lowered onto
   * consumers as a `secret_text` binding.
   */
  token?: Redacted.Redacted<string> | string;
  /** Liveness probe on deploy; `false` skips it. */
  probe?: DatabaseProbe | false;
};

export type Database = Resource<
  "Ripple.Database",
  DatabaseProps,
  {
    /** The database name (the `:name` in `/db/:name`). */
    name: string;
    /** Peer base URL, no trailing slash. */
    url: string;
    /** `${url}/db/${name}` — the prefix every route hangs off. */
    databaseUrl: string;
    /** The peer Worker's script name, or `""` when the peer was given as a URL. */
    peerName: string;
    /** The bearer token, when one was configured. */
    token: Redacted.Redacted<string> | undefined;
  },
  never,
  Providers
>;

export const Database = Resource<Database>("Ripple.Database");

/** A Ripple database name, as the peer Worker validates it (`validDbName`). */
export const DATABASE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/** Coerce a generated physical name into something `DATABASE_NAME_RE` accepts. */
export const sanitizeDatabaseName = (name: string): string =>
  name
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 64);

const resolveName = (id: string, name: string | undefined) =>
  Effect.gen(function* () {
    if (name !== undefined) return name;
    return sanitizeDatabaseName(
      yield* createPhysicalName({ id, lowercase: true, maxLength: 64 }),
    );
  });

/** `{ url, workerName }` out of whichever peer form was given. */
export const resolvePeer = (
  peer: DatabasePeer,
): { url: string | undefined; workerName: string } => {
  if (typeof peer === "string") return { url: peer, workerName: "" };
  // At reconcile the engine has replaced the Worker's attribute Outputs with
  // their values, which the `Worker` arm of the union still types as Outputs
  // (same cast Neon's Branch makes for `project.projectId`).
  const resolved = peer as unknown as {
    url?: string | undefined;
    workerName?: string | undefined;
  };
  return { url: resolved?.url, workerName: resolved?.workerName ?? "" };
};

const trimSlashes = (url: string): string => url.replace(/\/+$/, "");

export const databaseUrl = (url: string, name: string): string =>
  `${trimSlashes(url)}/db/${encodeURIComponent(name)}`;

const redact = (
  token: Redacted.Redacted<string> | string | undefined,
): Redacted.Redacted<string> | undefined =>
  token === undefined
    ? undefined
    : typeof token === "string"
      ? Redacted.make(token)
      : token;

/** One `GET {url}/health`; a non-2xx is a failure so the retry policy sees it. */
const healthOnce = (url: string) =>
  Effect.tryPromise({
    try: () => fetch(`${trimSlashes(url)}/health`, { method: "GET" }),
    catch: (cause) =>
      new NetworkError({
        message: `ripple: peer at ${url} is unreachable: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        cause,
      }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.void
        : Effect.fail(
            new NetworkError({
              message: `ripple: peer at ${url} answered /health with ${response.status}`,
            }),
          ),
    ),
  );

/**
 * Probe the peer, with retries: a `Database` is usually reconciled seconds
 * after the Worker that serves it was uploaded, and workers.dev routes take a
 * moment to propagate.
 */
const probeHealth = (url: string, probe: DatabaseProbe | false | undefined) => {
  if (probe === false) return Effect.void;
  const attempts = Math.max(1, probe?.attempts ?? 5);
  const delayMs = probe?.delayMs ?? 500;
  return healthOnce(url).pipe(
    Effect.retry({ times: attempts - 1, schedule: Schedule.spaced(delayMs) }),
  );
};

const attributes = Effect.fn(function* (
  id: string,
  props: DatabaseProps,
  probe: boolean,
) {
  const name = yield* resolveName(id, props.name);
  if (!DATABASE_NAME_RE.test(name)) {
    return yield* Effect.fail(
      new BadRequest({
        message: `ripple: invalid database name ${JSON.stringify(name)} — must match ${DATABASE_NAME_RE}`,
      }),
    );
  }
  const peer = resolvePeer(props.peer);
  if (peer.url === undefined || peer.url === "") {
    return yield* Effect.fail(
      new BadRequest({
        message:
          "ripple: the peer has no URL — pass a deployed Cloudflare.Worker (workers.dev or a custom domain) or an explicit { url }",
      }),
    );
  }
  const url = trimSlashes(peer.url);
  if (probe) yield* probeHealth(url, props.probe);
  return {
    name,
    url,
    databaseUrl: databaseUrl(url, name),
    peerName: peer.workerName,
    token: redact(props.token),
  };
});

const diff = Effect.fn(function* ({
  id,
  olds,
  news,
  output,
}: {
  readonly id: string;
  readonly olds: DatabaseProps;
  readonly news: Input<DatabaseProps>;
  readonly output: Database["Attributes"] | undefined;
}) {
  if (!isResolved(news)) return undefined;
  const oldName = output?.name ?? (yield* resolveName(id, olds?.name));
  const newName = yield* resolveName(id, news.name);
  // Renaming a database is not a rename: the Transactor DO is keyed by name
  // and the log/segments live under `db/<name>/…`. A new name is a new,
  // empty database.
  if (newName !== oldName) return { action: "replace" } as const;
  return undefined;
});

/**
 * Live provider. `reconcile` is idempotent — there is nothing to create, so
 * it resolves the name and the peer URL and proves the peer answers
 * `/health`.
 */
export const ProviderLive = () =>
  Provider.succeed(Database, {
    stables: ["name"],
    diff,
    reconcile: Effect.fn(function* ({ id, news }) {
      return yield* attributes(id, news, true);
    }),
    read: Effect.fn(function* ({ output }) {
      // Virtual: the persisted state row is the source of truth.
      return output ?? undefined;
    }),
    delete: Effect.fn(function* () {
      // Ripple databases are append-only and immutable; destroying the
      // resource forgets the *name*, it does not erase the log, the segments
      // in R2, or the Durable Objects. Deleting the data is a separate,
      // deliberate act (empty the bucket, delete the DO namespaces).
    }),
  });

/** Local provider (`alchemy dev`): same attributes, no liveness probe. */
export const ProviderLocal = () =>
  Provider.succeed(Database, {
    stables: ["name"],
    diff,
    reconcile: Effect.fn(function* ({ id, news }) {
      return yield* attributes(id, news, false);
    }),
    read: Effect.fn(function* ({ output }) {
      return output ?? undefined;
    }),
    delete: Effect.fn(function* () {}),
  });

export const DatabaseProvider = () =>
  ProviderLayer.dual(Database, {
    local: () => ProviderLocal(),
    live: () => ProviderLive(),
  });
