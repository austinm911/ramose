declare const ClientConfigurationError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ClientConfigurationError";
} & Readonly<A>;
/**
 * `createClient` was handed configuration it cannot bind: a server URL that is
 * not one plain origin, an empty or path-shaped root route, or a value that is
 * not an installed catalog definition.
 *
 * Raised synchronously from `createClient`, because none of these can become
 * valid later.
 */
export declare class ClientConfigurationError extends ClientConfigurationError_base<{
    readonly message: string;
}> {
}
declare const ClientClosedError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ClientClosedError";
} & Readonly<A>;
/**
 * The client is terminal. A terminal client never repopulates storage, so the
 * application constructs a new one.
 *
 * - `closed` — `close()` released it.
 * - `cleared` — `clearLocalData()` deleted the scope it was bound to.
 * - `fenced` — destructive local maintenance (another client's clear, or a
 *   database eviction) closed this client's session out from under it.
 */
export declare class ClientClosedError extends ClientClosedError_base<{
    readonly operation: string;
    readonly reason: "closed" | "cleared" | "fenced";
}> {
}
/** Why `clearLocalData()` deleted nothing. */
export type ClientLocalDataFailure = "no-confirmed-scope" | "storage";
declare const ClientLocalDataError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ClientLocalDataError";
} & Readonly<A>;
/**
 * `clearLocalData()` failed. The clear is atomic: on failure the scope's
 * durable state is exactly what it was, and the call may be retried.
 */
export declare class ClientLocalDataError extends ClientLocalDataError_base<{
    readonly reason: ClientLocalDataFailure;
    readonly cause?: unknown;
}> {
}
/** Why a graph path does not name a database this client may read. */
export type GraphPathFailure = "unavailable" | "ambiguous" | "unauthorized" | "update-required" | "closed" | "query";
declare const GraphPathError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "GraphPathError";
} & Readonly<A>;
/**
 * A graph path could not be resolved to one database.
 *
 * Surfaced as the `error` of every descendant query snapshot, and never as an
 * absence of rows: a path that does not resolve has no rows to be absent.
 */
export declare class GraphPathError extends GraphPathError_base<{
    readonly reason: GraphPathFailure;
    readonly message: string;
    readonly cause?: unknown;
}> {
}
/** Why an invocation could not be addressed to one stable database. */
export type GraphReceiverFailure = "unresolved" | "ambiguous" | "unauthorized" | "update-required" | "closed";
declare const GraphReceiverError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "GraphReceiverError";
} & Readonly<A>;
/**
 * An invocation's receiver did not resolve to one stable database identity, so
 * nothing was queued.
 *
 * The pre-queue gate: no durable invocation or outbox entry is ever created
 * from mutable path text or from a guessed receiver, so this failure leaves no
 * durable trace to undo.
 */
export declare class GraphReceiverError extends GraphReceiverError_base<{
    readonly reason: GraphReceiverFailure;
    readonly message: string;
    readonly cause?: unknown;
}> {
}
export {};
//# sourceMappingURL=errors.d.ts.map