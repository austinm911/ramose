/**
 * In-memory `Connection`: the single-writer state machine over a `NodeStore`.
 *
 *   conn.transact(txData) → TxReport      (validates, assigns t, appends to novelty)
 *   conn.db()             → Db            (immutable snapshot)
 *   conn.index()          → Roots         (merge novelty into the trees; structural sharing)
 *
 * The Transactor DO reuses exactly this logic on top of its SQLite log and
 * the R2-backed store; the QueryReplica/peer use `Db` directly with roots +
 * novelty received over the wire.
 */
import { type Datom, type IndexId } from "./datom.ts";
import { Db, type Roots } from "./db.ts";
import { Novelty } from "./novelty.ts";
import { Schema } from "./schema.ts";
import { type BuildOptions, type NodeSource, type NodeStore } from "./tree.ts";
import { type TxData } from "./tx.ts";
export interface TxReport {
    dbBefore: Db;
    dbAfter: Db;
    t: number;
    txEid: number;
    txData: Datom[];
    tempids: Record<string, number>;
}
export interface ConnectionOptions {
    store?: NodeStore;
    build?: BuildOptions;
    /** clock for :db/txInstant */
    now?: () => number;
}
/** Sort + dedup datoms for the given index. */
export declare function sortForIndex(index: IndexId, datoms: readonly Datom[]): Datom[];
export declare function emptyRoots(store: NodeStore, build?: BuildOptions): Promise<Roots>;
/**
 * Build roots from a full datom set (bootstrap / bulk load). `schema` decides
 * AVET/VAET membership. `t` = max t in the set.
 */
export declare function buildRoots(store: NodeStore, schema: Schema, datoms: readonly Datom[], build?: BuildOptions): Promise<Roots>;
/**
 * Re-derive the schema from indexed datoms: every entity with a `:db/ident`
 * is loaded from EAVT (attribute entities are few, so this is cheap) and
 * projected through `Schema.apply`.
 */
export declare function deriveSchema(store: NodeSource, roots: Roots): Promise<Schema>;
/** Merge novelty into existing roots (the indexer's core step). */
export declare function mergeRoots(store: NodeStore, roots: Roots, novelty: Novelty, maxT: number, build?: BuildOptions): Promise<Roots>;
export declare class Connection {
    readonly store: NodeStore;
    private roots;
    private novelty;
    private schema;
    private basisT;
    private nextEid;
    private readonly build;
    private readonly now;
    private txQueue;
    /** all roots ever published, by t (for as-of from an old root; GC keeps these) */
    readonly rootHistory: Roots[];
    private constructor();
    /** Create an empty database (bootstrap schema installed at t = 1). */
    static create(opts?: ConnectionOptions): Promise<Connection>;
    /**
     * Restore a connection from persisted state (roots + un-indexed datoms).
     * `schemaDatoms` are not needed separately: the schema is re-derived by
     * scanning the attribute range of EAVT — cheap because attribute entities
     * are few and sort first.
     */
    static restore(store: NodeStore, roots: Roots, logDatoms: readonly Datom[], nextEid: number, opts?: ConnectionOptions): Promise<Connection>;
    /** Bulk-load a database from a datom set (bench/bootstrap): builds trees directly. */
    static fromDatoms(datoms: readonly Datom[], opts?: ConnectionOptions): Promise<Connection>;
    db(): Db;
    get t(): number;
    get currentRoots(): Roots;
    get noveltyCount(): number;
    get schemaView(): Schema;
    get nextEntityId(): number;
    /** Apply already-processed datoms (log replay / follower). */
    applyDatoms(datoms: readonly Datom[]): void;
    /** Transact. Serialized: concurrent callers are queued (single writer). */
    transact(txData: TxData): Promise<TxReport>;
    /**
     * Index: merge all novelty (t <= basisT) into new trees, publish new roots,
     * and drop merged novelty. Old Db values keep the old novelty object.
     */
    index(upToT?: number): Promise<Roots>;
    /** Db value as of an old root (uses only that root; novelty ignored). */
    dbAtRoot(roots: Roots): Db;
}
//# sourceMappingURL=conn.d.ts.map