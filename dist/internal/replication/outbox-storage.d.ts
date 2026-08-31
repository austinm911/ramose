import type { RuntimeBoundaries } from "../runtime-boundaries.ts";
import type { EntityId, InvocationId } from "../../db/refs.ts";
import type { MutationAcknowledgement } from "./submission.ts";
import { type LayerRows, type OptimisticLayerRecord } from "./overlay-records.ts";
import type { LeadershipFence } from "./leadership.ts";
import { type ReplicaNotice } from "./notices.ts";
import type { ProjectionIdentity } from "./projection-binding.ts";
import { type ReplicaDatabaseScope, type ReplicaLease, type ReplicaScope } from "./replica-lifecycle.ts";
import { type ClientRefRecord, type OutboxDraft, type OutboxPartitionPlan, type OutboxRecord, type QueuedMapping, type ReceiptRecord, type SealingEpoch, type UnobservedReceipt, type UnreadableOutboxRow } from "./outbox.ts";
export declare const MUTATION_OUTBOX = "mutation-outbox-v1";
export declare const MUTATION_QUEUES = "mutation-queues-v1";
export declare const MUTATION_RECEIPTS = "mutation-receipts-v1";
export declare const MUTATION_CLIENT_REFS = "mutation-client-refs-v1";
export declare const MUTATION_MAPPINGS = "mutation-client-ref-mappings-v1";
export { MUTATION_LAYERS } from "./overlay-records.ts";
export declare const MUTATION_STORE_FAMILIES: readonly ["mutation-queues-v1", "mutation-outbox-v1", "mutation-receipts-v1", "mutation-client-refs-v1", "mutation-client-ref-mappings-v1", "mutation-layers-v1"];
export declare const createMutationStores: (database: IDBDatabase, upgrade: IDBTransaction, resetLegacy: boolean) => void;
export type MutationClearOutcome = {
    readonly queued: number;
    readonly clientRefs: number;
    readonly layers: number;
};
export declare const clearMutationScope: (transaction: IDBTransaction, scope: ReplicaScope) => Promise<MutationClearOutcome>;
export type EnqueueOptions = {
    readonly scope: ReplicaScope;
    readonly lease?: ReplicaLease | undefined;
    readonly signal?: AbortSignal | undefined;
    readonly projection?: ProjectionIdentity | undefined;
};
export type ActivationObservationState = {
    readonly partition: string;
    readonly receiver: ReplicaDatabaseScope;
    readonly activation: number;
    readonly unobserved: readonly UnobservedReceipt[];
};
export type ActivationFenceOutcome = {
    readonly receiver: ReplicaDatabaseScope;
    readonly activation: number;
    readonly fenced: readonly InvocationId[];
    readonly confirmed: string;
    readonly layers: readonly OptimisticLayerRecord[];
    readonly unreadable: number;
};
export type OutboxRestoration = {
    readonly records: readonly OutboxRecord[];
    readonly unreadable: readonly UnreadableOutboxRow[];
};
export type TerminalAcknowledgement = Extract<MutationAcknowledgement, {
    readonly _tag: "Committed";
} | {
    readonly _tag: "Rejected";
}>;
declare const ClientRefMappingRefused_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ClientRefMappingRefused";
} & Readonly<A>;
export declare class ClientRefMappingRefused extends ClientRefMappingRefused_base<{
    readonly partition: string;
    readonly clientRef: string;
    readonly reason: "not-a-ref-pair" | "unreadable-handle" | "not-allocated-here" | "slot-unmapped" | "already-mapped";
}> {
}
export declare class IndexedDbOutbox {
    private readonly database;
    private readonly boundaries;
    private readonly assertScopeLive;
    private readonly leader;
    private readonly announce;
    constructor(database: IDBDatabase, boundaries: RuntimeBoundaries, assertScopeLive: (scope: ReplicaScope) => void, leader?: (() => LeadershipFence | undefined) | undefined, announce?: (notice: ReplicaNotice) => void);
    private announceReceiver;
    enqueue(draft: OutboxDraft, options: EnqueueOptions): Promise<OutboxRecord>;
    private preflightScope;
    private fenceScope;
    private fenceLeadership;
    private stageEnqueue;
    restore(scope: ReplicaScope): Promise<OutboxRestoration>;
    private readOutbox;
    mappedRefs(scope: ReplicaScope): Promise<ReadonlyMap<string, SealingEpoch>>;
    private readMappings;
    plan(scope: ReplicaScope, keyId?: string): Promise<readonly OutboxPartitionPlan[]>;
    submissionPlan(scope: ReplicaScope, keyId?: string): Promise<{
        readonly plans: readonly OutboxPartitionPlan[];
        readonly handles: ReadonlyMap<string, EntityId>;
    }>;
    mappedHandles(receiver: ReplicaDatabaseScope): Promise<ReadonlyMap<string, EntityId>>;
    receipt(receiver: ReplicaDatabaseScope, invocation: InvocationId): Promise<ReceiptRecord | undefined>;
    clientRefs(receiver: ReplicaDatabaseScope): Promise<readonly ClientRefRecord[]>;
    recordMappings(receiver: ReplicaDatabaseScope, invocation: InvocationId, mappings: readonly QueuedMapping[], mappedAt?: number): Promise<void>;
    acknowledge(record: OutboxRecord, acknowledgement: TerminalAcknowledgement, acknowledgedAt?: number): Promise<ReceiptRecord>;
    private stageAcknowledgement;
    private stageLayerOutcome;
    private cascadeRejection;
    observationState(receiver: ReplicaDatabaseScope): Promise<ActivationObservationState>;
    beginActivation(receiver: ReplicaDatabaseScope): Promise<number>;
    fenceActivation(receiver: ReplicaDatabaseScope, activation: number, observedAt?: number): Promise<ActivationFenceOutcome>;
    optimisticLayers(receiver: ReplicaDatabaseScope): Promise<LayerRows>;
    private stageMappings;
}
//# sourceMappingURL=outbox-storage.d.ts.map