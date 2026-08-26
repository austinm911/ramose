/**
 * Tagged errors + HTTP mapping for the QueryReplica's request boundary.
 *
 * Same contract as before the refactor: the query budget guard answers 413
 * with { error, code, clause, cells, limit, spentBy }, client-shaped query errors
 * answer 400, everything else 500. A stable `tag` is added alongside.
 */
declare const QueryBudget_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryBudget";
} & Readonly<A>;
/** Intermediate relation would blow the memory budget → 413. */
export declare class QueryBudget extends QueryBudget_base<{
    message: string;
    code: string;
    clause: string;
    cells: number;
    limit: number;
    spentBy?: "caller" | "policy";
}> {
}
declare const BadRequest_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "BadRequest";
} & Readonly<A>;
/** Malformed query / unknown attribute / unbound variable → 400. */
export declare class BadRequest extends BadRequest_base<{
    message: string;
}> {
}
declare const Internal_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "Internal";
} & Readonly<A>;
/** Anything else → 500. */
export declare class Internal extends Internal_base<{
    message: string;
}> {
}
export type ReplicaHttpError = QueryBudget | BadRequest | Internal;
export declare function toReplicaError(err: unknown): ReplicaHttpError;
export declare const statusOf: (e: ReplicaHttpError) => number;
export declare function replicaErrorResponse(e: ReplicaHttpError): Response;
export {};
//# sourceMappingURL=errors.d.ts.map