/**
 * Basis: what a peer needs to build a `Db` value without talking to the
 * Transactor — the current root record plus the novelty since that root.
 * Served by QueryReplica DOs (`GET /basis`), consumed by Workers.
 */
import { Db, type LogEntry, type NodeSource, type NoveltyFrameV1, type RootRecord } from "../core/index.ts";
export interface Basis {
    v: 1;
    /** logical database name */
    db: string;
    /** basis t = last novelty t (or root.t) */
    t: number;
    root: RootRecord;
    /** transactions with t > root.t, ascending */
    novelty: NoveltyFrameV1[];
    /** replica id that served this basis */
    replica?: string;
}
export declare function makeBasis(db: string, root: RootRecord, entries: readonly LogEntry[], replica?: string): Basis;
/** Build an immutable Db value from a basis over the given segment source. */
export declare function dbFromBasis(store: NodeSource, basis: Basis, opts?: {
    asOf?: number;
    history?: boolean;
}): Promise<Db>;
//# sourceMappingURL=basis.d.ts.map