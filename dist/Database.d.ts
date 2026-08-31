import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import type { Schema } from "./db/index.ts";
import { InvalidRequest } from "./db/Errors.ts";
import type { Providers } from "./Providers.ts";
import type { Server } from "./Server.ts";
export declare const isDatabase: (value: unknown) => value is Database;
export type DatabaseProps = {
    server: Server;
    schema: Schema.Any;
    name?: string;
    timeoutMs?: number;
};
export declare const DEFAULT_INSTALL_TIMEOUT_MS = 60000;
export type Database = Resource<"Ramose.Database", DatabaseProps, {
    name: string;
    server: string;
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
export declare const installCatalog: (args: {
    readonly name: string;
    readonly url: string;
    readonly schema: Schema.Any;
    readonly timeoutMs?: number | undefined;
}) => Effect.Effect<never, InvalidRequest, never>;
export declare const DatabaseProvider: () => import("effect/Layer").Layer<Provider.Provider<Database>, never, never>;
export {};
//# sourceMappingURL=Database.d.ts.map