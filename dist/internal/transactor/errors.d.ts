/**
 * Tagged errors + HTTP mapping for the Transactor's request boundary.
 *
 * Effect lives *only* here and in the handler that dispatches routes — never
 * in the resolve/commit loop, which stays plain async/await.
 *
 * Wire shape (unchanged fields the client depends on, plus a stable machine
 * tag):
 *   { error: <human message>, tag: "<Tag>", message: <human message>,
 *     code?: <TxError code>, retryAfterMs?: <ms> }
 * `error` keeps the human-readable message because the Worker surfaces it as
 * the `message` of the tagged `DbError` it hands the client; `tag` is the
 * stable discriminator.
 */
import { TxRejected } from "../../db/Errors.ts";
export { TxRejected };
/** The transactor aborted: in-memory and durable state may have diverged. */
export declare class TransactorDeadError extends Error {
    constructor(reason: string);
}
declare const TransactorDead_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "TransactorDead";
} & Readonly<A>;
/** This instance is dead and is being rebuilt from durable state → 503. Maps to `Unavailable` at the client boundary. */
export declare class TransactorDead extends TransactorDead_base<{
    message: string;
    retryAfterMs: number;
}> {
}
declare const BadRequest_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "BadRequest";
} & Readonly<A>;
/** Malformed request → 400. */
export declare class BadRequest extends BadRequest_base<{
    message: string;
}> {
}
declare const NotFound_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "NotFound";
} & Readonly<A>;
/** Unknown route → 404. */
export declare class NotFound extends NotFound_base<{
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
export type TransactorHttpError = TxRejected | TransactorDead | BadRequest | NotFound | Internal;
/** Classify anything thrown by a route into a tagged error. */
export declare function toHttpError(err: unknown): TransactorHttpError;
export declare const statusOf: (e: TransactorHttpError) => number;
/** Stable JSON error response; statuses and body fields match the pre-Effect handler. */
export declare function errorResponse(e: TransactorHttpError): Response;
//# sourceMappingURL=errors.d.ts.map