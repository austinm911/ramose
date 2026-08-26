/**
 * `connect` — the promise-land client handle.
 *
 * App callers get {@link Client} (`db.query`, `db.run`, `db.live`) without a
 * `ManagedRuntime`. Effect's `layer` / `Databases` stay on `ramose/db/effect`.
 *
 * This module is scanned by `scripts/check-client-dts.ts` with no allowlist
 * exemption: do not add `effect` to any exported type (`Client`,
 * `ClientOptions`, `connect`).
 */
import { NetworkError } from "./Errors.js";
import { trimSlashes } from "./http.js";
import { configFromClientOptions, makeDatabases } from "./factory.js";
import { checkOperationsCoverage, } from "./Operation.js";
const healthOperationsOf = (body) => {
    if (typeof body !== "object" || body === null)
        return [];
    const listed = body.operations;
    if (!Array.isArray(listed))
        return [];
    return listed.filter((n) => typeof n === "string");
};
const checkClientOperations = async (options) => {
    if (options.operations === undefined)
        return;
    const url = trimSlashes(options.url);
    const fetchFn = options.fetch ?? fetch;
    let response;
    try {
        response = await fetchFn(`${url}/health`, { method: "GET" });
    }
    catch (cause) {
        throw new NetworkError({
            message: `ramose: server at ${url} is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
        });
    }
    let body = {};
    try {
        body = await response.json();
    }
    catch {
        body = {};
    }
    if (!response.ok) {
        throw new NetworkError({
            message: `ramose: server at ${url} answered /health with ${response.status}`,
        });
    }
    checkOperationsCoverage(options.operations, healthOperationsOf(body));
};
/**
 * A `Client` for app callers — a browser app, a script — so nothing
 * outside Effect land needs a `ManagedRuntime` just to build the client and
 * close its sockets. A thin wrapper over the factory `layer` uses, not a
 * second client; `layer` lives on `ramose/db/effect`.
 *
 * A provisioning mistake (malformed URL, no `fetch`) throws synchronously:
 * the same defects `layer` dies with.
 */
export const connect = (options) => {
    const { databases, close, connectionStatus, onConnectionStatus } = makeDatabases(configFromClientOptions(options));
    return {
        db: (name, catalog) => databases.db(name, catalog),
        close: () => {
            close();
            return Promise.resolve();
        },
        checkOperations: () => checkClientOperations(options),
        connectionStatus,
        onConnectionStatus,
    };
};
//# sourceMappingURL=connect.js.map