/**
 * Transactor — the single writer of one logical Ramose database.
 *
 * Runtime-agnostic (see host.ts): the Durable Object shell and the Bun test
 * harness both drive this class.
 *
 *   validate against schema → resolve tempids / uniques (reads via its own
 *   segment source + own novelty) → assign monotonic `t` → GROUP COMMIT to
 *   the SQL log → ack → broadcast novelty frames → (alarm) incremental index.
 *
 * Group commit: every transaction that arrives while a storage write is in
 * flight (or while the current batch is being resolved) is coalesced into the
 * next single SQL write. `t` is assigned in arrival order and persisted in
 * the same order, so the durable log never has gaps or duplicates: a batch
 * either lands entirely or not at all, and if it does not land the instance
 * is aborted and rebuilt from durable state (in-memory `t` is discarded).
 *
 * HTTP surface (the DO shell forwards `fetch` here; `/subscribe` upgrades are
 * done by the shell, which then calls `onSubscribe`):
 *   POST /transact   { tx: TxData, clientTxId? }   → { t, txEid, tempids, datoms: WireDatom[], clientTxId? }
 *   POST /provision  { principal }                 → { eid, class }  (peer-owned upsert)
 *   GET  /info                        → { t, root, novelty, logWatermark, ... }
 *   GET  /log?from=&to=               → { entries: NoveltyFrameV1[] }
 *   POST /admin/index                 → run the indexer now
 *   POST /admin/gc                    → run GC now
 */
