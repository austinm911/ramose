import { type AllocationPathSegment } from "../../db/allocations.ts";
import { type ClientRef, type EntityId, type InvocationId, type MutationRef } from "../../db/refs.ts";
import type { CatalogId, OperationVersion, OwnerRef } from "../authorization/identities.ts";
import type { JsonValue } from "../authorization/json.ts";
import type { ReplicaDatabaseScope, ReplicaScope } from "./replica-lifecycle.ts";
export declare const MUTATION_QUEUE_VERSION = 1;
export declare const mutationPartitionKey: (scope: ReplicaDatabaseScope) => string;
export declare const mutationScopePrefix: (scope: ReplicaScope) => string;
export declare const parseMutationPartitionKey: (partition: string) => ReplicaDatabaseScope | undefined;
export type QueuedOperation = {
    readonly catalog: CatalogId;
    readonly owner: OwnerRef;
    readonly localName: string;
};
export type SealingEpoch = {
    readonly codecVersion: number;
    readonly keyId: string;
};
export type QueuedTarget = {
    readonly type: "none";
} | {
    readonly type: "entity";
    readonly entityId: EntityId;
} | {
    readonly type: "client-ref";
    readonly clientRef: ClientRef;
};
export type QueuedAllocation = {
    readonly slot: string;
    readonly clientRef: ClientRef;
};
export type QueuedInputRef = {
    readonly path: readonly AllocationPathSegment[];
    readonly ref: MutationRef;
};
export type OutboxRecord = {
    readonly partition: string;
    readonly sequence: number;
    readonly invocation: InvocationId;
    readonly scope: string;
    readonly receiver: ReplicaDatabaseScope;
    readonly operation: QueuedOperation;
    readonly operationVersion: OperationVersion;
    readonly target: QueuedTarget;
    readonly input: JsonValue;
    readonly allocations: readonly QueuedAllocation[];
    readonly inputRefs: readonly QueuedInputRef[];
    readonly sealing: SealingEpoch | null;
    readonly enqueuedAt: number;
};
export type QueueCursorRecord = {
    readonly partition: string;
    readonly scope: string;
    readonly receiver: ReplicaDatabaseScope;
    readonly nextSequence: number;
    readonly sealing: SealingEpoch | null;
    readonly activation: number;
    readonly updatedAt: number;
};
export type ClientRefRecord = {
    readonly partition: string;
    readonly clientRef: ClientRef;
    readonly invocation: InvocationId;
    readonly slot: string;
    readonly createdAt: number;
};
export type ClientRefMappingRecord = {
    readonly partition: string;
    readonly clientRef: ClientRef;
    readonly entityId: EntityId;
    readonly sealing: SealingEpoch;
    readonly invocation: InvocationId;
    readonly mappedAt: number;
};
export type ReceiptState = "queued" | "committed" | "rejected";
export type ReceiptRecord = {
    readonly partition: string;
    readonly invocation: InvocationId;
    readonly scope: string;
    readonly state: ReceiptState;
    readonly observation: "unobserved" | "observed" | null;
    readonly activation: number;
    readonly output: JsonValue | null;
    readonly mappings: readonly QueuedMapping[];
    readonly failure: {
        readonly code: string;
    } | null;
    readonly updatedAt: number;
};
export type QueuedMapping = {
    readonly clientRef: ClientRef;
    readonly entityId: EntityId;
};
export type UnobservedReceipt = {
    readonly invocation: InvocationId;
    readonly activation: number;
    readonly committedAt: number;
};
export declare const fencedByActivation: (receipt: ReceiptRecord, activation: number) => boolean;
export declare const unobservedReceiptOf: (receipt: ReceiptRecord) => UnobservedReceipt | undefined;
declare const OutboxRecordInvalid_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "OutboxRecordInvalid";
} & Readonly<A>;
export declare class OutboxRecordInvalid extends OutboxRecordInvalid_base<{
    readonly reason: string;
}> {
}
declare const ClientRefConflict_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ClientRefConflict";
} & Readonly<A>;
export declare class ClientRefConflict extends ClientRefConflict_base<{
    readonly clientRef: string;
    readonly partition: string;
}> {
}
declare const OutboxInvocationConflict_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "OutboxInvocationConflict";
} & Readonly<A>;
export declare class OutboxInvocationConflict extends OutboxInvocationConflict_base<{
    readonly invocation: InvocationId;
    readonly partition: string;
}> {
}
export declare const sealingEpochOf: (entityId: string) => SealingEpoch | undefined;
export declare const sameSealingEpoch: (left: SealingEpoch, right: SealingEpoch) => boolean;
export type OutboxDraft = {
    readonly invocation: InvocationId;
    readonly receiver: ReplicaDatabaseScope;
    readonly operation: QueuedOperation;
    readonly operationVersion: OperationVersion;
    readonly target: QueuedTarget;
    readonly input: JsonValue;
    readonly allocations: readonly QueuedAllocation[];
    readonly inputRefs: readonly QueuedInputRef[];
    readonly enqueuedAt: number;
};
export declare const buildOutboxRecord: (draft: OutboxDraft, scopeKey: string, sequence: number) => OutboxRecord;
export declare const sameOutboxIntent: (left: OutboxRecord, right: OutboxRecord) => boolean;
export declare const outboxDependencies: (record: OutboxRecord) => readonly ClientRef[];
export type QuarantineReason = "codec-version" | "key-epoch";
export type OutboxEntryState = {
    readonly type: "ready";
} | {
    readonly type: "blocked";
    readonly missing: readonly ClientRef[];
} | {
    readonly type: "update-required";
    readonly reason: QuarantineReason;
};
export declare const mappingKey: (partition: string, ref: ClientRef) => string;
export type OutboxDecisionContext = {
    readonly mapped: ReadonlyMap<string, SealingEpoch>;
    readonly keyId?: string | undefined;
};
export declare const decideQuarantine: (epoch: SealingEpoch, keyId: string | undefined) => QuarantineReason | undefined;
export declare const decideOutboxEntry: (record: OutboxRecord, context: OutboxDecisionContext) => OutboxEntryState;
export type OutboxEntry = {
    readonly record: OutboxRecord;
    readonly state: OutboxEntryState;
};
export type UnreadableOutboxRow = {
    readonly partition: string;
    readonly sequence: number;
};
export type OutboxHead = {
    readonly type: "empty";
} | {
    readonly type: "ready";
    readonly record: OutboxRecord;
} | {
    readonly type: "blocked";
    readonly record: OutboxRecord;
    readonly missing: readonly ClientRef[];
} | {
    readonly type: "update-required";
    readonly record: OutboxRecord;
    readonly reason: QuarantineReason;
} | {
    readonly type: "unreadable";
    readonly sequence: number;
};
export type OutboxPartitionPlan = {
    readonly partition: string;
    readonly receiver: ReplicaDatabaseScope;
    readonly entries: readonly OutboxEntry[];
    readonly unreadable: readonly UnreadableOutboxRow[];
    readonly head: OutboxHead;
};
export declare const planOutbox: (records: readonly OutboxRecord[], unreadable: readonly UnreadableOutboxRow[], context: OutboxDecisionContext) => readonly OutboxPartitionPlan[];
export declare const decodeOutboxRecord: (value: unknown) => OutboxRecord | undefined;
export declare const decodeClientRefMapping: (value: unknown) => ClientRefMappingRecord | undefined;
export declare const buildQueueCursor: (record: QueueCursorRecord) => QueueCursorRecord;
export declare const decodeQueueCursor: (value: unknown) => QueueCursorRecord | undefined;
export declare const buildReceipt: (record: ReceiptRecord) => ReceiptRecord;
export declare const decodeReceipt: (value: unknown) => ReceiptRecord | undefined;
export declare const buildClientRef: (record: ClientRefRecord) => ClientRefRecord;
export declare const decodeClientRef: (value: unknown) => ClientRefRecord | undefined;
export declare const buildClientRefMapping: (record: ClientRefMappingRecord) => ClientRefMappingRecord;
export {};
//# sourceMappingURL=outbox.d.ts.map