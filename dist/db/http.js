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
import { fromJson, toJson } from "../internal/core/json.js";
import * as Effect from "effect/Effect";
import { fromResponse, NetworkError, Unauthorized } from "./Errors.js";
/** The ambient `fetch`, bound once. */
export const globalFetch = (url, init) => fetch(url, { method: init.method, headers: init.headers, body: init.body });
/** Adapt a standard `fetch` (what {@link ClientOptions} takes) to the seam. */
export const fromStandardFetch = (f) => (url, init) => f(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
});
/** Drop `undefined` fields — JSON would otherwise send them as `null`. */
export const compact = (o) => {
    const out = {};
    for (const [k, v] of Object.entries(o))
        if (v !== undefined)
            out[k] = v;
    return out;
};
/** Strip trailing slashes from a URL / origin. One definition for every transport. */
export const trimSlashes = (url) => url.replace(/\/+$/, "");
export const record = (value) => (typeof value === "object" && value !== null ? value : {});
/** The read fence, as the header the peer reads it from. */
export const minTHeader = (minT) => minT === undefined ? {} : { "x-ramose-min-t": String(minT) };
/** How many times one request is attempted before a transient failure surfaces. */
const TRANSIENT_ATTEMPTS = 6;
/**
 * The one transient-retry policy, for every transport. `Unavailable` and
 * `NetworkError` are retried on a jittered exponential ladder (~150ms
 * doubling to 2s; ~4s of sleep in total); anything else surfaces at once.
 * `attempt` receives the attempt index, `0` first. `while` ends the ladder
 * early when a retry cannot help — a closed client, where nothing reopens.
 */
export const retryTransient = (attempt, options) => {
    const go = (n) => attempt(n).pipe(Effect.catch((e) => {
        if (n + 1 >= TRANSIENT_ATTEMPTS ||
            !isTransientPlatform(e) ||
            options?.while?.() === false) {
            return Effect.fail(e);
        }
        // Jittered so concurrent callers do not retry in lockstep.
        const ms = Math.round(Math.min(2000, 150 * 2 ** n) * (0.5 + Math.random()));
        return Effect.sleep(`${ms} millis`).pipe(Effect.andThen(() => go(n + 1)));
    }));
    return go(0);
};
/** One request, classified. The only place the client touches `fetch`. */
export const send = (options) => retryTransient((n) => sendOnce(options, n > 0));
/**
 * One GET, no retries. A refused WebSocket handshake cannot carry its HTTP
 * status through the browser socket API; this asks the same peer with the
 * handshake's token so 401/403 stay {@link Unauthorized}. Any other outcome
 * (200, 400 "expected websocket", a transport failure) is ignored — the
 * caller keeps the original `SocketGone` / {@link NetworkError}.
 */
export const probeUnauthorized = (options) => sendOnce({ ...options, method: "GET" }).pipe(Effect.map(() => undefined), Effect.catch((e) => Effect.succeed(e._tag === "Unauthorized" ? e : undefined)));
// Platform errors arrive classified: Errors.ts maps workers.dev HTML 404s,
// Cloudflare 1xxx pages and "Worker not found" onto Unavailable.
const isTransientPlatform = (e) => e._tag === "Unavailable" || e._tag === "NetworkError";
const sendOnce = (options, fresh = false) => Effect.gen(function* () {
    const headers = {
        "content-type": "application/json",
        ...(options.headers ?? {}),
    };
    // A transient platform error is often pinned to one pooled socket (one
    // edge server keeps serving it). Retries send `Connection: close` so the
    // next attempt dials a fresh server. Ignored where it has no meaning
    // (browsers strip it; service bindings have no connection).
    if (fresh)
        headers.connection = "close";
    if (options.token !== undefined && options.token.length > 0) {
        headers.authorization = `Bearer ${options.token}`;
    }
    const response = yield* Effect.tryPromise({
        try: () => options.fetch(options.url + options.path, {
            method: options.method,
            headers,
            body: options.body === undefined
                ? undefined
                : JSON.stringify(toJson(options.body)),
        }),
        catch: (cause) => new NetworkError({
            message: `ramose: ${options.method} ${options.path} failed: ${cause instanceof Error ? cause.message : String(cause)}`,
            cause,
        }),
    });
    const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (cause) => new NetworkError({
            message: "ramose: response body could not be read",
            cause,
        }),
    });
    let parsed;
    try {
        parsed = text.length > 0 ? JSON.parse(text) : null;
    }
    catch {
        parsed = { error: text };
    }
    if (!response.ok) {
        return yield* Effect.fail(fromResponse(response.status, parsed, response.headers));
    }
    return { body: fromJson(parsed), headers: response.headers };
});
//# sourceMappingURL=http.js.map