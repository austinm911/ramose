import type { AnyOptimisticProjection } from "../../db/Projection.ts";
import { type InvocationId, type MutationRef } from "../../db/refs.ts";
import type { OperationVersion } from "../authorization/identities.ts";
import type { JsonValue } from "../authorization/json.ts";
import type { OverlayLayer, OverlayLayerState } from "./overlay-layers.ts";
import { type ClientProjectionCatalog, type ProjectionDriftReason, type ProjectionIdentity } from "./projection-binding.ts";
import { type OutboxRecord, type QuarantineReason, type QueuedAllocation, type QueuedOperation, type QueuedTarget, type SealingEpoch } from "./outbox.ts";
import type { ReplicaDatabaseScope } from "./replica-lifecycle.ts";
export declare const MUTATION_LAYERS = "mutation-layers-v1";
export type OptimisticLayerRecord = {
    readonly partition: string;
    readonly sequence: number;
    readonly invocation: InvocationId;
    readonly scope: string;
    readonly receiver: ReplicaDatabaseScope;
    readonly operation: QueuedOperation;
    readonly operationVersion: OperationVersion;
    readonly projection: ProjectionIdentity;
    readonly target: QueuedTarget;
    readonly input: JsonValue;
    readonly allocations: readonly QueuedAllocation[];
    readonly refs: readonly MutationRef[];
    readonly sealing: SealingEpoch | null;
    readonly state: OverlayLayerState;
    readonly activation: number;
    readonly createdAt: number;
};
export type OptimisticLayerDraft = {
    readonly record: OutboxRecord;
    readonly projection: ProjectionIdentity;
    readonly createdAt: number;
};
export declare const suppliedRefs: (record: OutboxRecord) => readonly MutationRef[];
export declare const buildOptimisticLayer: (draft: OptimisticLayerDraft) => OptimisticLayerRecord;
export declare const withLayerState: (record: OptimisticLayerRecord, state: OverlayLayerState, activation: number) => OptimisticLayerRecord;
export declare const decodeOptimisticLayer: (value: unknown) => OptimisticLayerRecord | undefined;
export type LayerQuarantineReason = ProjectionDriftReason | QuarantineReason | "unreadable-row";
export type LayerQuarantine = {
    readonly invocation: InvocationId | undefined;
    readonly reason: LayerQuarantineReason;
};
export type LayerRestoration = {
    readonly type: "layers";
    readonly layers: readonly OverlayLayer[];
} | {
    readonly type: "update-required";
    readonly quarantined: readonly LayerQuarantine[];
};
export type LayerRows = {
    readonly layers: readonly OptimisticLayerRecord[];
    readonly unreadable: number;
};
export type LayerReplay = {
    readonly catalog: ClientProjectionCatalog;
    readonly keyId?: string | undefined;
    readonly run: (projection: AnyOptimisticProjection, record: OptimisticLayerRecord) => OverlayLayer | undefined;
};
export declare const restoreOverlayLayers: (rows: LayerRows, replay: LayerReplay) => LayerRestoration;
export declare const layerOf: (record: OptimisticLayerRecord, changeset: OverlayLayer["changeset"]) => OverlayLayer;
export declare const declaredRefs: (record: OptimisticLayerRecord) => readonly MutationRef[];
//# sourceMappingURL=overlay-records.d.ts.map