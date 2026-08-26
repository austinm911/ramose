/**
 * Structured logs / metrics for every Ramose component.
 *
 * One JSON object per line on the default sink (`console.log`), which is what
 * Workers/DO observability ingests, so `wrangler tail`, Logpush or the local
 * `alchemy dev` console all show queryable events. Nothing here is a
 * dashboard: it is the minimum needed to see tx/s, batch sizes, index run
 * durations, novelty sizes and query aborts.
 *
 *   { ts, level, component, event, db?, ...fields }
 *
 * `setTelemetrySink` swaps the sink (tests capture events; a Worker can fan
 * out to Analytics Engine); `setTelemetryLevel` filters. Both are process-wide
 * by design — one isolate, one stream.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type Component = "transactor" | "indexer" | "replica" | "peer" | "core";
export interface TelemetryEvent {
    ts: number;
    level: LogLevel;
    component: Component;
    event: string;
    db?: string;
    [field: string]: unknown;
}
export type TelemetrySink = (e: TelemetryEvent) => void;
export declare function setTelemetrySink(s: TelemetrySink | undefined): void;
export declare function setTelemetryLevel(level: LogLevel): void;
export declare function setTelemetryClock(clock: () => number): void;
export declare function telemetryLevel(): LogLevel;
/** Emit one event (dropped if below the configured level). */
export declare function logEvent(component: Component, event: string, fields?: Record<string, unknown>, level?: LogLevel): void;
/** Convenience: a component-bound logger with an optional fixed `db` field. */
export declare function componentLogger(component: Component, base?: Record<string, unknown> | (() => Record<string, unknown>)): {
    debug: (event: string, fields?: Record<string, unknown>) => void;
    info: (event: string, fields?: Record<string, unknown>) => void;
    warn: (event: string, fields?: Record<string, unknown>) => void;
    error: (event: string, fields?: Record<string, unknown>) => void;
};
export type Logger = ReturnType<typeof componentLogger>;
/**
 * Small fixed-bucket histogram for latencies / batch sizes: cheap to update,
 * summarised into p50/p95/p99/max for `/info` snapshots.
 */
export declare class Histogram {
    private readonly buckets;
    private readonly counts;
    count: number;
    sum: number;
    max: number;
    constructor(buckets?: number[]);
    observe(x: number): void;
    /** Upper bound of the bucket holding the p-th percentile (Infinity for the overflow bucket). */
    percentile(p: number): number;
    snapshot(): {
        count: number;
        mean: number;
        p50: number;
        p95: number;
        p99: number;
        max: number;
    };
}
/** Events-per-second meter over a sliding window (for tx/s, queries/s in /info). */
export declare class RateMeter {
    readonly windowMs: number;
    private readonly at;
    private readonly n;
    private head;
    total: number;
    constructor(windowMs?: number);
    private prune;
    mark(n?: number, at?: number): void;
    /** events per second over the window ending at `at` */
    rate(at?: number): number;
}
//# sourceMappingURL=telemetry.d.ts.map