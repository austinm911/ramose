/**
 * Tagged failures for the peer Worker's request Effect.
 *
 * Shared public classes (`Unauthorized`, `QueryBudgetExceeded`,
 * `OperationRejected`) come from `db/Errors.ts`. Worker-only HTTP tags
 * stay here: `NotFound`, `BadRequest`, `Internal`, `UpstreamError`.
 *
 * The HTTP boundary in index.ts runs one `Effect` per request; everything that
 * is not a 2xx is a `Data.TaggedError` in its error channel, mapped back to a
 * response with `Effect.catchTags`. The status codes and body fields here are
 * exactly the ones the Worker has always returned (the client parses
 * `error`/`code`, benches parse the `x-ramose-*` headers) — see `toHttp`:
 *
 *   NotFound            404  { error }
 *   BadRequest          400  { error, stack? }        stack (`trace`) only off-prod
 *   Unauthorized    401/403  { error, code?, attr? }   403 = known caller, policy refused
 *   UpstreamError       as-is  raw body + headers of a Transactor/Replica DO response
 *   QueryBudgetExceeded 413  { error, code, clause, cells, limit, spentBy? }
 *   Internal            500  { error, stack? }        stack (`trace`) only off-prod
 */
import { OperationRejected, QueryBudgetExceeded, Unauthorized } from "../db/Errors.ts";
export { OperationRejected, QueryBudgetExceeded, Unauthorized };
declare const NotFound_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "NotFound";
} & Readonly<A>;
export declare class NotFound extends NotFound_base<{
    readonly message?: string;
}> {
}
declare const BadRequest_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "BadRequest";
} & Readonly<A>;
export declare class BadRequest extends BadRequest_base<{
    readonly message: string;
    readonly trace?: string;
}> {
}
declare const UpstreamError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "UpstreamError";
} & Readonly<A>;
/** A Transactor/Replica DO answered with a non-2xx; passed through verbatim. */
export declare class UpstreamError extends UpstreamError_base<{
    readonly status: number;
    readonly body: string;
    readonly headers?: Record<string, string>;
}> {
}
declare const Internal_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "Internal";
} & Readonly<A>;
export declare class Internal extends Internal_base<{
    readonly message: string;
    readonly trace?: string;
}> {
}
export type RamoseError = NotFound | BadRequest | Unauthorized | UpstreamError | QueryBudgetExceeded | Internal | OperationRejected;
/** A tagged failure that was `throw`n inside an async route body. */
export declare const isRamoseError: (e: unknown) => e is RamoseError;
/** Message shapes that have always been the caller's fault (400), not ours (500). */
export declare const CLIENT_ERROR_RE: RegExp;
/** Classify anything thrown by a route body into a tagged failure (same 413/400/500 split as before). */
export declare function fromThrown(err: unknown, opts?: {
    readonly stacks: boolean;
}): RamoseError;
export interface HttpError {
    readonly status: number;
    /** JSON body (absent for a verbatim upstream pass-through). */
    readonly body?: Record<string, unknown>;
    /** Verbatim body text (upstream pass-through). */
    readonly raw?: string;
    readonly headers?: Record<string, string>;
}
/** Tagged failure → status + body fields. Pure; index.ts turns it into a `Response`. */
export declare function toHttp(err: RamoseError): HttpError;
//# sourceMappingURL=errors.d.ts.map