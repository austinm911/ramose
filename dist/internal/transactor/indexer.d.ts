/**
 * Alarm-driven incremental indexer (M4) running inside the Transactor DO.
 *
 * Trigger: log ≥ txThreshold transactions since the last root, or age ≥ intervalMs.
 * Each run merges a *bounded* slice of the log (≤ maxTxsPerRun txs) into new
 * segment trees with structural sharing (only touched paths are rewritten),
 * flushes that slice to `log/<t0>-<t1>` in R2, publishes `roots/<t>` then flips
 * `root/current`, notifies subscribers, prunes the SQLite log, and every N runs
 * marks-and-sweeps GC against the retained roots.
 *
 * Seam for the future: `mergeSlice` is the only CPU-heavy step; it can be
 * moved to a Workflow / Container by handing it (roots, log range) and
 * receiving new roots back — nothing else here needs to change.
 */
import { type RootRecord, txFrame } from "../core/index.ts";
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
    private running;
    private runs;
    private lastRun;
    private lastGc;
    private readonly log;
    constructor(t: Transactor, opts: IndexerOptions);
    private get db();
    status(): {
        running: boolean;
        runs: number;
        lastRun: IndexRunResult | undefined;
        lastGc: unknown;
        opts: IndexerOptions;
    };
    /** Called after each commit batch: run soon if the log is large, else make sure an alarm exists. */
    maybeSchedule(): Promise<void>;
    /** Ensure a periodic alarm is set. */
    schedule(): Promise<void>;
    onAlarm(): Promise<void>;
    runNow(): Promise<IndexRunResult>;
    private runOnce;
    gcNow(): Promise<import("../storage/index.ts").GcResult>;
}
export { txFrame };
//# sourceMappingURL=indexer.d.ts.map