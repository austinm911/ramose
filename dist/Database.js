import * as Provider from "alchemy/Provider";
import { isResourceOfType, Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import { InvalidRequest } from "./db/Errors.js";
export const isDatabase = (value) => isResourceOfType(value, "Ramose.Database");
export const DEFAULT_INSTALL_TIMEOUT_MS = 60_000;
const DatabaseResource = Resource("Ramose.Database");
/**
 * Declare a database name and install its catalog.
 *
 * `server` may be given as the `Ramose.Server(…)` *declaration* — a yieldable
 * Effect, not a resource instance — exactly as `Server` takes a
 * `Cloudflare.Worker` declaration: `yield*`ing it here is what makes the
 * engine order the install after the server and substitute the real URL at
 * reconcile.
 */
export const Database = Object.assign((id, props) => DatabaseResource(id, Effect.gen(function* () {
    const server = props.server;
    return {
        ...props,
        server: Effect.isEffect(server) ? yield* server : server,
    };
})), DatabaseResource);
const resolveServer = (server) => {
    const resolved = server;
    return {
        url: resolved?.url,
    };
};
export const installCatalog = Effect.fn(function* (args) {
    const { name, url } = args;
    if (url === undefined || url === "") {
        return yield* new InvalidRequest({
            message: `ramose: the server for database ${JSON.stringify(name)} has no URL — deploy it before installing a schema on it`,
        });
    }
    return yield* new InvalidRequest({
        message: `ramose: catalog install on ${JSON.stringify(name)} is closed until authorized catalog publication is wired`,
    });
});
const install = Effect.fn(function* (id, props) {
    const name = props.name ?? id;
    const { url } = resolveServer(props.server);
    return yield* installCatalog({
        name,
        url: url ?? "",
        schema: props.schema,
        timeoutMs: props.timeoutMs,
    });
});
// @effect-diagnostics-next-line lazyEffect:off
export const DatabaseProvider = () => Provider.succeed(Database, {
    reconcile: Effect.fn(function* ({ id, news }) {
        return yield* install(id, news);
    }),
    read: Effect.fn(function* ({ output }) {
        return output ?? undefined;
    }),
    delete: Effect.fn(function* () {
    }),
});
//# sourceMappingURL=Database.js.map