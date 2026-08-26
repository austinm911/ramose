/**
 * Tagged failures for the Ramose database capabilities — the one shared
 * error module. The peer Worker and the Transactor import the public
 * classes from here (`Unauthorized`, `OperationRejected`,
 * `QueryBudgetExceeded`, `TxRejected`) instead of declaring a second copy.
 * Worker-only HTTP tags (`NotFound`, `BadRequest`, `Internal`,
 * `UpstreamError`) and the transactor-internal `TransactorDead` stay at
 * those boundaries and map onto this union on the way out.
 *
 * App-path calls (`db.run`, `db.query`, `db.pull`) reject with the class
 * itself: `_tag` intact, `instanceof` works, `.name` / `.message` stable.
 * Match in `try/catch` with `instanceof` or `_tag`. `isDatabaseError` is
 * the type guard for the union. Effect matching (`catchTags`) is hatch-only
 * (`db.effect.*` / `ramose/effect`).
 *
 * ## `DbError` — nine request errors
 *
 * Members are named for the condition they report (`TxRejected`,
 * `Unavailable`, `Unauthorized`, `OperationRejected`, `InvalidRequest`,
 * `DatabaseNotFound`, `QueryBudgetExceeded`). `InternalError` and
 * `NetworkError` keep the `-Error` suffix because the bare words are too
 * generic. That is the convention; do not mix a third pattern into this
 * union.
 *
 * | tag                   | means                                      |
 * | --------------------- | ------------------------------------------ |
 * | `TxRejected`          | write refused by validation / unique / policy (409) |
 * | `Unavailable`         | writer restarting; retry after `retryAfterMs` (503) |
 * | `InvalidRequest`      | malformed request (400)                    |
 * | `DatabaseNotFound`    | no such route (404)                        |
 * | `Unauthorized`        | missing/wrong credential, or a policy denial (401 / 403) |
 * | `QueryBudgetExceeded` | planner memory budget (413)                |
 * | `InternalError`       | anything else the server reported (500)    |
 * | `NetworkError`        | the request never produced a response      |
 * | `OperationRejected`   | named operation refused (409)              |
 *
 * Not in this union: {@link NotOne} (`.oneOrFail()` cardinality),
 * {@link PolicyError} (policy failed to compile — deploy time),
 * {@link IncompatibleSchema} (`install()` refused a data-model split).
 * A runtime policy denial is {@link Unauthorized} or {@link TxRejected} with
 * `code: "policy"`. A query that cannot lower is {@link InvalidRequest}.
 *
 * Wire shapes the classifier understands:
 *
 *   worker's own errors      { error, code?, clause?, cells?, limit?, stack? }   (no `tag`)
 *   DO errors passed through { error, tag, message, code?, retryAfterMs? }
 *
 * `NetworkError` is the only failure with no server side: the request never
 * produced a response (DNS, service binding down, aborted body).
 * `TransactorDead` on the wire becomes {@link Unavailable} here.
 */
export { IncompatibleSchema, PolicyError, type IncompatibleKind, type InstallOptions, type SchemaChange, } from "./SchemaErrors.ts";
declare const TxRejected_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "TxRejected";
} & Readonly<A>;
/** A transaction was rejected by validation / tempid / unique / policy (409). */
export declare class TxRejected extends TxRejected_base<{
    readonly message: string;
    readonly code: string;
    /** Field ident a policy denial tripped on — never the value. */
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
    /** 403 when the caller is known but the policy refused; omit for 401. */
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
    /** `policy` when a conjoined rule spent the budget, else `caller`. */
    readonly spentBy?: "caller" | "policy";
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
/** The request never produced a response (transport, DNS, service binding, aborted body). */
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
    /** The operation id (`user/create`). Not `Error.name` — that stays the tag. */
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
    /** Wire ids the client ships that the peer did not register. */
    readonly missing: readonly string[];
}> {
}
export type DbError = TxRejected | Unavailable | InvalidRequest | DatabaseNotFound | Unauthorized | QueryBudgetExceeded | InternalError | NetworkError | OperationRejected;
export declare const isDatabaseError: (value: unknown) => value is DbError;
/** Minimal read-only view of the response headers (`Headers`, or a plain map in tests). */
export interface HeaderLike {
    get(name: string): string | null;
}
/**
 * Classify a non-2xx response into a tagged failure.
 *
 * The `tag` field (present only on errors the Transactor/QueryReplica DOs
 * produced and the peer passed through verbatim) wins over the status code,
 * because it is the stable discriminator; the peer's own errors carry no tag
 * and are classified by status.
 */
export declare const fromResponse: (status: number, body: unknown, headers?: HeaderLike) => DbError;
//# sourceMappingURL=Errors.d.ts.map