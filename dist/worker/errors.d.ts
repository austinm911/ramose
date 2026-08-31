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
    readonly trace?: string | undefined;
}> {
}
declare const UpstreamError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "UpstreamError";
} & Readonly<A>;
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
    readonly trace?: string | undefined;
}> {
}
export type RamoseError = NotFound | BadRequest | Unauthorized | UpstreamError | QueryBudgetExceeded | Internal | OperationRejected;
export declare const isRamoseError: (error: unknown) => error is RamoseError;
export declare function fromThrown(error: unknown, options?: {
    readonly stacks: boolean;
}): RamoseError;
export interface HttpError {
    readonly status: number;
    readonly body: Record<string, unknown>;
    readonly headers?: Record<string, string> | undefined;
}
export declare function toHttp(error: RamoseError): HttpError;
//# sourceMappingURL=errors.d.ts.map