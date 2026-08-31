import * as Data from "effect/Data";
export class UnknownQueryFunction extends Data.TaggedError("UnknownQueryFunction") {
}
export class QueryFunctionArity extends Data.TaggedError("QueryFunctionArity") {
}
export class QueryFunctionArgumentType extends Data.TaggedError("QueryFunctionArgumentType") {
}
export class QueryFunctionArgumentDomain extends Data.TaggedError("QueryFunctionArgumentDomain") {
}
export class QueryFunctionContext extends Data.TaggedError("QueryFunctionContext") {
}
export class QueryFunctionOutputSize extends Data.TaggedError("QueryFunctionOutputSize") {
}
export const sealStdlibFailure = (failure) => {
    switch (failure._tag) {
        case "UnknownQueryFunction":
            return { code: "query_function_unknown", function: failure.name };
        case "QueryFunctionArity":
            return {
                code: "query_function_arity",
                function: failure.name,
                expected: failure.expected,
                received: failure.received,
            };
        case "QueryFunctionArgumentType":
            return {
                code: "query_function_argument_type",
                function: failure.name,
                index: failure.index,
                parameter: failure.parameter,
                expected: failure.expected,
                received: failure.received,
            };
        case "QueryFunctionArgumentDomain":
            return {
                code: "query_function_argument_domain",
                function: failure.name,
                index: failure.index,
                parameter: failure.parameter,
                violation: failure.violation,
            };
        case "QueryFunctionContext":
            return {
                code: "query_function_context",
                function: failure.name,
                context: failure.context,
                allowed: failure.allowed,
            };
        case "QueryFunctionOutputSize":
            return {
                code: "query_function_output_size",
                function: failure.name,
                limit: failure.limit,
            };
    }
};
//# sourceMappingURL=failures.js.map