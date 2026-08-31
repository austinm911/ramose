import type { JsonValue } from "../authorization/json.ts";
import { type ClientRef, type EntityId, type InvocationId } from "../../db/refs.ts";
import type { ReplicaDatabaseScope } from "./replica-lifecycle.ts";
import { type OutboxPartitionPlan, type OutboxRecord, type QueuedMapping, type QuarantineReason } from "./outbox.ts";
export type MutationEndpoint = {
    readonly origin: string;
    readonly database: string;
    readonly graphPath: readonly string[];
    readonly credential: string;
};
export type MutationEndpointResolver = (receiver: ReplicaDatabaseScope) => MutationEndpoint | undefined;
export type MutationRequest = {
    readonly endpoint: MutationEndpoint;
    readonly body: Readonly<Record<string, unknown>>;
};
export type MutationResponse = {
    readonly _tag: "Response";
    readonly status: number;
    readonly body: unknown;
} | {
    readonly _tag: "Unreachable";
};
export type MutationTransport = (request: MutationRequest, signal?: AbortSignal) => Promise<MutationResponse>;
export type MappedHandles = ReadonlyMap<string, EntityId>;
export type SubstitutedInvocation = {
    readonly target: EntityId | undefined;
    readonly input: JsonValue;
};
export declare const substituteMutationRefs: (record: OutboxRecord, handles: MappedHandles) => SubstitutedInvocation | undefined;
export declare const buildMutationRequest: (record: OutboxRecord, endpoint: MutationEndpoint, substituted: SubstitutedInvocation) => MutationRequest;
export type MutationAcknowledgement = {
    readonly _tag: "Committed";
    readonly output: JsonValue | null;
    readonly mappings: readonly QueuedMapping[];
} | {
    readonly _tag: "Rejected";
    readonly code: string;
} | {
    readonly _tag: "Refused";
    readonly code: string | undefined;
} | {
    readonly _tag: "UpdateRequired";
    readonly reason: "operation-changed" | "invocation-update-required";
} | {
    readonly _tag: "Retry";
    readonly reason: "unreachable" | "unavailable" | "indeterminate" | "malformed";
};
export declare const classifyMutationResponse: (record: OutboxRecord, response: MutationResponse) => MutationAcknowledgement;
export type InterruptedReason = "scope-fenced" | "leadership-fenced" | "scope-unconfirmed" | "invocation-conflict" | "mapping-refused" | "record-invalid" | "aborted" | "storage";
export declare const interruptedReason: (error: unknown) => InterruptedReason;
export type QueueProgress = {
    readonly partition: string;
    readonly receiver: ReplicaDatabaseScope;
    readonly state: {
        readonly _tag: "Empty";
    } | {
        readonly _tag: "Offline";
    } | {
        readonly _tag: "Blocked";
        readonly missing: readonly ClientRef[];
    } | {
        readonly _tag: "UpdateRequired";
        readonly invocation: InvocationId;
        readonly reason: QuarantineReason | "operation-changed" | "invocation-update-required";
    } | {
        readonly _tag: "Unreadable";
        readonly sequence: number;
    } | {
        readonly _tag: "Committed";
        readonly invocation: InvocationId;
    } | {
        readonly _tag: "Rejected";
        readonly invocation: InvocationId;
        readonly code: string;
    } | {
        readonly _tag: "Refused";
        readonly invocation: InvocationId;
        readonly code: string | undefined;
    } | {
        readonly _tag: "Interrupted";
        readonly reason: InterruptedReason;
    } | {
        readonly _tag: "Retry";
        readonly invocation: InvocationId;
        readonly reason: Extract<MutationAcknowledgement, {
            _tag: "Retry";
        }>["reason"];
    };
};
export type SubmissionStore = {
    readonly submissionPlan: (scope: {
        readonly server: string;
        readonly principal: string;
    }, keyId?: string) => Promise<{
        readonly plans: readonly OutboxPartitionPlan[];
        readonly handles: MappedHandles;
    }>;
    readonly acknowledge: (record: OutboxRecord, acknowledgement: Extract<MutationAcknowledgement, {
        _tag: "Committed";
    } | {
        _tag: "Rejected";
    }>) => Promise<unknown>;
};
export type SubmissionPass = {
    readonly store: SubmissionStore;
    readonly scope: {
        readonly server: string;
        readonly principal: string;
    };
    readonly endpoints: MutationEndpointResolver;
    readonly transport: MutationTransport;
    readonly keyId?: string | undefined;
    readonly signal?: AbortSignal | undefined;
};
export declare const runSubmissionPass: (pass: SubmissionPass) => Promise<readonly QueueProgress[]>;
//# sourceMappingURL=submission.d.ts.map