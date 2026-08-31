export interface AnalyticsEngineDatasetLike {
    writeDataPoint(dataPoint: {
        indexes?: string[];
        blobs?: string[];
        doubles?: number[];
    }): void;
}
export interface BatchPoint {
    db: string;
    resolveMs: number;
    commitMs: number;
    batchSize: number;
    queueDepth: number;
    noveltyDatoms: number;
    txOk: number;
    txErr: number;
    fenceMs?: number;
}
export interface IndexPoint {
    db: string;
    indexMs: number;
    txs: number;
    datoms: number;
    noveltyDatoms: number;
}
export declare class TxMetrics {
    private readonly dataset?;
    writes: number;
    errors: number;
    colo: string;
    constructor(dataset?: AnalyticsEngineDatasetLike | undefined);
    get enabled(): boolean;
    observeColo(colo: string | undefined | null): void;
    batch(p: BatchPoint): void;
    index(p: IndexPoint): void;
    snapshot(): {
        enabled: boolean;
        colo: string;
        aeWrites: number;
        aeErrors: number;
    };
    private write;
}
//# sourceMappingURL=observability.d.ts.map