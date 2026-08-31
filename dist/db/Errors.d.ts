declare const TxRejected_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "TxRejected";
} & Readonly<A>;
/** A transaction was rejected by validation / tempid / unique / policy (409). */
export declare class TxRejected extends TxRejected_base<{
    readonly message: string;
    readonly code: string;
    readonly attr?: string;
}> {
}
declare const Unavailable_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "Unavailable";
} & Readonly<A>;
/** The transactor aborted and is rebuilding from durable state (503); retry after `retryAfterMs`. */
export declare class Unavailable extends Unavailable_base<{
    readonly message: string;
    readonly retryAfterMs: number;
}> {
}
declare const InvalidRequest_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "InvalidRequest";
} & Readonly<A>;
/** Malformed request — bad query, unknown attribute, unbound variable, invalid db name (400). */
export declare class InvalidRequest extends InvalidRequest_base<{
    readonly message: string;
}> {
}
declare const DatabaseNotFound_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "DatabaseNotFound";
} & Readonly<A>;
/** No such route / database (404). */
export declare class DatabaseNotFound extends DatabaseNotFound_base<{
    readonly message: string;
}> {
}
declare const Unauthorized_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "Unauthorized";
} & Readonly<A>;
/**
 * Missing, expired or wrong credential, or a policy denial (401 / 403).
 *
 * A policy denial carries `code` (e.g. `"policy"`) and the attribute ident it
 * tripped on (`attr: ":doc/owner"`) — never the value.
 */
export declare class Unauthorized extends Unauthorized_base<{
    readonly message?: string;
    readonly status?: 401 | 403;
    readonly code?: string;
    readonly attr?: string;
}> {
}
declare const QueryBudgetExceeded_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryBudgetExceeded";
} & Readonly<A>;
/**
 * The planner's intermediate relation would exceed the memory budget (413).
 * Retryable with a narrower query. Both the peer's own guard
 * (`QueryBudgetExceeded`) and the replica's (`QueryBudget`) land here.
 */
export declare class QueryBudgetExceeded extends QueryBudgetExceeded_base<{
    readonly message: string;
    readonly code: string;
    readonly clause: string;
    readonly cells: number;
    readonly limit: number;
    readonly spentBy?: "caller";
}> {
}
declare const InternalError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "InternalError";
} & Readonly<A>;
/** Anything else the server reported (500). */
export declare class InternalError extends InternalError_base<{
    readonly message: string;
}> {
}
declare const NetworkError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "NetworkError";
} & Readonly<A>;
export declare class NetworkError extends NetworkError_base<{
    readonly message: string;
    readonly cause?: unknown;
}> {
}
declare const NotOne_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "NotOne";
} & Readonly<A>;
/**
 * `.oneOrFail()` promised exactly one row and the peer answered zero or two
 * (it is asked for `:limit 2`, so "two" means at least two). Client-side —
 * the query succeeded; the cardinality did not. Not a {@link DbError}: a
 * plain `.where` / `.limit` query cannot produce it.
 *
 * `found` is `0` or `2`. There is no "3": the wire never sees past the
 * second row.
 */
export declare class NotOne extends NotOne_base<{
    readonly message: string;
    readonly found: 0 | 2;
}> {
}
declare const OperationRejected_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "OperationRejected";
} & Readonly<A>;
/**
 * An operation was refused before or during execution (dangling / foreign
 * entity, a body-thrown rejection). Schema failures stay {@link InvalidRequest};
 * policy denials stay {@link TxRejected} / {@link Unauthorized}. Terminal —
 * never silently retried, because effect steps may not be free to repeat.
 */
export declare class OperationRejected extends OperationRejected_base<{
    readonly message: string;
    readonly operation: string;
    readonly step?: string;
    readonly reason?: string;
}> {
}
declare const OperationsCoverageError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "OperationsCoverageError";
} & Readonly<A>;
/**
 * The peer's registered operations do not cover the ids the client ships.
 * Deploy / connect time — not a {@link DbError}. A missing id used to
 * surface later as `unknown operation` on `db.run`.
 */
export declare class OperationsCoverageError extends OperationsCoverageError_base<{
    readonly message: string;
    readonly missing: readonly string[];
}> {
}
export type DbError = TxRejected | Unavailable | InvalidRequest | DatabaseNotFound | Unauthorized | QueryBudgetExceeded | InternalError | NetworkError | OperationRejected;
export declare const isDatabaseError: (value: unknown) => value is DbError;
export interface HeaderLike {
    get(name: string): string | null;
}
export declare const fromResponse: (status: number, body: unknown, headers?: HeaderLike) => DbError;
export {};
//# sourceMappingURL=Errors.d.ts.map