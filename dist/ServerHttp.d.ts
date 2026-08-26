/**
 * @internal HTTPS source. The public surface is
 * {@link import("./Databases.ts").layer}, which uses this hop when no
 * service binding is present (Actions, `alchemy dev`, a bare URL).
 */
import * as Effect from "effect/Effect";
import type { Server } from "./Server.ts";
import type { ServerSource } from "./Source.ts";
/** The HTTPS {@link ServerSource}: `server.url` + `server.token`, over global `fetch`. */
export declare const makeHttpSource: (server: Server) => Effect.Effect<ServerSource>;
//# sourceMappingURL=ServerHttp.d.ts.map