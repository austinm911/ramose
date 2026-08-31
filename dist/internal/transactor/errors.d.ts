import { OperationRejected, TxRejected, Unauthorized } from "../../db/Errors.ts";
export { TxRejected };
export declare class TransactorDeadError extends Error {
    constructor(reason: string);
}
declare const TransactorDead_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "TransactorDead";
} & Readonly<A>;
export declare class TransactorDead extends TransactorDead_base<{
    message: string;
    retryAfterMs: number;
}> {
}
declare const Unavailable_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "Unavailable";
} & Readonly<A>;
export declare class Unavailable extends Unavailable_base<{
    message: string;
    retryAfterMs: number;
}> {
}
declare const BadRequest_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "BadRequest";
} & Readonly<A>;
export declare class BadRequest extends BadRequest_base<{
    message: string;
}> {
}
declare const NotFound_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "NotFound";
} & Readonly<A>;
export declare class NotFound extends NotFound_base<{
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
export type TransactorHttpError = TxRejected | Unauthorized | OperationRejected | TransactorDead | Unavailable | BadRequest | NotFound | Internal;
export declare function toHttpError(err: unknown): TransactorHttpError;
export declare const statusOf: (e: TransactorHttpError) => number;
export declare function errorResponse(e: TransactorHttpError): Response;
//# sourceMappingURL=errors.d.ts.map