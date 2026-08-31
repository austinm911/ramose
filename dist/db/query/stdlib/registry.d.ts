import * as Result from "effect/Result";
import { type StdlibFailure } from "./failures.ts";
import type { ExpressionContext, FunctionCard, StdlibManifest, StdlibValue } from "./types.ts";
export declare const standardLibraryV1: StdlibManifest;
export declare const queryFunctionNames: () => readonly string[];
export declare const isQueryFunctionName: (name: string) => boolean;
export declare const lookupQueryFunction: (name: string) => FunctionCard | undefined;
export interface QueryCallShape {
    readonly name: string;
    readonly context: ExpressionContext;
    readonly argumentCount: number;
}
export interface QueryCall {
    readonly name: string;
    readonly context: ExpressionContext;
    readonly args: readonly StdlibValue[];
}
export declare const validateQueryCall: (call: QueryCallShape) => Result.Result<FunctionCard, StdlibFailure>;
export declare const checkQueryCallArguments: (card: FunctionCard, args: readonly StdlibValue[]) => Result.Result<void, StdlibFailure>;
export declare const evaluateQueryCall: (call: QueryCall) => Result.Result<StdlibValue, StdlibFailure>;
export declare const stdlibIntegrityProblems: () => readonly string[];
//# sourceMappingURL=registry.d.ts.map