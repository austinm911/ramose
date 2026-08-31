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
export declare function logEvent(component: Component, event: string, fields?: Record<string, unknown>, level?: LogLevel): void;
export declare function componentLogger(component: Component, base?: Record<string, unknown> | (() => Record<string, unknown>)): {
    debug: (event: string, fields?: Record<string, unknown>) => void;
    info: (event: string, fields?: Record<string, unknown>) => void;
    warn: (event: string, fields?: Record<string, unknown>) => void;
    error: (event: string, fields?: Record<string, unknown>) => void;
};
export type Logger = ReturnType<typeof componentLogger>;
export declare class Histogram {
    private readonly buckets;
    private readonly counts;
    count: number;
    sum: number;
    max: number;
    constructor(buckets?: number[]);
    observe(x: number): void;
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
export declare class RateMeter {
    readonly windowMs: number;
    private readonly at;
    private readonly n;
    private head;
    total: number;
    constructor(windowMs?: number);
    private prune;
    mark(n?: number, at?: number): void;
    rate(at?: number): number;
}
//# sourceMappingURL=telemetry.d.ts.map