/** Session socket protocol: inbound frames + the apply-then-push walk. */
import type { Principal, WireDatom } from "../internal/core/index.ts";
import type { WritesMode } from "../writes.ts";
import { WRITES_HEADER } from "../writes.ts";
import type { SessionLog, SessionLogEntry, SessionTxDecision } from "./session-sync.ts";
export { WRITES_HEADER };
/** A frame from the client. `id` correlates the reply; ops mirror the HTTP routes. */
export type ClientFrame = 
/** token refresh — the only frame that is not a sub-request */
{
    id: number;
    op: "auth";
    token: string;
} | {
    id: number;
    op: "transact";
    tx: unknown[];
    clientTxId?: string;
} | {
    id: number;
    op: "operation";
    name: string;
    entity?: unknown;
    input: unknown;
    clientOpId?: string;
}
/** catch-up: walk `(from, now]` and skip empties; resync if the gap is gone or a rule view flipped */
 | {
    id: number;
    op: "sync";
    from: number;
} | {
    id: number;
    op: "q";
    query: string | object;
    inputs?: unknown[];
    asOf?: number;
    history?: boolean;
    explain?: boolean;
    minT?: number;
} | {
    id: number;
    op: "pull";
    eid: number | string | [string, unknown];
    pattern: string | unknown[];
    asOf?: number;
    history?: boolean;
    minT?: number;
} | {
    id: number;
    op: "entity";
    eid: number;
    asOf?: number;
} | {
    id: number;
    op: "info";
};
/** One reply per client frame. `id` is 0 when the frame was too malformed to carry one. */
export interface ReplyFrame {
    id: number;
    status: number;
    body: unknown;
    headers?: Record<string, string>;
}
/** Who a session is, as the wire tells it: `eid` is `null` only when the peer does not provision this principal. */
export interface WirePrincipal {
    eid: number | null;
    class: string;
}
/** The `auth` frame's success reply: the principal was swapped (and, when the session can describe it, who it now is). */
export interface AuthAck {
    id: number;
    ok: true;
    principal?: WirePrincipal;
}
/** Unsolicited: facts this principal may read from one committed tx. */
export interface TxPushFrame {
    op: "tx";
    t: number;
    datoms: WireDatom[];
    /** Writer's own echo only — the session that POSTed this tx. */
    clientTxId?: string;
}
/** Unsolicited: this principal's rule view flipped — drop local state and sieve current. */
export interface ResyncFrame {
    op: "resync";
    t: number;
    datoms?: WireDatom[];
}
/** Diagnostic response headers worth carrying back on a reply (the `x-ramose-*` set the routes set). */
export declare const META_HEADERS: readonly string[];
/** Worker→replica upgrade: the verified principal, so the replica does not re-parse the JWT. */
export declare const PRINCIPAL_HEADER = "x-ramose-principal";
/** The bits of a `WebSocket` a session uses (a Workers / DO server socket). */
export interface SocketLike {
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: "message" | "close" | "error", cb: (ev: any) => void): void;
}
/** Runs one planned frame against HTTP routes; never rejects for a non-2xx. */
export type SessionDispatch = (rest: string, init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
}, principal?: Principal) => Promise<Response>;
/** Hibernation attachment / reconstruct seed. */
export interface SessionState {
    readonly principal?: Principal;
    readonly lastT: number;
    readonly watermark: number;
    readonly writerEcho?: {
        t: number;
        clientTxId: string;
    };
    /** Resolved write mode from the Worker upgrade (`x-ramose-writes`). */
    readonly writes?: WritesMode;
}
export interface SessionOptions {
    dispatch: SessionDispatch;
    /** the principal from the upgrade (`?token=` / `Authorization`) */
    principal?: Principal;
    /** re-verify a token for this same database; rejects when it is refused */
    authenticate?: (token: string) => Promise<Principal>;
    /** `{ eid, class }` for the `auth` ack — the swapped principal's entity, `null` when the peer does not provision this principal */
    describe?: (principal: Principal) => Promise<WirePrincipal>;
    /** peer-owned upsert before the `auth` ack, so the swapped principal has an eid */
    provision?: (principal: Principal) => Promise<Principal>;
    /**
     * Novelty since the current root — used by `{ op: "sync" }` only.
     * Follow is apply-then-push ({@link Session.applyEntry}), not a poller.
     */
    readLog?: () => Promise<SessionLog>;
    /** sieve one unfiltered log entry for this socket's current principal */
    filterEntry?: (entry: SessionLogEntry, principal?: Principal) => Promise<SessionTxDecision>;
    /** current-value dump through the read view — first sync / resync */
    snapshot?: (principal?: Principal) => Promise<{
        t: number;
        datoms: WireDatom[];
    }>;
    /** restore after hibernation */
    seed?: SessionState;
    /**
     * When false, the caller drives {@link Session.onMessage} (hibernating DO
     * `webSocketMessage`). Default true for tests / a Worker-accepted socket.
     */
    listen?: boolean;
}
export interface Session {
    /** Handle one inbound frame. Never rejects; concurrent calls are fine (frames are not serialized). */
    onMessage(data: string | ArrayBuffer): Promise<void>;
    /**
     * Replica apply: walk this one applied frame. The follow cursor is the
     * walked `t` (and the replica's `basisT` after apply). Never stamps a tip
     * that was not applied. Overlapping calls must not snapshot `watermark`
     * at enqueue — each job starts from the cursor as it is when it runs.
     */
    applyEntry(entry: SessionLogEntry, rootT: number): Promise<void>;
    close(): void;
    /** Highest `t` this socket has been told about (does not advance on a skipped empty). */
    readonly lastT: number;
    /**
     * Follow cursor: last `t` this session has **walked** (including sieved
     * skips). Advances only by walking applied novelty in `t` order, or to a
     * snapshot's `t` after a dump. Never jumps to a log tip without that dump.
     */
    readonly watermark: number;
    /** Current principal (upgrade or last successful `auth`). */
    readonly principal: Principal | undefined;
    /** Persist across DO hibernation. */
    state(): SessionState;
    /** Resolves when the socket is closed or errors. */
    readonly closed: Promise<void>;
}
/** A frame, resolved to the sub-request that answers it. */
export interface SessionPlan {
    id: number;
    op: ClientFrame["op"];
    /** path under `/db/:name` — may carry a query string (`/entity/7?asOf=3`) */
    rest: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
}
/** A frame that could not be planned; answered with a 400 reply (the socket stays open). */
export interface PlanError {
    id: number | undefined;
    error: string;
}
/**
 * Frame → sub-request. Pure, and the only place the wire ops map onto routes.
 * Payloads are re-serialized verbatim: whatever encoding the client used for
 * `tx`/`query`/`pattern` is what the route's own `fromJson` sees.
 */
export declare function planOf(frame: unknown): SessionPlan | PlanError;
export declare function parsePrincipalHeader(raw: string | null): Principal | undefined;
/**
 * Wire an accepted socket to dispatch + the apply-then-push walk.
 * The replica is the thing that applies the log and the thing that notifies.
 */
export declare function openSession(socket: SocketLike, options: SessionOptions): Session;
/** After the replica applies one dense `t`, walk every attached session. */
export declare function pushApplied(sessions: Iterable<Session>, entry: SessionLogEntry, rootT: number): Promise<void>;
//# sourceMappingURL=session.d.ts.map