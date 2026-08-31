import { type Datom, type IndexId } from "./datom.ts";
import { Db, type Roots } from "./db.ts";
import { Novelty } from "./novelty.ts";
import { Schema } from "./schema.ts";
import { type BuildOptions, type NodeSource, type NodeStore } from "./tree.ts";
import type { CompositionIndex } from "./composition.ts";
import { type ExpandedOp, type TxData } from "./tx.ts";
export interface TxReport {
    dbBefore: Db;
    dbAfter: Db;
    t: number;
    txEid: number;
    txData: Datom[];
    txOps: ExpandedOp[];
    tempids: Record<string, number>;
}
export interface ValidatedTxReport<A> {
    readonly report: TxReport;
    readonly value: A;
}
export interface ConnectionOptions {
    store?: NodeStore;
    build?: BuildOptions;
    now?: () => number;
    composition?: CompositionIndex;
}
export declare function sortForIndex(index: IndexId, datoms: readonly Datom[]): Datom[];
export declare function emptyRoots(store: NodeStore, build?: BuildOptions): Promise<Roots>;
export declare function buildRoots(store: NodeStore, schema: Schema, datoms: readonly Datom[], build?: BuildOptions): Promise<Roots>;
export declare function deriveSchema(store: NodeSource, roots: Roots): Promise<Schema>;
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
    private composition;
    private txQueue;
    readonly rootHistory: Roots[];
    private constructor();
    static create(opts?: ConnectionOptions): Promise<Connection>;
    static restore(store: NodeStore, roots: Roots, logDatoms: readonly Datom[], nextEid: number, opts?: ConnectionOptions): Promise<Connection>;
    static fromDatoms(datoms: readonly Datom[], opts?: ConnectionOptions): Promise<Connection>;
    db(): Db;
    get t(): number;
    get currentRoots(): Roots;
    get noveltyCount(): number;
    get schemaView(): Schema;
    get nextEntityId(): number;
    bindComposition(composition: CompositionIndex): void;
    applyDatoms(datoms: readonly Datom[]): void;
    transactValidated<A>(txData: TxData, validate: (report: TxReport) => Promise<A> | A, txInstant?: number, beforeApply?: () => void): Promise<ValidatedTxReport<A>>;
    transact(txData: TxData): Promise<TxReport>;
    index(upToT?: number): Promise<Roots>;
    dbAtRoot(roots: Roots): Db;
}
//# sourceMappingURL=conn.d.ts.map