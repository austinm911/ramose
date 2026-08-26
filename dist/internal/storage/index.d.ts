/**
 * Cloudflare-side storage adapters. Internal to the `ramose` package.
 *
 *  - R2NodeStore: content-addressed segment/dir-node store
 *      peek → in-memory LRU
 *      load → memory → optional SQLite tier (DOs) → optional Cache API (Workers) → R2
 *      put  → encode + gzip + sha256 → R2 (immutable headers), populate caches
 *  - root records: `root/current` (mutable, no-store) and `roots/<t>` (immutable)
 *  - log chunks: `log/<t0>-<t1>` (immutable)
 *
 * R2 layout (spec §2/§5): seg/<hash>, n/<hash>, log/<t0>-<t1>, roots/<t>, root/current
 */
import { type Codec, type IndexId, type LogEntry, type NodeRef, type NodeStore, type RootRecord, type Roots, type TreeNode } from "../core/index.ts";
export declare const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
/**
 * Every logical database lives under its own key prefix in the shared bucket
 * (`db/<name>/seg/…`, `db/<name>/root/current`, …). Segments are still
 * content-addressed *within* a database; not sharing them across databases
 * keeps per-database GC (mark & sweep against that database's roots) safe.
 */
export declare const dbPrefix: (db: string) => string;
/** View of `bucket` where every key is under `prefix` (list results are un-prefixed). */
export declare function prefixedBucket(bucket: R2Like, prefix: string): R2Like;
export declare const ROOT_CACHE_CONTROL = "no-store";
/** Minimal structural type for an R2 bucket binding (avoids a hard dep on workers-types at type level). */
export interface R2Like {
    get(key: string): Promise<{
        arrayBuffer(): Promise<ArrayBuffer>;
        text(): Promise<string>;
        httpMetadata?: any;
    } | null>;
    put(key: string, value: ArrayBuffer | Uint8Array | string, options?: any): Promise<unknown>;
    head(key: string): Promise<unknown | null>;
    delete(keys: string | string[]): Promise<void>;
    list(options?: {
        prefix?: string;
        cursor?: string;
        limit?: number;
    }): Promise<{
        objects: {
            key: string;
            size: number;
        }[];
        truncated: boolean;
        cursor?: string;
    }>;
}
/** Optional durable byte tier (DO SQLite): hash → body. */
export interface ByteTier {
    get(key: string): Uint8Array | undefined | Promise<Uint8Array | undefined>;
    put(key: string, body: Uint8Array): void | Promise<void>;
}
/** Optional Cache API tier (Workers). */
export interface CacheTier {
    match(key: string): Promise<Uint8Array | undefined>;
    put(key: string, body: Uint8Array): Promise<void>;
}
export interface R2StoreStats {
    peekHits: number;
    memHits: number;
    tierHits: number;
    cacheHits: number;
    r2Gets: number;
    r2Puts: number;
    r2PutSkipped: number;
    bytesRead: number;
    bytesWritten: number;
}
export interface R2NodeStoreOptions {
    codec?: Codec;
    /** max decoded nodes held in memory */
    maxNodes?: number;
    tier?: ByteTier;
    cache?: CacheTier;
    /** if true, `put` skips objects that already exist (one HEAD instead of a PUT) — cheaper for big segments */
    headBeforePut?: boolean;
}
export declare class R2NodeStore implements NodeStore {
    readonly bucket: R2Like;
    readonly codec: Codec;
    private readonly mem;
    private readonly maxNodes;
    private readonly tier;
    private readonly cache;
    private readonly headBeforePut;
    private readonly inflight;
    readonly stats: R2StoreStats;
    constructor(bucket: R2Like, opts?: R2NodeStoreOptions);
    peek(hash: string): TreeNode | undefined;
    private remember;
    load(ref: NodeRef): Promise<TreeNode>;
    private loadUncached;
    put(index: IndexId, node: TreeNode): Promise<NodeRef>;
    /** Drop the in-memory node cache (tests / memory pressure). */
    clearMemory(): void;
}
/** Wrap the Workers Cache API as a byte tier keyed by a synthetic URL. */
export declare function cacheApiTier(cache: any, origin?: string): CacheTier;
export declare const ROOT_CURRENT_KEY = "root/current";
export declare const rootKey: (t: number) => string;
export declare function rootsToRecord(roots: Roots, extra: {
    log_watermark: number;
    next_eid: number;
    codec: string;
    created_at?: number;
}): RootRecord;
export declare function recordToRoots(rec: RootRecord): Roots;
export declare function readCurrentRoot(bucket: R2Like): Promise<RootRecord | null>;
export declare function readRootAt(bucket: R2Like, t: number): Promise<RootRecord | null>;
/** Publish: immutable roots/<t> first, then flip root/current. */
export declare function publishRoot(bucket: R2Like, rec: RootRecord): Promise<void>;
/** List retained root records (all `roots/<t>` keys), ascending by t. */
export declare function listRoots(bucket: R2Like): Promise<number[]>;
export declare const logKey: (t0: number, t1: number) => string;
export declare function putLogChunk(bucket: R2Like, entries: readonly LogEntry[], codec?: Codec): Promise<string>;
export interface LogChunkRef {
    key: string;
    t0: number;
    t1: number;
}
export declare function listLogChunks(bucket: R2Like, sinceT?: number): Promise<LogChunkRef[]>;
export declare function readLogChunk(bucket: R2Like, key: string, codec?: Codec): Promise<LogEntry[]>;
/** Read all log entries with t in (sinceT, untilT]. */
export declare function readLogSince(bucket: R2Like, sinceT: number, untilT?: number, codec?: Codec): Promise<LogEntry[]>;
export interface GcResult {
    retainedRoots: number[];
    reachable: number;
    deleted: number;
    scanned: number;
}
/**
 * Delete every seg/ and n/ object unreachable from the retained roots.
 * `retain` decides which roots (by t) to keep — the current root is always kept.
 * Objects newer than `graceMs` are never deleted (in-flight index runs).
 */
export declare function gcSweep(bucket: R2Like, store: NodeStore & {
    load(ref: NodeRef): Promise<TreeNode>;
}, currentT: number, retain: (rootTs: number[]) => number[], opts?: {
    deleteRoots?: boolean;
    dryRun?: boolean;
    graceMs?: number;
}): Promise<GcResult>;
/** Default retention: keep the newest `n` roots plus every root newer than `maxAgeT` transactions ago. */
export declare function retainNewest(n: number): (ts: number[]) => number[];
//# sourceMappingURL=index.d.ts.map