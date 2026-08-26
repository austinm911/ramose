/**
 * @internal Shared client factory — one `makeDatabases` for `connect` and
 * `layer`. Hatch types (`layer`, `Databases`, `EffectToken`) live on
 * `ramose/db/effect`. This file's emitted `.d.ts` names Effect only through
 * `effect-types`, so a hop from `connect.d.ts` is not an `effect` import.
 */
import type { ClientOptions } from "./connect.ts";
import type { EffectOf, RedactedOf } from "./effect-types.ts";
import { type DbError } from "./Errors.ts";
import { type FetchLike } from "./http.ts";
import type { DatabasesShape } from "./client-shape.ts";
import { type ConnectionStatus, type SocketFactory } from "./session.ts";
import { type TokenInput } from "./token.ts";
export type { DatabasesShape } from "./client-shape.ts";
/**
 * @internal What {@link makeDatabases} needs. Deliberately looser than
 * {@link ClientOptions}: the Worker-side transports resolve their URL and
 * token from bound Alchemy Outputs, so both are Effects, and a service binding
 * supplies a `fetch` that is not the global one.
 */
export interface DatabasesConfig {
    /** Where to send. An Effect, so a deploy-time Output can be read per call. */
    readonly url: EffectOf<string>;
    readonly token?: EffectOf<RedactedOf<string>, DbError> | undefined;
    /** `env.Peer.fetch` in a Worker, the ambient `fetch` everywhere else. */
    readonly fetch: FetchLike;
    /** Omit for an HTTPS-only client: reads fall back to POST, `live` is unavailable. */
    readonly webSocket?: SocketFactory | undefined;
    /** Extra headers on every HTTPS request (`x-ramose-replica-hint`, …). */
    readonly headers?: Record<string, string> | undefined;
}
/**
 * @internal Build a client over an arbitrary transport, plus the finalizer
 * that closes its sockets.
 *
 * This is the seam the Alchemy-side transports use: a Worker service binding
 * passes `fetch: (url, init) => env.Peer.fetch(url, init)` with the synthetic
 * origin as `url` and no `webSocket` — reads then go over the same binding as
 * HTTPS POSTs, and `live` is unavailable. A public-URL transport passes the
 * peer's URL and, when it wants `live`, a `webSocket` factory.
 */
export declare const makeDatabases: (config: DatabasesConfig) => {
    readonly databases: DatabasesShape;
    readonly close: () => void;
    readonly connectionStatus: (name?: string) => ConnectionStatus;
    readonly onConnectionStatus: (cb: (status: ConnectionStatus) => void, name?: string) => () => void;
};
/**
 * @internal Shared transport bits for `connect` and the hatch's Effect-valued
 * token path. A malformed URL, or no `fetch` at all, is a defect.
 */
export declare const resolveTransport: (options: Pick<ClientOptions, "url" | "fetch" | "webSocket">) => Pick<DatabasesConfig, "url" | "fetch" | "webSocket">;
/**
 * Resolve a plain {@link TokenInput} (string / source / thunk). Effect-valued
 * tokens are resolved on `ramose/db/effect` before they reach the factory.
 */
export declare const resolvePlainToken: (token: TokenInput | undefined) => EffectOf<RedactedOf<string>, DbError> | undefined;
/**
 * @internal Build {@link DatabasesConfig} from {@link ClientOptions}.
 * Provisioning mistakes throw — the same defects `layer` dies with.
 */
export declare const configFromClientOptions: (options: ClientOptions) => DatabasesConfig;
//# sourceMappingURL=factory.d.ts.map