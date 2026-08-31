import type { DomainViolation, ExpressionContext, ValueType, ValueTypeName } from "./types.ts";
declare const UnknownQueryFunction_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "UnknownQueryFunction";
} & Readonly<A>;
export declare class UnknownQueryFunction extends UnknownQueryFunction_base<{
    readonly name: string;
}> {
}
declare const QueryFunctionArity_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryFunctionArity";
} & Readonly<A>;
export declare class QueryFunctionArity extends QueryFunctionArity_base<{
    readonly name: string;
    readonly expected: number;
    readonly received: number;
}> {
}
declare const QueryFunctionArgumentType_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryFunctionArgumentType";
} & Readonly<A>;
export declare class QueryFunctionArgumentType extends QueryFunctionArgumentType_base<{
    readonly name: string;
    readonly index: number;
    readonly parameter: string;
    readonly expected: ValueType;
    readonly received: ValueTypeName;
}> {
}
declare const QueryFunctionArgumentDomain_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryFunctionArgumentDomain";
} & Readonly<A>;
export declare class QueryFunctionArgumentDomain extends QueryFunctionArgumentDomain_base<{
    readonly name: string;
    readonly index: number;
    readonly parameter: string;
    readonly violation: DomainViolation;
}> {
}
declare const QueryFunctionContext_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryFunctionContext";
} & Readonly<A>;
export declare class QueryFunctionContext extends QueryFunctionContext_base<{
    readonly name: string;
    readonly context: ExpressionContext;
    readonly allowed: readonly ExpressionContext[];
}> {
}
declare const QueryFunctionOutputSize_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "QueryFunctionOutputSize";
} & Readonly<A>;
export declare class QueryFunctionOutputSize extends QueryFunctionOutputSize_base<{
    readonly name: string;
    readonly limit: number;
}> {
}
export type StdlibFailure = UnknownQueryFunction | QueryFunctionArity | QueryFunctionArgumentType | QueryFunctionArgumentDomain | QueryFunctionContext | QueryFunctionOutputSize;
export type StdlibFailureCode = "query_function_unknown" | "query_function_arity" | "query_function_argument_type" | "query_function_argument_domain" | "query_function_context" | "query_function_output_size";
export type SealedStdlibFailure = {
    readonly code: "query_function_unknown";
    readonly function: string;
} | {
    readonly code: "query_function_arity";
    readonly function: string;
    readonly expected: number;
    readonly received: number;
} | {
    readonly code: "query_function_argument_type";
    readonly function: string;
    readonly index: number;
    readonly parameter: string;
    readonly expected: ValueType;
    readonly received: ValueTypeName;
} | {
    readonly code: "query_function_argument_domain";
    readonly function: string;
    readonly index: number;
    readonly parameter: string;
    readonly violation: DomainViolation;
} | {
    readonly code: "query_function_context";
    readonly function: string;
    readonly context: ExpressionContext;
    readonly allowed: readonly ExpressionContext[];
} | {
    readonly code: "query_function_output_size";
    readonly function: string;
    readonly limit: number;
};
export declare const sealStdlibFailure: (failure: StdlibFailure) => SealedStdlibFailure;
export {};
//# sourceMappingURL=failures.d.ts.map