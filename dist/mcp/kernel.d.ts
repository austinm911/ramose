import type { OperationInputShape } from "../internal/authorization/catalog.ts";
import type { AuthenticatedCaller, AuthorizedRequestContext } from "../internal/authorization/request.ts";
import type { AuthoritativeInvocationResult } from "../internal/authorization/invocation-receipts.ts";
import { McpToolFailure, type ErrorEnvelopeV1, type QueryDocumentV1 } from "./contract.ts";
export type DescribeResultV1 = {
    readonly at: readonly string[];
    readonly entities: readonly string[];
    readonly operations: readonly {
        readonly owner: {
            readonly kind: "entity" | "trait";
            readonly name: string;
        };
        readonly name: string;
        readonly version: string;
    }[];
    readonly graphs: readonly string[];
    readonly truncated: boolean;
};
export declare const describeGraph: (context: AuthorizedRequestContext, caller: AuthenticatedCaller, at: readonly string[]) => Promise<DescribeResultV1>;
export type QueryResultV1 = {
    readonly rows: readonly Record<string, unknown>[];
    readonly truncated: boolean;
};
type ResolvedField = {
    readonly name: string;
    readonly ident: string;
};
export declare const requireBoundedImplicitProjection: (visibleFields: number) => void;
export declare const lowerQueryDocument: (context: AuthorizedRequestContext, caller: AuthenticatedCaller, document: QueryDocumentV1) => {
    readonly query: Record<string, unknown>;
    readonly inputs: readonly unknown[];
    readonly fields: readonly ResolvedField[];
    readonly limit: number;
} | undefined;
export declare const queryReadFailure: (cause: unknown) => McpToolFailure | undefined;
export declare const runQueryDocument: (context: AuthorizedRequestContext, caller: AuthenticatedCaller, document: QueryDocumentV1, options?: {
    readonly maxCells?: number;
}) => Promise<QueryResultV1>;
export type MutateResultV1 = {
    readonly invocationId: string;
    readonly status: "completed";
    readonly outcome: unknown;
};
export declare const OUTCOME_WITHHELD: Readonly<{
    withheld: "outcome";
}>;
export declare const publishableWithoutReferences: (shape: OperationInputShape) => boolean;
export declare const projectOperationOutcome: (shape: OperationInputShape, output: unknown) => unknown;
export declare const publicMutateResult: (result: AuthoritativeInvocationResult, outputShape: OperationInputShape) => MutateResultV1 | ErrorEnvelopeV1;
export {};
//# sourceMappingURL=kernel.d.ts.map