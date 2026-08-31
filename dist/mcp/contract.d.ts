import { OperationVersion } from "../internal/authorization/identities.ts";
export declare const ERROR_CODES: readonly ["invalid_query", "invalid_input", "inaccessible", "operation_changed", "invocation_conflict", "invocation_update_required", "invocation_indeterminate", "operation_rejected", "query_budget_exceeded", "internal_error"];
export type ErrorCodeV1 = (typeof ERROR_CODES)[number];
export type ErrorEnvelopeV1 = {
    readonly code: ErrorCodeV1;
    readonly message: string;
    readonly retryable: boolean;
};
export declare const errorEnvelope: (code: ErrorCodeV1, message: string) => ErrorEnvelopeV1;
export declare class McpToolFailure extends Error {
    readonly envelope: ErrorEnvelopeV1;
    constructor(envelope: ErrorEnvelopeV1);
}
export declare const toolFailure: (code: ErrorCodeV1, message: string) => McpToolFailure;
export declare const encodeOperationVersionToken: (version: string) => string;
export declare const decodeOperationVersionToken: (token: string) => OperationVersion | undefined;
export declare const MAX_AT_SEGMENTS = 16;
export declare const MAX_SEGMENT_LENGTH = 256;
export declare const MAX_WHERE_KEYS = 16;
export declare const MAX_SELECT_FIELDS = 64;
export declare const MAX_QUERY_LIMIT = 200;
export declare const DEFAULT_QUERY_LIMIT = 50;
export declare const MAX_DESCRIBE_ITEMS = 200;
export type QueryScalar = string | number | boolean;
export type QueryDocumentV1 = {
    readonly version: 1;
    readonly from: {
        readonly entity: string;
    };
    readonly where?: Readonly<Record<string, QueryScalar>>;
    readonly select?: readonly string[];
    readonly limit?: number;
};
export type OperationRefV1 = {
    readonly owner: {
        readonly kind: "entity" | "trait";
        readonly name: string;
    };
    readonly name: string;
    readonly version: string;
};
export type MutateArgsV1 = {
    readonly at: readonly string[];
    readonly operation: OperationRefV1;
    readonly input: Record<string, unknown>;
    readonly invocationId: string;
};
export declare const requireArgs: (value: unknown) => Record<string, unknown>;
export declare const parseAt: (value: unknown) => readonly string[];
export declare const parseQueryDocument: (value: unknown) => QueryDocumentV1;
export declare const parseMutateArgs: (value: unknown) => MutateArgsV1;
//# sourceMappingURL=contract.d.ts.map