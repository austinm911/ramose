import { Db, type LogEntry, type NodeSource, type NoveltyFrameV1, type RootRecord } from "../core/index.ts";
export interface Basis {
    v: 1;
    db: string;
    t: number;
    root: RootRecord;
    novelty: NoveltyFrameV1[];
    replica?: string;
}
export declare function makeBasis(db: string, root: RootRecord, entries: readonly LogEntry[], replica?: string): Basis;
export declare function dbFromBasis(store: NodeSource, basis: Basis, opts?: {
    asOf?: number;
    history?: boolean;
}): Promise<Db>;
//# sourceMappingURL=basis.d.ts.map