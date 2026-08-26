/**
 * QueryReplica Durable Object (M5) — N per database, sharded by region/tenant.
 *
 * - Holds a WebSocket to the Transactor (resume-from-watermark on reconnect,
 *   gap detection via `t` continuity, catch-up from the transactor's /log or
 *   from R2 `log/` chunks).
 * - Keeps novelty since the current root sorted in memory and spilled to
 *   SQLite (survives eviction/restart without a full resync).
 * - Caches hot segments in SQLite (`segcache`) in front of R2.
 * - Serves `GET /basis` → { t, root, novelty } to Workers, and executes
 *   reads itself (`POST /query`: datalog / pull / entity) — the Worker's
 *   read path forwards here instead of running datalog in the Worker.
 * - Drops novelty ≤ new root on root flip.
 *
 * Workers never talk to the Transactor for reads (invariant §1.5).
 */
import { DurableObject } from "cloudflare:workers";
import { type RamoseEnv } from "../transactor/index.ts";
export declare class QueryReplicaDO extends DurableObject<RamoseEnv> {
    private readonly sql;
    private ready;
    private store;
    private dbName;
    private root;
    private entries;
    private ws;
    private connecting;
    private syncing;
    readonly stats: {
        frames: number;
        gaps: number;
        reconnects: number;
        rootFlips: number;
        basisServed: number;
        queries: number;
        budgetAborts: number;
    };
    private readonly log;
    /** Live session protocol objects (rebuilt from hibernation attachments). */
    private readonly live;
    constructor(ctx: DurableObjectState, env: RamoseEnv);
    private init;
    private boot;
    /** Per-database view of the bucket (all keys under db/<name>/). */
    private bucket;
    private bindStore;
    private getMeta;
    private setMeta;
    get basisT(): number;
    private appendEntry;
    /**
     * Apply one dense log frame, then walk every attached session. The follow
     * cursor is `basisT` after this returns — it does not move on a poll.
     */
    private applyDatoms;
    private adoptRoot;
    private handleFrame;
    /** Fetch (from, to] from the transactor's HTTP /log, falling back to R2 chunks. */
    private fillGap;
    /** Read log/ chunks from R2 for t in (from, to] and apply in order. */
    private catchUpFromR2;
    /** Establish (or re-establish) the WS subscription to the Transactor. */
    private ensureConnected;
    private connectUpstream;
    /** Make sure we are connected and caught up (bounded wait). */
    private sync;
    private sessionLog;
    private sieve;
    private snapshotView;
    /** Upsert the caller's row on the writer and attach the eid. */
    private provisionPrincipal;
    private createSession;
    private sessionOf;
    private persist;
    private notifySessions;
    private sessionDispatch;
    private upgradeSession;
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
    webSocketClose(ws: WebSocket, code: number): Promise<void>;
    fetch(request: Request): Promise<Response>;
    private route;
}
//# sourceMappingURL=replica-do.d.ts.map