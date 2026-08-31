import * as Effect from "effect/Effect";
import { type AuthoritativeInvocationResult, type AuthoritativeOperationInvocation, type AuthenticatedCaller, type DatabaseRouteDerivation, type OperationInvocation } from "../internal/authorization/index.ts";
import type { RamoseEnv } from "../RamoseEnv.ts";
import { BadRequest, OperationRejected, Unauthorized, UpstreamError } from "./errors.ts";
export type ParsedOperationRequest = Omit<OperationInvocation, "database" | "caller" | "catalogKey" | "unitHash" | "routeDerivation" | "entityIdScope"> & {
    readonly path: readonly string[];
    readonly invocationId: string;
};
type RoutedOperationRequest = Omit<ParsedOperationRequest, "path"> & {
    readonly catalogKey: OperationInvocation["catalogKey"];
    readonly unitHash: OperationInvocation["unitHash"];
};
export declare const serializeOperationInvocation: (invocation: AuthoritativeOperationInvocation) => string;
export declare const operationFailureFromResponse: (response: Response, text: string) => UpstreamError | OperationRejected;
export declare const parseOperationRequest: (request: Request<unknown, CfProperties<unknown>>) => Effect.Effect<ParsedOperationRequest, BadRequest | Unauthorized, never>;
export declare const invokeAuthoritativeOperation: (env: RamoseEnv, database: string, origin: string, parsed: RoutedOperationRequest, caller: AuthenticatedCaller, routeDerivation?: DatabaseRouteDerivation) => Promise<AuthoritativeInvocationResult>;
export type PublicOperationResult = {
    readonly status: number;
    readonly body: Record<string, unknown>;
};
export declare const publicOperationResult: (result: AuthoritativeInvocationResult) => PublicOperationResult;
export {};
//# sourceMappingURL=authorized-operation.d.ts.map