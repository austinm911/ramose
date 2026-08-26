/**
 * @internal Shared client factory — one `makeDatabases` for `connect` and
 * `layer`. Hatch types (`layer`, `Databases`, `EffectToken`) live on
 * `ramose/db/effect`. This file's emitted `.d.ts` names Effect only through
 * `effect-types`, so a hop from `connect.d.ts` is not an `effect` import.
 */
import { fromJson, toJson } from "../internal/core/json.js";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import { makeDb } from "./Db.js";
import { fromResponse, InternalError, isDatabaseError, NetworkError, } from "./Errors.js";
import { fromStandardFetch, globalFetch, minTHeader, probeUnauthorized, record, retryTransient, send, trimSlashes, } from "./http.js";
import { openOverlay } from "./overlay.js";
import { browserOffline, globalWebSocket, openSession, parsePrincipal, worseConnection, } from "./session.js";
import { isTokenSource, wrapTokenCause, } from "./token.js";
/** The credential as the wire wants it: a string, or nothing. */
const bearer = (token) => token === undefined
    ? Effect.succeed(undefined)
    : token.pipe(Effect.map((t) => {
        const value = Redacted.value(t);
        return value.length > 0 ? value : undefined;
    }));
const dbPath = (name, rest) => `/db/${encodeURIComponent(name)}${rest}`;
const networkError = (cause) => new NetworkError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
});
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
export const makeDatabases = (config) => {
    const sessions = new Map();
    const overlays = new Map();
    const catalogs = new Map();
    const statusListeners = new Set();
    let closed = false;
    const notifyStatus = () => {
        for (const cb of [...statusListeners])
            cb();
    };
    const connectionStatus = (name) => {
        if (closed)
            return "closed";
        if (config.webSocket === undefined)
            return "offline";
        if (browserOffline())
            return "offline";
        if (name !== undefined) {
            return sessions.get(name)?.status ?? "connecting";
        }
        if (sessions.size === 0)
            return "connecting";
        let worst = "live";
        for (const s of sessions.values()) {
            worst = worseConnection(worst, s.status);
        }
        return worst;
    };
    // rejects with the typed DbError itself (not a FiberFailure), so the
    // session's caller can tell a thrown Unauthorized from a transport failure
    const token = () => config.token === undefined
        ? Promise.resolve(undefined)
        : Effect.runPromise(Effect.result(config.token)).then((result) => Result.isFailure(result)
            ? Promise.reject(result.failure)
            : Promise.resolve(result.success));
    const session = (name) => {
        if (config.webSocket === undefined)
            return undefined;
        let existing = sessions.get(name);
        if (existing === undefined) {
            existing = openSession({
                url: () => Effect.runPromise(config.url),
                name,
                token: config.token === undefined ? undefined : token,
                connect: config.webSocket,
                // browser WS hides the upgrade status; one GET /session (no
                // Upgrade) with the handshake's token recovers 401/403
                classifyHandshake: async (handshakeToken) => {
                    try {
                        return await Effect.runPromise(probeUnauthorized({
                            fetch: config.fetch,
                            url: await Effect.runPromise(config.url),
                            path: dbPath(name, "/session"),
                            token: handshakeToken,
                            headers: config.headers,
                        }));
                    }
                    catch {
                        return undefined;
                    }
                },
            });
            // past the finalizer, a socket-backed client stays socket-backed: reads
            // fail rather than silently changing transport
            if (closed)
                existing.close();
            sessions.set(name, existing);
            existing.onWake(notifyStatus);
            notifyStatus();
        }
        return existing;
    };
    const overlayOf = (name) => {
        if (session(name) === undefined)
            return undefined;
        let existing = overlays.get(name);
        if (existing === undefined) {
            const socket = session(name);
            existing = openOverlay({
                session: socket,
                post: (tx, clientTxId) => postTx(name, tx, clientTxId),
                postOp: (invocation) => postOp(name, invocation),
                schema: catalogs.get(name),
            });
            overlays.set(name, existing);
        }
        return existing;
    };
    /**
     * A read as one session frame. Transient failures walk the same retry
     * ladder as HTTPS: a platform error the peer relays over the socket, or a
     * socket that dropped mid-request (the next attempt reopens it) — unless the
     * client is closed, where nothing reopens and the failure is immediate.
     */
    const frame = (socket, op, body, minT) => retryTransient(() => Effect.tryPromise({
        try: () => socket.request({
            op,
            ...record(toJson(body)),
            ...(minT === undefined ? {} : { minT }),
        }),
        // a token source that failed typed keeps its tag (an Unauthorized
        // mint stays terminal); everything else here is transport
        catch: (cause) => isDatabaseError(cause) ? cause : networkError(cause),
    }).pipe(Effect.flatMap((reply) => reply.status >= 200 && reply.status < 300
        ? Effect.succeed(fromJson(reply.body))
        : Effect.fail(fromResponse(reply.status, reply.body, {
            get: (h) => reply.headers?.[h.toLowerCase()] ?? null,
        })))), { while: () => !socket.closed });
    /** The same read as one HTTPS POST — the fallback when there is no socket. */
    const post = (name, op, body, minT) => Effect.gen(function* () {
        const result = yield* send({
            fetch: config.fetch,
            url: yield* config.url,
            method: "POST",
            path: dbPath(name, op === "q" ? "/query" : "/pull"),
            token: yield* bearer(config.token),
            headers: { ...(config.headers ?? {}), ...minTHeader(minT) },
            body,
        });
        return result.body;
    });
    const postTx = (name, tx, clientTxId) => Effect.gen(function* () {
        const result = yield* send({
            fetch: config.fetch,
            url: yield* config.url,
            method: "POST",
            path: dbPath(name, "/transact"),
            // re-read per transact, exactly as on every (re)connect
            token: yield* bearer(config.token),
            headers: config.headers,
            body: {
                tx,
                ...(clientTxId !== undefined ? { clientTxId } : {}),
            },
        });
        return result.body;
    });
    const postOp = (name, invocation) => Effect.gen(function* () {
        const result = yield* send({
            fetch: config.fetch,
            url: yield* config.url,
            method: "POST",
            path: dbPath(name, "/op"),
            token: yield* bearer(config.token),
            headers: config.headers,
            body: {
                name: invocation.name,
                input: invocation.input,
                clientOpId: invocation.clientOpId,
                ...(invocation.entity !== undefined ? { entity: invocation.entity } : {}),
            },
        });
        return result.body;
    });
    const info = (name) => Effect.gen(function* () {
        const result = yield* send({
            fetch: config.fetch,
            url: yield* config.url,
            method: "GET",
            path: dbPath(name, "/info"),
            token: yield* bearer(config.token),
            headers: config.headers,
        });
        return result.body;
    });
    /**
     * `db.principal()`'s answer, cached per session generation — a reconnect
     * authenticates afresh, so the cache is void with it. A `null` eid is never
     * cached: the row may be written at any moment, and re-reading after that
     * write is the whole point. An in-place `auth` swap supersedes both — its
     * ack names the new principal outright, or says its row does not exist yet,
     * which voids what `/info` said about the old one (`acked` pins the cache
     * entry to the ack it was read under, by identity).
     */
    const principals = new Map();
    const principal = (name) => Effect.suspend(() => {
        const socket = session(name);
        const acked = socket?.principal;
        // the swap's ack already named the entity: no request needed
        if (acked !== undefined && acked.eid !== null) {
            return Effect.succeed(acked);
        }
        const generation = socket?.generation ?? 0;
        const hit = principals.get(name);
        if (hit !== undefined &&
            hit.generation === generation &&
            hit.acked === acked &&
            hit.value.eid !== null) {
            return Effect.succeed(hit.value);
        }
        return info(name).pipe(Effect.flatMap((body) => {
            const value = parsePrincipal(record(body).principal);
            if (value === undefined) {
                return Effect.fail(new InternalError({
                    message: "ramose: the server's /info reported no principal — it predates db.principal()",
                }));
            }
            if (value.eid !== null) {
                principals.set(name, {
                    generation: socket?.generation ?? 0,
                    acked,
                    value,
                });
            }
            return Effect.succeed(value);
        }));
    });
    const wire = {
        session,
        bindSchema: (name, catalog) => {
            catalogs.set(name, catalog);
        },
        overlay: overlayOf,
        read: (name, op, body, minT) => {
            const pinned = body.asOf !== undefined || body.history === true;
            if (!pinned) {
                const ov = overlayOf(name);
                if (ov !== undefined)
                    return ov.read(op, body);
            }
            const socket = session(name);
            return socket === undefined
                ? post(name, op, body, minT)
                : frame(socket, op, body, minT);
        },
        transact: (name, tx, clientTxId) => postTx(name, tx, clientTxId),
        operation: (name, invocation) => postOp(name, invocation),
        info,
        principal,
    };
    return {
        databases: {
            db: (name, schema) => makeDb(wire, name, schema),
        },
        close: () => {
            closed = true;
            for (const s of sessions.values())
                s.close();
            notifyStatus();
        },
        connectionStatus,
        onConnectionStatus: (cb, name) => {
            const notify = () => {
                cb(connectionStatus(name));
            };
            statusListeners.add(notify);
            if (typeof window !== "undefined") {
                window.addEventListener("online", notify);
                window.addEventListener("offline", notify);
            }
            return () => {
                statusListeners.delete(notify);
                if (typeof window !== "undefined") {
                    window.removeEventListener("online", notify);
                    window.removeEventListener("offline", notify);
                }
            };
        },
    };
};
/**
 * @internal Shared transport bits for `connect` and the hatch's Effect-valued
 * token path. A malformed URL, or no `fetch` at all, is a defect.
 */
