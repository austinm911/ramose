/**
 * `Ramose.Databases` — one capability, one transport.
 *
 * `yield* Ramose.Databases(Server)` is the client. The {@link layer}
 * auto-picks the wire: a Worker service binding when the host can take one,
 * otherwise the server's public URL. Read-only is a type-level view
 * (`ServerReadDb` / {@link asRead}), not a second tag.
 */
import * as Binding from "alchemy/Binding";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { type Server } from "./Server.ts";
import { SERVICE_ORIGIN } from "./ServerBinding.ts";
import { type ServerDatabasesShape, type ServerSource } from "./Source.ts";
export type { ReadDatabasesShape, ServerDatabasesShape, ServerDb, ServerReadDb, } from "./server-db.ts";
export { asRead } from "./server-db.ts";
export interface Databases extends Binding.Service<Databases, "Ramose.Databases", (server: Server) => Effect.Effect<ServerDatabasesShape>> {
}
export declare const Databases: Databases;
/** @internal Shared deploy-time + runtime half. */
export declare const makeTransport: <Client>(options: {
    makeClient: (source: ServerSource) => Client;
}) => Effect.Effect<(server: Server) => Effect.Effect<Client, never, never>, never, never>;
/**
 * One layer: service binding when the host Worker has it, otherwise HTTPS.
 * Provide it around a Worker or Action; nothing inside changes when the
 * wire swaps.
 */
export declare const layer: Layer.Layer<Databases>;
export { SERVICE_ORIGIN };
//# sourceMappingURL=Databases.d.ts.map