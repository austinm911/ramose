import type { R2Like } from "../storage/index.ts";
import type { AnalyticsEngineDatasetLike } from "./observability.ts";
export interface SqlCursorLike {
    toArray(): Record<string, unknown>[];
}
export interface SqlLike {
    exec(query: string, ...bindings: unknown[]): SqlCursorLike;
}
export interface SocketLike {
    send(data: string): void;
    close?(code?: number, reason?: string): void;
}
export interface TransactorConfig {
    indexTxThreshold: number;
    indexIntervalMs: number;
    indexMaxTxsPerRun: number;
    logKeepTxs: number;
    gcEveryNIndexes: number;
    retainRoots: number;
    maxBatch: number;
    timingYields: boolean;
}
export declare const DEFAULT_CONFIG: TransactorConfig;
export interface TransactorHost {
    readonly dbName: string;
    readonly sql: SqlLike;
    transactionSync<T>(fn: () => T): T;
    readonly bucket: R2Like;
    sockets(): SocketLike[];
    getAlarm(): Promise<number | null>;
    setAlarm(time: number): Promise<void>;
    abort(reason: string): void;
    now(): number;
    readonly config: TransactorConfig;
    readonly analytics?: AnalyticsEngineDatasetLike;
}
//# sourceMappingURL=host.d.ts.map