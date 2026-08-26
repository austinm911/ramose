/**
 * `Ramose.Database` — install this catalog on this name, at deploy.
 *
 * It is **not** a cloud object. A Ramose database is a *name*: the server
 * Worker routes `/db/:name/*` to `idFromName(name)` and the first transaction
 * materializes it, so there is nothing to create and nothing to delete. What
 * this resource owns is the one thing a name does need done once — the
 * catalog. `reconcile` runs `db.install()`, the same idempotent transaction
 * `ramose.db(name, catalog).install()` runs at tenant-creation time; `delete`
 * does nothing at all, because forgetting the resource must not erase a log.
 *
 * It replaces the `Alchemy.Action` + local-transport idiom: the provider talks
 * plain HTTPS to the server's resolved `url` with its `token`, which under
 * `alchemy dev` is the local dev server's URL for free.
 *
 * @resource
 * @product Ramose
 * @category Storage & Databases
 * @section Installing a catalog
 * @example The one place a catalog lands
 * ```typescript
 * export const Server = Ramose.Server("Ramose", { databases: { todos: Todos } });
 * // Standalone Database is for runtime-provisioned names (Reef); known
 * // catalogs belong on Server({ databases }).
 * export const Extra = Ramose.Database("extra", { server: Server, schema: Extra });
 * ```
 *
 * One resource is not one tenant: db-per-tenant is `ramose.db(tenant, Todos)`
 * plus `db.install()` when the tenant is created. Declare a `Database` for the
 * names you know at deploy time.
 */
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { Schema } from "./db/index.ts";
import type { Providers } from "./Providers.ts";
import type { Server } from "./Server.ts";
/** @internal */
export declare const isDatabase: (value: unknown) => value is Database;
/** @internal The public spelling is the argument of {@link Database}. */
export type DatabaseProps = {
    /** The server that serves this name. */
    server: Server;
    /** The catalog to install. `Ramose.Schema({ … })`, shared with the app. */
    schema: Schema.Any;
    /** The database name. @default the resource's logical id */
    name?: string;
    /**
     * Cap on the install transaction, in ms. A catalog is a handful of datoms,
     * so this is not a budget — it is the line between "slow" and "never", which
     * `fetch` cannot draw on its own. @default 60000
     */
    timeoutMs?: number;
};
/** @internal The install's cap when {@link DatabaseProps.timeoutMs} is unset. */
export declare const DEFAULT_INSTALL_TIMEOUT_MS = 60000;
export type Database = Resource<"Ramose.Database", DatabaseProps, {
    /** The name the catalog was installed on. */
    name: string;
    /** The server URL it was installed against. */
    server: string;
    /** The `t` of the install transaction — the catalog's basis. */
    t: number;
}, never, Providers>;
declare const DatabaseResource: import("alchemy").ResourceClass<Database>;
/**
 * Declare a database name and install its catalog.
 *
 * `server` may be given as the `Ramose.Server(…)` *declaration* — a yieldable
 * Effect, not a resource instance — exactly as `Server` takes a
 * `Cloudflare.Worker` declaration: `yield*`ing it here is what makes the
 * engine order the install after the server and substitute the real URL at
 * reconcile.
 */
export declare const Database: typeof DatabaseResource;
/**
 * The install itself: one idempotent transaction over plain HTTPS.
 *
 * An illegal name never reaches the server — `ramose.db(name, catalog)` fails
 * the operation with `InvalidRequest` — and a server with no URL is the same
 * kind of mistake, so it fails the deploy rather than the first request.
 *
 * A server that has a URL and never answers on it is the third: `fetch` has no
 * deadline, so an unresolvable request parks the deploy indefinitely and the
 * run ends with a bare `fail` and nothing to read. `Ramose.Server` probes
 * `/health` for exactly this reason, but the probe cannot speak for `/db/:name`
 * — a bounded install is what makes the failure printable either way.
 */
/** @internal One idempotent catalog install over HTTPS. Shared with Server's `databases:` seeder. */
export declare const installCatalog: (args: {
    readonly name: string;
    readonly url: string;
    readonly token: Redacted.Redacted<string> | undefined;
    readonly schema: Schema.Any;
    readonly timeoutMs?: number;
}) => Effect.Effect<{
    name: string;
    server: string;
    t: number;
}, import("./browser.ts").IncompatibleSchema | import("./browser.ts").DbError, never>;
/**
 * @internal Registered by `providers()`. One provider, both modes: an install
 * is the same HTTPS transaction against a deployed server and against the
 * `alchemy dev` one.
 */
export declare const DatabaseProvider: () => import("effect/Layer").Layer<Provider.Provider<Database>, never, never>;
export {};
//# sourceMappingURL=Database.d.ts.map