export const resolveTransport = (options) => {
    try {
        new URL(options.url);
    }
    catch {
        throw new Error(`ramose: malformed url ${JSON.stringify(options.url)}`);
    }
    const ambient = typeof fetch === "undefined" ? undefined : fetch;
    const chosen = options.fetch ?? ambient;
    if (chosen === undefined) {
        throw new Error("ramose: no global fetch — pass `fetch` to Ramose.connect({ … }) or Ramose.layer({ … })");
    }
    const socket = options.webSocket === undefined
        ? globalWebSocket()
        : (url) => new options.webSocket(url);
    return {
        url: Effect.succeed(trimSlashes(options.url)),
        fetch: options.fetch === undefined ? globalFetch : fromStandardFetch(chosen),
        webSocket: socket,
    };
};
/**
 * Resolve a plain {@link TokenInput} (string / source / thunk). Effect-valued
 * tokens are resolved on `ramose/db/effect` before they reach the factory.
 */
export const resolvePlainToken = (token) => {
    if (token === undefined)
        return undefined;
    if (typeof token === "string")
        return Effect.succeed(Redacted.make(token));
    if (typeof token === "function") {
        return Effect.tryPromise({
            try: async () => Redacted.make(await token()),
            catch: wrapTokenCause,
        });
    }
    if (isTokenSource(token)) {
        return Effect.tryPromise({
            try: async () => Redacted.make(await token.token()),
            catch: wrapTokenCause,
        });
    }
    throw new Error("ramose: token must be a string, TokenSource, () => string | Promise<string>, or an Effect");
};
/**
 * @internal Build {@link DatabasesConfig} from {@link ClientOptions}.
 * Provisioning mistakes throw — the same defects `layer` dies with.
 */
export const configFromClientOptions = (options) => ({
    ...resolveTransport(options),
    token: resolvePlainToken(options.token),
});
//# sourceMappingURL=factory.js.map