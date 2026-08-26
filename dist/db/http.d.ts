/**
 * @internal The HTTPS half of the transport.
 *
 * One request: JSON in (`toJson`, so instants / bytes / uuids survive), the
 * body out through `fromJson`, and a non-2xx classified into one of the nine
 * tagged failures by {@link fromResponse}. App writes go through
 * `POST /db/:name/op`; raw `POST /db/:name/transact` is admin / seed /
 * `writes: "all"`. Reads fall back here when the client was given no
 * `WebSocket`.
 *
 * Nothing here is on the `ramose/db` barrel: HTTP is Worker
 * internals, not a second public API.
 */
import * as Effect from "effect/Effect";
import { type DbError, Unauthorized } from "./Errors.ts";
/**
 * The `fetch` seam, narrowed to what the client actually calls.
 *
 * `typeof fetch` fits it, and so does a Cloudflare service binding
 * (`(url, init) => env.Peer.fetch(url, init)`), which is how a Worker reaches
 * the peer without a public hop.
 */
export type FetchLike = (url: string, init: {
    method: string;
    headers: Record<string, string>;
    body?: string | undefined;
}) => Promise<Response>;
/** The ambient `fetch`, bound once. */
export declare const globalFetch: FetchLike;
/** Adapt a standard `fetch` (what {@link ClientOptions} takes) to the seam. */
export declare const fromStandardFetch: (f: typeof fetch) => FetchLike;
/** Drop `undefined` fields — JSON would otherwise send them as `null`. */
export declare const compact: (o: Record<string, unknown>) => Record<string, unknown>;
/** Strip trailing slashes from a URL / origin. One definition for every transport. */
export declare const trimSlashes: (url: string) => string;
export declare const record: (value: unknown) => Record<string, unknown>;
/** The read fence, as the header the peer reads it from. */
export declare const minTHeader: (minT: number | undefined) => Record<string, string>;
export interface RawResult {
    readonly body: unknown;
    readonly headers: {
        get(name: string): string | null;
    };
}
export interface SendOptions {
    readonly fetch: FetchLike;
    /** Peer base URL, no trailing slash. */
    readonly url: string;
    readonly method: string;
    /** Path under the base (`/db/movies/transact`). */
    readonly path: string;
    readonly token?: string | undefined;
    readonly headers?: Record<string, string> | undefined;
    readonly body?: unknown;
}
/**
 * The one transient-retry policy, for every transport. `Unavailable` and
 * `NetworkError` are retried on a jittered exponential ladder (~150ms
 * doubling to 2s; ~4s of sleep in total); anything else surfaces at once.
 * `attempt` receives the attempt index, `0` first. `while` ends the ladder
 * early when a retry cannot help — a closed client, where nothing reopens.
 */
export declare const retryTransient: <A>(attempt: (n: number) => Effect.Effect<A, DbError>, options?: {
    readonly while?: (() => boolean) | undefined;
}) => Effect.Effect<A, DbError>;
/** One request, classified. The only place the client touches `fetch`. */
export declare const send: (options: SendOptions) => Effect.Effect<RawResult, DbError>;
/**
 * One GET, no retries. A refused WebSocket handshake cannot carry its HTTP
 * status through the browser socket API; this asks the same peer with the
 * handshake's token so 401/403 stay {@link Unauthorized}. Any other outcome
 * (200, 400 "expected websocket", a transport failure) is ignored — the
 * caller keeps the original `SocketGone` / {@link NetworkError}.
 */
export declare const probeUnauthorized: (options: Omit<SendOptions, "method" | "body">) => Effect.Effect<Unauthorized | undefined>;
//# sourceMappingURL=http.d.ts.map