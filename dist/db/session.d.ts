/**
 * @internal One reconnecting WebSocket to `GET /db/:name/session`.
 *
 * The client speaks exactly one socket route (`GET /db/:name/session`). The
 * Worker verifies the caller and upgrades onto the replica that session
 * already queries — no Durable Object is reachable or nameable from here.
 * Reads (`q`, `pull`) and unsolicited `{ op: "tx" }` / `{ op: "resync" }`
 * frames ride it. A visible commit is one frame: `{ op: "tx", t, datoms }`
 * — that `t` is the basis bump, same as a read reply. Writes never ride
 * the socket (`transact` is HTTPS, so `processTx` is untouched).
 *
 * Unlike the socket this replaces, a drop is **not** terminal. The socket is
 * opened lazily by the first read, and after a close / error the next request
 * opens a fresh one — re-reading the token, because a token is
 * `Effect<Redacted<string>>` and is re-read on every (re)connect. A standing
 * `db.live` therefore survives the network: it is woken by
 * {@link Session.onWake} on paint (`nudge`) and on a drop, and its next
 * pass reconnects.
 *
 * `Unauthorized` is handled in place: the frame's 401/403 makes the session
 * re-read the token, send `{ op: "auth", token }` on the *same* socket, and
 * re-issue the frame once. Nothing standing is torn down by that swap — which
 * is the whole point of the peer having an `auth` op.
 *
 * A handshake that never opens is different. The browser (and this
 * `WebSocketLike` seam) hide the upgrade's HTTP status, so a close/error
 * before `open` would otherwise become `SocketGone` → `NetworkError`. When
 * {@link SessionOptions.classifyHandshake} is set, the session asks it with
 * the handshake's token before surfacing that; a 401/403 probe becomes the
 * same tagged `Unauthorized` the HTTP path uses. True transport failures
 * stay `SocketGone`.
 */
import * as Redacted from "effect/Redacted";
/**
 * The slice of `WebSocket` a session uses — so a test can hand in a fake, and
 * so this file does not depend on whose `WebSocket` global is in scope.
 */
export interface WebSocketLike {
    send(data: string): void;
    close(): void;
    addEventListener(type: "message" | "open" | "close" | "error", cb: (ev: any) => void): void;
    /** `1` is OPEN. Absent (a fake) is treated as already open. */
    readonly readyState?: number;
}
/** How a session obtains its socket. `layer` defaults it to the global `WebSocket`. */
export type SocketFactory = (url: string) => WebSocketLike;
/** The ambient `WebSocket`, if this runtime has one. */
export declare const globalWebSocket: () => SocketFactory | undefined;
/** A reply frame, normalized: an `auth` ack (`{ ok: true }`) is a 200. */
export interface Reply {
    readonly status: number;
    readonly body: unknown;
    readonly headers?: Record<string, string> | undefined;
}
/**
 * Who this session is, as the peer's `auth` ack reports it: the principal's
 * entity (`null` when the principal attribute has no row yet) and class.
 */
export interface SessionPrincipal {
    readonly eid: number | null;
    readonly class: string;
}
/** The ack's / `/info` `principal` field, parsed; `undefined` when the peer sent none. */
export declare const parsePrincipal: (raw: unknown) => SessionPrincipal | undefined;
export interface SessionOptions {
    /**
     * Peer base URL — `http(s)://…` is rewritten to `ws(s)://…`. A thunk,
     * because a deploy-time Alchemy Output resolves as an Effect.
     */
    readonly url: () => Promise<string>;
    /** Ramose database name — the `:name` in `/db/:name/session`. */
    readonly name: string;
    /**
     * Re-read on every (re)connect and every re-auth. A rejection is the token
     * source's own failure (a `DbError` from a refreshing mint) and surfaces
     * from `request` untouched.
     */
    readonly token?: (() => Promise<Redacted.Redacted<string> | undefined>) | undefined;
    readonly connect: SocketFactory;
    /**
     * After a handshake that never opened, classify the failure. Return a
     * tagged error (the HTTP path's `Unauthorized`) to surface it; `undefined`
     * keeps `SocketGone`. Receives the token that rode the upgrade — not a
     * fresh mint — so an expired credential is not hidden by a refresh.
     */
    readonly classifyHandshake?: ((token: string | undefined) => Promise<Error | undefined>) | undefined;
    /**
     * Unsolicited `{ op: "tx" }` / `{ op: "resync" }` frames. The overlay
     * applies them. Those frames already carry `t` and bump the basis the
     * same way a read reply does.
     */
    readonly onPush?: ((frame: Record<string, unknown>) => void | Promise<void>) | undefined;
}
/**
 * What a session (or the client that owns one) reports for "am I connected?".
 *
 * Session itself never returns `"offline"` — that is the client's answer
 * when there is no socket factory, or the browser's `navigator.onLine`
 * is false. A session is `"connecting"` until the first handshake
 * completes, `"live"` while a socket is held, `"reconnecting"` after a
 * drop, and `"closed"` after {@link Session.close}.
 */
export type ConnectionStatus = "connecting" | "live" | "reconnecting" | "offline" | "closed";
/** The more concerning of two statuses — used to roll up a multi-db client. */
export declare const worseConnection: (a: ConnectionStatus, b: ConnectionStatus) => ConnectionStatus;
/** Browser network is gone. Absent `navigator` (Node, Workers) is online. */
export declare const browserOffline: () => boolean;
export interface Session {
    /** One correlated frame out, its reply back. Reconnects and re-auths as needed. */
    request(frame: Record<string, unknown>): Promise<Reply>;
    /** Highest transaction `t` this session has seen — tx/resync frames, read replies, local writes. */
    readonly t: number;
    /** Bumped on every (re)connect, so a waiter can tell a reconnect from a tick. */
    readonly generation: number;
    /**
     * Derived from {@link generation}, {@link connects}, {@link closed} and
     * whether the current socket completed its handshake. Never `"offline"`.
     */
    readonly status: ConnectionStatus;
    /**
     * The peer's latest word on who this socket is — captured from the `auth`
     * ack of an in-place swap, cleared when the socket drops. `undefined` until
     * an ack carries one (the initial principal rides the upgrade unanswered).
     */
    readonly principal: SessionPrincipal | undefined;
    /** Sockets this session has opened. Test hook. */
    readonly connects: number;
    /** Move the basis (a local `transact` is the cheapest possible notification). */
    bump(t: number): void;
    /**
     * Wake waiters without moving `t` — a pending overlay apply, or an ack
     * that replaced a layer at the same confirmed basis.
     */
    nudge(): void;
    /** Bumped by {@link nudge} (paint), not by a basis bump alone. */
    readonly epoch: number;
    /**
     * Called on a basis bump, a paint nudge, a dropped socket, and a
     * handshake that just became live. Returns the unsubscribe.
     */
    onWake(cb: () => void): () => void;
    /** Overlay registers for `{ op: "tx" }` / `{ op: "resync" }`. */
    onPush(cb: (frame: Record<string, unknown>) => void | Promise<void>): () => void;
    /** Close for good; nothing reopens. */
    close(): void;
    /** `true` once {@link close} ran: every request from here on fails at once. */
    readonly closed: boolean;
}
/** `https://peer/…` → `wss://peer/db/:name/session[?token=…]`. */
export declare const sessionUrl: (url: string, name: string, token?: string | undefined) => string;
/** The transport failure a socket that went away produces. */
export declare class SocketGone extends Error {
}
export declare const openSession: (options: SessionOptions) => Session;
//# sourceMappingURL=session.d.ts.map