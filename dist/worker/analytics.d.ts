/**
 * Workers Analytics Engine, as an Effect service.
 *
 * `alchemy.run.ts` binds the `ripple_tx` dataset to the Worker under the env
 * name `ANALYTICS` (binding type `analytics_engine`) — physical dataset name
 * pinned so existing telemetry keeps flowing; the product is Ramose — so both
 * this Worker and
 * the two Durable Object classes it exports see `env.ANALYTICS`. The service
 * has the same shape as Alchemy's `Cloudflare.AnalyticsEngine.WriteDataset`
 * client (`writeDataPoint(dp) => Effect<void, DatasetError>`) and is a no-op
 * when the binding is missing, so `bun test`, miniflare and `bun alchemy dev`
 * without the binding still run.
 *
 * `writeDataPoint` is sync and non-blocking on Workers (the point is flushed
 * with the response), so no `ctx.waitUntil` is needed.
 *
 * ---- http point schema (one per request; see `httpPoint`) ----
 *   index1 = db ("-" when the request never resolved a database)
 *   blob1  = "http" (point kind), blob2 = db, blob3 = colo (request.cf.colo),
 *   blob4  = route (transact|query|pull|entity|info|session|admin|health|other),
 *   blob5  = status
 *   double1 = duration_ms, double2 = count (1), double3 = ok (1|0), double4 = err (1|0)
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
export interface DataPoint {
    readonly indexes?: string[];
    readonly blobs?: string[];
    readonly doubles?: number[];
}
/** Runtime shape of an `analytics_engine` binding (structurally the same as
 *  `RamoseEnv["ANALYTICS"]`; kept local so this module needs no workers-types). */
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
export interface AnalyticsClient {
    /** false when the Worker runs without an `ANALYTICS` binding (writes are dropped). */
    readonly bound: boolean;
    writeDataPoint(point: DataPoint): Effect.Effect<void, DatasetError>;
}
declare const Analytics_base: Context.ServiceClass<Analytics, "ramose/worker/Analytics", AnalyticsClient>;
export declare class Analytics extends Analytics_base {
}
/** Client over an `analytics_engine` binding; a no-op client when it is unbound. */
export declare const fromBinding: (binding: AnalyticsEngineDatasetLike | undefined) => AnalyticsClient;
/** The `ANALYTICS` binding, if `alchemy.run.ts` bound one (RamoseEnv gains `ANALYTICS?` separately). */
export declare const bindingOf: (env: unknown) => AnalyticsEngineDatasetLike | undefined;
export type Route = "transact" | "op" | "query" | "pull" | "entity" | "info" | "session" | "admin" | "health" | "other";
/** Route label for a `/db/:name/<rest>` suffix (or a non-db path). */
export declare function routeOf(rest: string, method: string): Route;
/** One point per HTTP request (columns documented at the top of this file). */
export declare function httpPoint(o: {
    db?: string;
    colo?: string;
    route: Route;
    status: number;
    ms: number;
}): DataPoint;
export {};
//# sourceMappingURL=analytics.d.ts.map