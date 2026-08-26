/**
 * @internal Where a transport sends, and with which credential.
 *
 * Not exported from `index.ts`: HTTP is Worker internals. The one
 * {@link import("./Databases.ts").layer} auto-picks a {@link ServerSource}
 * (service binding if present, else HTTPS); {@link serverDatabasesOf} turns
 * it into the server-side client (no `live` / `livePull`).
 */
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { makeDatabases } from "./db/internal.js";
import { trimSlashes } from "./db/http.js";
import { withoutLive, } from "./server-db.js";
export { asRead, withoutLive } from "./server-db.js";
/**
 * The server-side client over a source: no `webSocket`, and `live` /
 * `livePull` are not on the type (they always defect on this hop).
 */
export const serverDatabasesOf = (source) => {
    const databases = makeDatabases({
        url: source.endpoint.pipe(Effect.map((endpoint) => trimSlashes(endpoint.url))),
        token: source.endpoint.pipe(Effect.map((endpoint) => Redacted.make(endpoint.token === undefined
            ? ""
            : typeof endpoint.token === "string"
                ? endpoint.token
                : Redacted.value(endpoint.token)))),
        fetch: source.fetch,
    }).databases;
    return {
        db: (name, schema) => withoutLive(databases.db(name, schema)),
    };
};
//# sourceMappingURL=Source.js.map