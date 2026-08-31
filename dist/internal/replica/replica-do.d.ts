import { DurableObject } from "cloudflare:workers";
import { type LogEntry, type RootRecord } from "../core/index.ts";
import { R2NodeStore } from "../storage/index.ts";
import { type RamoseEnv } from "../transactor/index.ts";
type BasisWatchAttachment = {
    readonly kind: "basis-watch";
    readonly expectedDeployment: string;
    readonly healthUrl: string;
};
export declare function requestedMinT(raw: string | null | undefined): number | undefined;
export declare class QueryReplicaDOBase extends DurableObject<RamoseEnv> {
    private readonly sql;
    private ready;
    protected store: R2NodeStore;
    protected dbName: string | undefined;
    protected root: RootRecord | undefined;
    protected entries: LogEntry[];
    protected ws: WebSocket | undefined;
    private connecting;
    private syncing;
    private applyChain;
    private reconnectTimer;
    private reconnectDelayMs;
    private watchTimer;
    private lastUpstreamAt;
    protected readonly stats: {
        frames: number;
        gaps: number;
        reconnects: number;
        rootFlips: number;
        basisServed: number;
        queries: number;
        budgetAborts: number;
    };
    protected readonly log: {
        debug: (event: string, fields?: Record<string, unknown>) => void;
        info: (event: string, fields?: Record<string, unknown>) => void;
        warn: (event: string, fields?: Record<string, unknown>) => void;
        error: (event: string, fields?: Record<string, unknown>) => void;
    };
    constructor(ctx: DurableObjectState, env: RamoseEnv);
    protected init(): Promise<void>;
    private boot;
    private bucket;
    private bindStore;
    private getMeta;
    private setMeta;
    protected get basisT(): number;
    private appendEntry;
    protected beforeApplyDatoms(_entry: LogEntry): Promise<void>;
    protected notifyAppliedEntry(entry: LogEntry): Promise<void>;
    private applyDatoms;
    private adoptRoot;
    private handleFrame;
    private fillGap;
    private catchUpFromR2;
    private ensureConnected;
    private connectUpstream;
    private listening;
    private scheduleReconnect;
    protected armWatch(): void;
    private tickWatch;
    private enqueue;
    private enqueueFrame;
    private onUpstreamData;
    private drainFrames;
    protected catchUpTo(minT: number | undefined, signal?: AbortSignal): Promise<void>;
    protected sync(): Promise<void>;
    protected basisWatchOf(ws: WebSocket): BasisWatchAttachment | undefined;
    private basisWatches;
    private armDeploymentWatch;
    private notifyBasisWatches;
    protected closeBasisWatches(reason: string): void;
    private upgradeBasisWatch;
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
    webSocketClose(ws: WebSocket, code: number): Promise<void>;
    alarm(): Promise<void>;
    fetch(request: Request): Promise<Response>;
    private serveServerIdentityRoot;
    private serverIdentityQuarantine;
    protected route(request: Request, url: URL, dbName: string): Promise<Response>;
}
export declare class QueryReplicaDO extends QueryReplicaDOBase {
    constructor(ctx: DurableObjectState, env: RamoseEnv);
}
export {};
//# sourceMappingURL=replica-do.d.ts.map