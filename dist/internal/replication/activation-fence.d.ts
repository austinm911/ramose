import type { InvocationId } from "../../db/refs.ts";
import type { ReplicationFrame } from "./protocol.ts";
import type { ActivationFenceOutcome, ActivationObservationState } from "./outbox-storage.ts";
import type { UnobservedReceipt } from "./outbox.ts";
import type { ReplicaDatabaseScope } from "./replica-lifecycle.ts";
import type { QueueProgress } from "./submission.ts";
export declare const satisfiesActivationFence: (frame: ReplicationFrame["type"]) => boolean;
export declare const requiresActivationFence: (progress: QueueProgress) => boolean;
export type ActivationFenceSnapshot = {
    readonly receiver: ReplicaDatabaseScope;
    readonly activation: number;
    readonly unobserved: readonly UnobservedReceipt[];
    readonly fenced: readonly InvocationId[];
};
export type ActivationFenceObserver = (snapshot: ActivationFenceSnapshot) => void;
export type ActivationFenceStore = {
    readonly observationState: (receiver: ReplicaDatabaseScope) => Promise<ActivationObservationState>;
    readonly beginActivation: (receiver: ReplicaDatabaseScope) => Promise<number>;
    readonly fenceActivation: (receiver: ReplicaDatabaseScope, activation: number) => Promise<ActivationFenceOutcome>;
};
export declare class ActivationFence {
    private readonly store;
    private readonly receiver;
    private state;
    private readonly observers;
    private settled;
    constructor(store: ActivationFenceStore, receiver: ReplicaDatabaseScope);
    snapshot(): ActivationFenceSnapshot;
    observe(observer: ActivationFenceObserver): () => void;
    refresh(): Promise<ActivationFenceSnapshot>;
    begin(): Promise<number>;
    restart(prior?: {
        readonly close: () => Promise<void>;
    } | undefined): Promise<number>;
    settle(activation: number): Promise<ActivationFenceOutcome | undefined>;
    outcome(activation: number): () => Promise<void>;
    private publish;
    private notify;
}
//# sourceMappingURL=activation-fence.d.ts.map