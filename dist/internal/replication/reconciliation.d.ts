import type { Db } from "../core/db.ts";
import type { EntityId, InvocationId, MutationRef } from "../../db/refs.ts";
import { type ActivationFenceStore } from "./activation-fence.ts";
import { type OverlayLayer, type OverlayLayers } from "./overlay-layers.ts";
import { type LayerQuarantine, type LayerRows } from "./overlay-records.ts";
import { type OverlayResolver, type OverlayView } from "./overlay.ts";
import type { ClientProjectionCatalog } from "./projection-binding.ts";
import type { ReplicaDatabaseScope } from "./replica-lifecycle.ts";
import type { QueueProgress } from "./submission.ts";
export type OptimisticPendingEntry = {
    readonly ref: MutationRef;
    readonly invocations: readonly InvocationId[];
    readonly state: OverlayLayer["state"];
    readonly created: boolean;
};
export type OptimisticPending = ReadonlyMap<string, OptimisticPendingEntry>;
export declare const pendingLayerState: (layers: OverlayLayers) => OptimisticPending;
export type OptimisticOverlayState = {
    readonly receiver: ReplicaDatabaseScope;
    readonly layers: OverlayLayers;
    readonly updateRequired: readonly LayerQuarantine[];
    readonly pending: OptimisticPending;
    readonly activation: number;
};
export type OptimisticOverlayObserver = (state: OptimisticOverlayState) => void;
export type ReconciliationStore = ActivationFenceStore & {
    readonly optimisticLayers: (receiver: ReplicaDatabaseScope) => Promise<LayerRows>;
    readonly mappedHandles: (receiver: ReplicaDatabaseScope) => Promise<ReadonlyMap<string, EntityId>>;
};
export type ReconciliationOptions = {
    readonly keyId?: string | undefined;
    readonly entity?: ((id: EntityId) => number | undefined) | undefined;
};
export declare class OptimisticReconciler {
    private readonly store;
    private readonly receiver;
    private readonly catalog;
    private readonly options;
    private readonly fence;
    private readonly observers;
    private state;
    private handles;
    private refreshing;
    constructor(store: ReconciliationStore, receiver: ReplicaDatabaseScope, catalog: ClientProjectionCatalog, options?: ReconciliationOptions);
    snapshot(): OptimisticOverlayState;
    observe(observer: OptimisticOverlayObserver): () => void;
    refresh(): Promise<OptimisticOverlayState>;
    private readDurableLayers;
    restart(prior?: {
        readonly close: () => Promise<void>;
    } | undefined): Promise<number>;
    outcome(activation: number): () => Promise<void>;
    mappings(): ReadonlyMap<string, EntityId>;
    activation(): number;
    reconcile(progress: readonly QueueProgress[], prior?: {
        readonly close: () => Promise<void>;
    } | undefined): Promise<void>;
    resolver(): OverlayResolver;
    view(committed: Db): Promise<OverlayView>;
    private applyFence;
    private publish;
    private notify;
}
//# sourceMappingURL=reconciliation.d.ts.map