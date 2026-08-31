import * as Effect from "effect/Effect";
import { InvalidRequest } from "../../db/Errors.ts";
import { type EpochBoundScope } from "./entity-targets.ts";
import { OperationVersion } from "./identities.ts";
import type { JsonValue } from "./json.ts";
import type { OperationInvocation } from "./operations-runtime.ts";
export declare const INVOCATION_RECEIPT_VERSION: 2;
export declare const LEGACY_INVOCATION_RECEIPT_VERSIONS: readonly number[];
export declare const MAX_INVOCATION_ID_LENGTH = 256;
export type AuthoritativeOperationInvocation = OperationInvocation & {
    readonly invocationId: string;
};
export type InvocationReceiptStatus = "completed" | "rejected" | "failed" | "indeterminate";
export type PublicInvocationReceipt = {
    readonly version: typeof INVOCATION_RECEIPT_VERSION;
    readonly invocationId: string;
    readonly status: InvocationReceiptStatus;
};
export type SealedInvocationRejection = {
    readonly kind: "unauthorized";
} | {
    readonly kind: "invalid_request";
} | {
    readonly kind: "request_rejected";
} | {
    readonly kind: "operation_rejected";
    readonly message: string;
    readonly operation: string;
    readonly step?: string;
    readonly reason?: string;
};
type InvocationReceiptIdentity = {
    readonly version: typeof INVOCATION_RECEIPT_VERSION;
    readonly principalId: string;
    readonly invocationId: string;
    readonly scopeDigest: string;
    readonly operationVersion: OperationVersion;
    readonly invocationDigest: string;
};
export type ClaimedInvocationReceipt = InvocationReceiptIdentity & {
    readonly status: "claimed";
};
export type InvocationReplayFenceV1 = {
    readonly version: 1;
    readonly target?: {
        readonly eid: number;
        readonly type: string;
        readonly referenceEid: number | null;
        readonly postCommit: {
            readonly kind: "visible";
        } | {
            readonly kind: "absent";
            readonly authorizationDigest: string;
            readonly authorizationReadSet: readonly ({
                readonly kind: "type" | "exists";
                readonly eid: number;
            } | {
                readonly kind: "field";
                readonly eid: number;
                readonly ident: string;
            })[];
        } | {
            readonly kind: "hidden";
            readonly authorizationDigest: string;
        };
    };
    readonly consumedRefs: readonly {
        readonly path: readonly (string | number)[];
        readonly eid: number;
        readonly type: string;
    }[];
};
export type InvocationAllocationMappingsV1 = {
    readonly version: 1;
    readonly keyId: string;
    readonly scope: {
        readonly server: string;
        readonly principal: string;
        readonly database: string;
    };
    readonly entries: readonly {
        readonly slot: string;
        readonly clientRef: string;
        readonly entityId: string;
    }[];
};
export declare const allocationMappingsResolvable: (mappings: InvocationAllocationMappingsV1, current: EpochBoundScope) => boolean;
export type CompletedInvocationReceipt = InvocationReceiptIdentity & {
    readonly status: "completed";
    readonly committedT: number;
    readonly output: unknown;
    readonly replayFence: InvocationReplayFenceV1;
    readonly allocations?: InvocationAllocationMappingsV1;
};
export type RejectedInvocationReceipt = InvocationReceiptIdentity & {
    readonly status: "rejected";
    readonly rejection: SealedInvocationRejection;
};
export type FailedInvocationReceipt = InvocationReceiptIdentity & {
    readonly status: "failed";
};
export type IndeterminateInvocationReceipt = InvocationReceiptIdentity & {
    readonly status: "indeterminate";
};
export type TerminalInvocationReceipt = CompletedInvocationReceipt | RejectedInvocationReceipt | FailedInvocationReceipt | IndeterminateInvocationReceipt;
export type StoredInvocationReceipt = ClaimedInvocationReceipt | TerminalInvocationReceipt;
export type PreparedInvocationReceipt = InvocationReceiptIdentity;
export type InvocationReceiptDecision = {
    readonly _tag: "Claim";
    readonly receipt: ClaimedInvocationReceipt;
} | {
    readonly _tag: "OperationChanged";
} | {
    readonly _tag: "UpdateRequired";
} | {
    readonly _tag: "Replay";
    readonly receipt: TerminalInvocationReceipt;
} | {
    readonly _tag: "Recover";
    readonly receipt: IndeterminateInvocationReceipt;
} | {
    readonly _tag: "Conflict";
};
export type InvocationReceiptEvent = {
    readonly _tag: "Complete";
    readonly committedT: number;
    readonly output: unknown;
    readonly replayFence: InvocationReplayFenceV1;
    readonly allocations?: InvocationAllocationMappingsV1;
} | {
    readonly _tag: "Reject";
    readonly rejection: SealedInvocationRejection;
} | {
    readonly _tag: "Fail";
} | {
    readonly _tag: "Recover";
};
export type InvocationReceiptOutcome = {
    readonly _tag: "Completed";
    readonly receipt: PublicInvocationReceipt & {
        readonly status: "completed";
    };
    readonly committedT: number;
    readonly output: unknown;
    readonly mappings?: readonly {
        readonly clientRef: string;
        readonly entityId: string;
    }[];
    readonly outputRefPaths?: readonly (readonly (string | number)[])[];
} | {
    readonly _tag: "Rejected";
    readonly receipt: PublicInvocationReceipt & {
        readonly status: "rejected";
    };
    readonly rejection: SealedInvocationRejection;
} | {
    readonly _tag: "Failed";
    readonly receipt: PublicInvocationReceipt & {
        readonly status: "failed";
    };
} | {
    readonly _tag: "Indeterminate";
    readonly receipt: PublicInvocationReceipt & {
        readonly status: "indeterminate";
    };
};
export type AuthoritativeInvocationResult = InvocationReceiptOutcome | {
    readonly _tag: "Conflict";
} | {
    readonly _tag: "OperationChanged";
} | {
    readonly _tag: "UpdateRequired";
};
export declare const requireInvocationId: (value: unknown) => string;
export declare const invocationPrincipalId: (invocation: Pick<AuthoritativeOperationInvocation, "caller">) => string;
export declare const invocationScopeMaterial: (invocation: AuthoritativeOperationInvocation) => JsonValue;
export declare const invocationDigestMaterial: (invocation: AuthoritativeOperationInvocation, operationVersion: OperationVersion) => JsonValue;
export declare const requireSuppliedOperationVersion: (value: unknown) => OperationVersion | undefined;
export declare const prepareInvocationReceipt: (invocation: AuthoritativeOperationInvocation, operationVersion: string & import("effect/Brand").Brand<"OperationVersion">) => Effect.Effect<InvocationReceiptIdentity, InvalidRequest, never>;
export declare const decideInvocationReceipt: (stored: StoredInvocationReceipt | LegacyInvocationReceiptRow | undefined, prepared: PreparedInvocationReceipt) => InvocationReceiptDecision;
export declare const transitionInvocationReceipt: (receipt: StoredInvocationReceipt, event: InvocationReceiptEvent) => TerminalInvocationReceipt;
export declare const publicInvocationReceipt: (receipt: TerminalInvocationReceipt) => PublicInvocationReceipt;
export declare const invocationReceiptOutcome: (receipt: TerminalInvocationReceipt) => InvocationReceiptOutcome;
export type LegacyInvocationReceiptRow = {
    readonly _tag: "LegacyInvocationReceipt";
    readonly version: number;
};
export declare const isLegacyInvocationReceiptRow: (value: StoredInvocationReceipt | LegacyInvocationReceiptRow) => value is LegacyInvocationReceiptRow;
export declare const parseStoredInvocationReceipt: (value: unknown) => StoredInvocationReceipt | LegacyInvocationReceiptRow;
export declare const parseAuthoritativeInvocationResult: (value: unknown, invocationId: string) => AuthoritativeInvocationResult;
export {};
//# sourceMappingURL=invocation-receipts.d.ts.map