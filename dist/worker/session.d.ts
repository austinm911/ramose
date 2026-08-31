import type { WireDatom } from "../internal/core/index.ts";
import type { Principal } from "./auth.ts";
import type { WritesMode } from "../writes.ts";
import { WRITES_HEADER } from "../writes.ts";
import type { SessionLog, SessionLogEntry, SessionTxDecision } from "./session-sync.ts";
export { WRITES_HEADER };
export type ClientFrame = {
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
} | {
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
export interface ReplyFrame {
    id: number;
    status: number;
    body: unknown;
    headers?: Record<string, string>;
}
export interface WirePrincipal {
    eid: number | null;
    class: string;
}
export interface AuthAck {
    id: number;
    ok: true;
    principal?: WirePrincipal;
}
export interface TxPushFrame {
    op: "tx";
    t: number;
    datoms: WireDatom[];
    clientTxId?: string;
}
export interface ResyncFrame {
    op: "resync";
    t: number;
    datoms?: WireDatom[];
}
export declare const META_HEADERS: readonly string[];
export declare const PRINCIPAL_HEADER = "x-ramose-principal";
export declare const TEST_SESSION_TOKEN_HEADER = "x-ramose-test-session-token";
export interface SocketLike {
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: "message" | "close" | "error", cb: (ev: any) => void): void;
}
export type SessionDispatch = (rest: string, init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
}, principal?: Principal) => Promise<Response>;
export interface SessionState {
    readonly principal?: Principal;
    readonly lastT: number;
    readonly watermark: number;
    readonly writerEcho?: {
        t: number;
        clientTxId: string;
    };
    readonly writes?: WritesMode;
}
export interface SessionOptions {
    dispatch: SessionDispatch;
    principal?: Principal;
    authenticate?: (token: string) => Promise<Principal>;
    describe?: (principal: Principal) => Promise<WirePrincipal>;
    provision?: (principal: Principal) => Promise<Principal>;
    readLog?: () => Promise<SessionLog>;
    filterEntry?: (entry: SessionLogEntry, principal?: Principal) => Promise<SessionTxDecision>;
    snapshot?: (principal?: Principal) => Promise<{
        t: number;
        datoms: WireDatom[];
    }>;
    seed?: SessionState;
    listen?: boolean;
}
export interface Session {
    onMessage(data: string | ArrayBuffer): Promise<void>;
    applyEntry(entry: SessionLogEntry, rootT: number): Promise<void>;
    close(): void;
    readonly lastT: number;
    readonly watermark: number;
    readonly principal: Principal | undefined;
    state(): SessionState;
    readonly closed: Promise<void>;
}
export interface SessionPlan {
    id: number;
    op: ClientFrame["op"];
    rest: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
}
export interface PlanError {
    id: number | undefined;
    error: string;
}
export declare const sessionPrincipalExpired: (principal: Principal, nowMs?: number) => boolean;
export declare function planOf(frame: unknown): SessionPlan | PlanError;
export declare function parsePrincipalHeader(raw: string | null): Principal | undefined;
export declare function openSession(socket: SocketLike, options: SessionOptions): Session;
export declare function pushApplied(sessions: Iterable<Session>, entry: SessionLogEntry, rootT: number): Promise<void>;
//# sourceMappingURL=session.d.ts.map