import { Connection, type LogEntry, type RootRecord, type TxData, Histogram, type Principal, type WireDatom, RateMeter } from "../core/index.ts";
import { R2NodeStore } from "../storage/index.ts";
import { TransactorDeadError } from "./errors.ts";
import { type SocketLike, type TransactorHost } from "./host.ts";
import { TxMetrics } from "./observability.ts";
export { TransactorDeadError };
export interface TxAck {
    t: number;
    txEid: number;
    tempids: Record<string, number>;
    /** facts that landed, already filtered for this principal */
    datoms: WireDatom[];
    clientTxId?: string;
    /** Encoded operation output; present when this ack is an operation replay. */
    output?: unknown;
}
export interface TransactorStats {
    txs: number;
    batches: number;
    maxBatch: number;
    rejected: number;
    indexRuns: number;
    broadcasts: number;
    /** ms spent inside the storage write (group commit) */
    commitMs: number;
    /** ms spent resolving txs in memory (validate/tempids/uniques) */
    resolveMs: number;
    /** ms of wall clock per batch from dequeue to ack ("other" = loopMs - resolveMs - commitMs) */
    loopMs: number;
    /**
     * ms measured by the per-batch calibration fence (config.timingYields only;
     * 0 when off). Each timed section is closed by one such fence, so the fence's
     * own latency is the bias of resolveMs/commitMs: corrected ≈ x - fenceMs/batches.
     */
    fenceMs: number;
}
/** Replay keys are per writer: a foreign principal must not see someone else's filtered ack. */
export declare function clientTxReplayKey(principal: Principal | undefined, id: string): string;
export declare class Transactor {
    readonly host: TransactorHost;
    private ready;
    private conn;
    private store;
    private rootRecord;
    private logWatermark;
    private queue;
    private committing;
    private indexer;
    private txSinceIndex;
    private dead;
    /** recent `clientTxReplayKey(principal, clientTxId)` → original ack; replay must not assign a second `t` */
    private readonly recentAcks;
    /** persisted operation acks (includes `output`); loaded from `meta.op_acks` */
    private readonly recentOpAcks;
    readonly stats: TransactorStats;
    /** metrics: tx/s over the last 10 s, batch-size and commit-latency distributions */
    readonly txRate: RateMeter;
    readonly batchSizes: Histogram;
    readonly commitLatency: Histogram;
    /** per-batch resolve time and dequeue→ack wall time (commit time is `commitLatency`) */
    readonly resolveLatency: Histogram;
    readonly loopLatency: Histogram;
    /** cost of one event-loop fence, measured once per batch when config.timingYields is on */
    readonly fenceLatency: Histogram;
    /** Analytics Engine sink (no-op when the host has no dataset bound) */
    readonly metrics: TxMetrics;
    private readonly log;
    constructor(host: TransactorHost);
    /** Idempotent: load durable state (or bootstrap a fresh database). */
    init(): Promise<void>;
    private boot;
    private getMeta;
    private setMeta;
    private appendLogRow;
    /** Log entries with from < t <= to (ascending). */
    readLogEntries(from: number, to?: number, limit?: number): LogEntry[];
    private readLogDatoms;
    /** Lowest t still present in the SQL log (0 if empty). */
    earliestLogT(): number;
    pruneLog(throughT: number): number;
    get connection(): Connection;
    get nodeStore(): R2NodeStore;
    get bucket(): import("../storage/index.ts").R2Like;
    get currentRootRecord(): RootRecord;
    get watermark(): number;
    get t(): number;
    get txsSinceIndex(): number;
    get isDead(): boolean;
    /** Called by the indexer after publishing a new root. */
    adoptRoot(rec: RootRecord): void;
    /** Submit a transaction. Resolves once it is durably committed. */
    transact(tx: TxData, principal?: Principal, clientTxId?: string, extras?: {
        readonly opOutput?: unknown;
        readonly system?: boolean;
        readonly fromOperation?: boolean;
    }): Promise<TxAck>;
    /**
     * Upsert the caller's principal row (and role fact) and return the resolved
     * eid. Idempotent. Anonymous / service principals stay `{ eid: null }`.
     */
    provision(principal?: Principal): Promise<{
        eid: number | null;
        class: string;
    }>;
    private rememberAck;
    lookupOpAck(principal: Principal | undefined, clientOpId: string): TxAck | undefined;
    private takeBatch;
    private commitLoop;
    /**
     * Peer-owned upsert of the caller's row, committed on this writer *before*
     * the client tx is authorized. Same group-commit batch; earlier `t`.
     */
    private applyProvision;
    /** The authoritative write check: runs against `this.conn.db()` and returns the ops to transact. */
    private authorize;
    /** Ack facts the writer may read, judged against the post-commit unfiltered db. */
    private ackDatoms;
    /** A unique conflict names the entity and value it collided with — a read leak under a policy. */
    private scrub;
    private die;
    private broadcast;
    /** New subscriber: hello + catch-up from `from` (exclusive). */
    onSubscribe(ws: SocketLike, from: number): void;
    /** Subscriber control message (resume / ping). */
    onSocketMessage(ws: SocketLike, message: string | ArrayBuffer): void;
    private sendCatchUp;
    onAlarm(): Promise<void>;
    info(): {
        t: number;
        root: RootRecord;
        novelty: number;
        txsSinceIndex: number;
        logWatermark: number;
        earliestLogT: number;
        nextEid: number;
        subscribers: number;
        opts: {
            timingYields: boolean;
            maxBatch: number;
        };
        stats: TransactorStats;
        metrics: {
            enabled: boolean;
            colo: string;
            aeWrites: number;
            aeErrors: number;
            txPerSec: number;
            batchSize: {
                count: number;
                mean: number;
                p50: number;
                p95: number;
                p99: number;
                max: number;
            };
            commitMs: {
                count: number;
                mean: number;
                p50: number;
                p95: number;
                p99: number;
                max: number;
            };
            avgBatch: number;
            resolveMs: number;
            loopMs: number;
            batchResolveMs: {
                count: number;
                mean: number;
                p50: number;
                p95: number;
                p99: number;
                max: number;
            };
            batchCommitMs: {
                count: number;
                mean: number;
                p50: number;
                p95: number;
                p99: number;
                max: number;
            };
            batchLoopMs: {
                count: number;
                mean: number;
                p50: number;
                p95: number;
                p99: number;
                max: number;
            };
            fenceMs: {
                count: number;
                mean: number;
                p50: number;
                p95: number;
                p99: number;
                max: number;
            };
            noveltyDatoms: number;
            queueDepth: number;
        };
        store: import("../storage/index.ts").R2StoreStats;
        indexer: {
            running: boolean;
            runs: number;
            lastRun: import("./indexer.ts").IndexRunResult | undefined;
            lastGc: unknown;
            opts: import("./indexer.ts").IndexerOptions;
        };
    };
    /**
     * Route dispatch as an Effect program: every route runs inside
     * `Effect.tryPromise`, whatever it throws is classified into a tagged error
     * (errors.ts) and `Effect.catchTags` maps each tag to the same status/body
     * the pre-Effect handler produced. Only the boundary is effectful — the
     * resolve/commit loop above stays plain async/await.
     *
     * The WebSocket `/subscribe` upgrade never reaches here (the DO shell owns it).
     */
    handleRequest(request: Request): Promise<Response>;
    private route;
}
//# sourceMappingURL=transactor.d.ts.map