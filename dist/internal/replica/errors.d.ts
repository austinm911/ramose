declare const QueryBudget_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryBudget";
} & Readonly<A>;
export declare class QueryBudget extends QueryBudget_base<{
    message: string;
    code: string;
    clause: string;
    cells: number;
    limit: number;
    spentBy?: "caller";
}> {
}
declare const BadRequest_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "BadRequest";
} & Readonly<A>;
export declare class BadRequest extends BadRequest_base<{
    message: string;
}> {
}
declare const Internal_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "Internal";
} & Readonly<A>;
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