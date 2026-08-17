/**
 * `Ripple.Database` — install this catalog on this name, at deploy.
 *
 * It is **not** a cloud object. A Ripple database is a *name*: the server
 * Worker routes `/db/:name/*` to `idFromName(name)` and the first transaction
 * materializes it, so there is nothing to create and nothing to delete. What
 * this resource owns is the one thing a name does need done once — the
 * catalog. `reconcile` runs `db.install()`, the same idempotent transaction
 * `ripple.db(name, catalog).install()` runs at tenant-creation time; `delete`
 * does nothing at all, because forgetting the resource must not erase a log.
 *
 * It replaces the `Alchemy.Action` + local-transport idiom: the provider talks
 * plain HTTPS to the server's resolved `url` with its `token`, which under
 * `alchemy dev` is the local dev server's URL for free.
 *
 * @resource
 * @product Ripple
 * @category Storage & Databases
 * @section Installing a catalog
 * @example The one place a catalog lands
 * ```typescript
 * const RippleWorker = Cloudflare.Worker("RippleWorker", { main: "@ripple/worker" });
 * export const Server = Ripple.Server("Ripple", { worker: RippleWorker });
 * export const TodosDb = Ripple.Database("todos", { server: Server, catalog: Todos });
 * ```
 *
 * One resource is not one tenant: db-per-tenant is `ripple.db(tenant, Todos)`
 * plus `db.install()` when the tenant is created. Declare a `Database` for the
 * names you know at deploy time.
 */

import type { InputProps } from "alchemy/Input";
import * as Provider from "alchemy/Provider";
import { isResourceOfType, Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { Catalog } from "./db/index.ts";
import { InvalidRequest } from "./db/Errors.ts";
import { globalFetch, makeDatabases } from "./db/internal.ts";
import type { Providers } from "./Providers.ts";
import type { Server } from "./Server.ts";

/** @internal */
export const isDatabase = (value: unknown): value is Database =>
  isResourceOfType(value, "Ripple.Database");

/** @internal The public spelling is the argument of {@link Database}. */
export type DatabaseProps = {
  /** The server that serves this name. */
  server: Server;
  /** The catalog to install. `Ripple.Catalog({ … })`, shared with the app. */
  catalog: Catalog.Any;
  /** The database name. @default the resource's logical id */
  name?: string;
};

export type Database = Resource<
  "Ripple.Database",
  DatabaseProps,
  {
    /** The name the catalog was installed on. */
    name: string;
    /** The server URL it was installed against. */
    server: string;
    /** The `t` of the install transaction — the catalog's basis. */
    t: number;
  },
  never,
  Providers
>;

const DatabaseResource = Resource<Database>("Ripple.Database");

/**
 * Declare a database name and install its catalog.
 *
 * `server` may be given as the `Ripple.Server(…)` *declaration* — a yieldable
 * Effect, not a resource instance — exactly as `Server` takes a
 * `Cloudflare.Worker` declaration: `yield*`ing it here is what makes the
 * engine order the install after the server and substitute the real URL at
 * reconcile.
 */
export const Database = Object.assign(
  (id: string, props: InputProps<DatabaseProps, "catalog">) =>
    DatabaseResource(
      id,
      Effect.gen(function* () {
        const server = props.server as
          | Server
          | Effect.Effect<Server, unknown, never>;
        return {
          ...props,
          server: Effect.isEffect(server) ? yield* server : server,
        };
      }) as unknown as Effect.Effect<InputProps<DatabaseProps>, never, never>,
    ),
  DatabaseResource,
) as typeof DatabaseResource;

/**
 * @internal `{ url, token }` off the server's attributes.
 *
 * At reconcile the engine has replaced the Outputs with their values, which
 * the `Server` type still spells as Outputs (the same cast `resolveWorker`
 * makes on the other side of the resource).
 */
const resolveServer = (
  server: Server,
): { url: string | undefined; token: Redacted.Redacted<string> | undefined } => {
  const resolved = server as unknown as {
    url?: string | undefined;
    token?: Redacted.Redacted<string> | string | undefined;
  };
  const token = resolved?.token;
  return {
    url: resolved?.url,
    token:
      token === undefined || token === ""
        ? undefined
        : typeof token === "string"
          ? Redacted.make(token)
          : token,
  };
};

/**
 * The install itself: one idempotent transaction over plain HTTPS.
 *
 * An illegal name never reaches the server — `ripple.db(name, catalog)` fails
 * the operation with `InvalidRequest` — and a server with no URL is the same
 * kind of mistake, so it fails the deploy rather than the first request.
 */
const install = Effect.fn(function* (id: string, props: DatabaseProps) {
  const name = props.name ?? id;
  const { url, token } = resolveServer(props.server);
  if (url === undefined || url === "") {
    return yield* Effect.fail(
      new InvalidRequest({
        message: `ripple: the server for database ${JSON.stringify(name)} has no URL — deploy it before installing a catalog on it`,
      }),
    );
  }
  const { databases, close } = makeDatabases({
    url: Effect.succeed(url.replace(/\/+$/, "")),
    token: token === undefined ? undefined : Effect.succeed(token),
    fetch: globalFetch,
  });
  const report = yield* Effect.ensuring(
    databases.db(name, props.catalog).install(),
    Effect.sync(close),
  );
  return { name, server: url, t: report.t };
});

/**
 * @internal Registered by `providers()`. One provider, both modes: an install
 * is the same HTTPS transaction against a deployed server and against the
 * `alchemy dev` one.
 */
export const DatabaseProvider = () =>
  Provider.succeed(Database, {
    reconcile: Effect.fn(function* ({ id, news }) {
      // Create and update are the same act: `install()` upserts the catalog.
      return yield* install(id, news);
    }),
    read: Effect.fn(function* ({ output }) {
      // Virtual: the persisted state row is the source of truth. There is no
      // "does this database exist" question to ask — a name always exists.
      return output ?? undefined;
    }),
    delete: Effect.fn(function* () {
      // A database is a name, and the log under it is append-only. Forgetting
      // the resource must not erase data: dropping it is a separate,
      // deliberate act (empty the bucket, delete the DO namespaces).
    }),
  });
