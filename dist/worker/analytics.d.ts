import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
export interface DataPoint {
    readonly indexes?: string[];
    readonly blobs?: string[];
    readonly doubles?: number[];
}
export interface AnalyticsEngineDatasetLike {
    writeDataPoint(point: DataPoint): void;
}
declare const DatasetError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "DatasetError";
} & Readonly<A>;
export declare class DatasetError extends DatasetError_base<{
    readonly message: string;
    readonly cause?: unknown;
}> {
}
export declare const classifyDatasetError: (cause: unknown) => DatasetError;
export interface AnalyticsClient {
    readonly bound: boolean;
    writeDataPoint(point: DataPoint): Effect.Effect<void, DatasetError>;
}
declare const Analytics_base: Context.ServiceClass<Analytics, "ramose/worker/Analytics", AnalyticsClient>;
export declare class Analytics extends Analytics_base {
}
export declare const fromBinding: (binding: AnalyticsEngineDatasetLike | undefined) => AnalyticsClient;
export declare const bindingOf: (env: unknown) => AnalyticsEngineDatasetLike | undefined;
export type Route = "transact" | "op" | "query" | "pull" | "entity" | "live" | "replicate" | "info" | "session" | "admin" | "health" | "other";
export declare function routeOf(rest: string, method: string): Route;
export declare function httpPoint(o: {
    db?: string;
    colo?: string;
    route: Route;
    status: number;
    ms: number;
}): DataPoint;
export {};
//# sourceMappingURL=analytics.d.ts.map