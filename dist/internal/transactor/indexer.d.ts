import { type RootRecord, txFrame } from "../core/index.ts";
import { type RuntimeBoundaries } from "../runtime-boundaries.ts";
import type { Transactor } from "./transactor.ts";
export interface IndexerOptions {
    intervalMs: number;
    txThreshold: number;
    maxTxsPerRun: number;
    logKeepTxs: number;
    gcEveryN: number;
    retainRoots: number;
}
export interface IndexRunResult {
    ran: boolean;
    fromT: number;
    toT: number;
    txs: number;
    datoms: number;
    ms: number;
    r2Puts: number;
    remainingTxs: number;
    root?: RootRecord;
}
export declare class Indexer {
    private readonly t;
    readonly opts: IndexerOptions;
    private readonly boundaries;
    private running;
    private runs;
    private lastRun;
    private lastGc;
    private readonly log;
    constructor(t: Transactor, opts: IndexerOptions, boundaries?: RuntimeBoundaries);
    private get db();
    status(): {
        running: boolean;
        runs: number;
        lastRun: IndexRunResult | undefined;
        lastGc: unknown;
        opts: IndexerOptions;
    };
    maybeSchedule(): Promise<void>;
    schedule(): Promise<void>;
    onAlarm(): Promise<void>;
    runNow(): Promise<IndexRunResult>;
    private runOnce;
    gcNow(): Promise<import("../storage/index.ts").GcResult>;
}
export { txFrame };
//# sourceMappingURL=indexer.d.ts.map