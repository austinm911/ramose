export declare const replicaSweepKey: (partition: string) => string;
export declare const replicaSweepPrefix: (partitionPrefix: string) => string;
export declare class ReplicaReachability {
    private readonly known;
    private readonly frontier;
    private failed;
    constructor(roots: Iterable<string>);
    private add;
    next(limit: number): readonly string[];
    expand(children: Iterable<string>): void;
    fail(): void;
    get pending(): boolean;
    get complete(): boolean;
    get reachable(): ReadonlySet<string>;
}
export declare const unreachableNodeHashes: (stored: Iterable<string>, live: ReadonlySet<string>) => readonly string[];
export declare const stagingIsSweepable: (staging: {
    readonly baseRevision: string | null;
} | undefined, committedRevision: string | null) => boolean;
export type ReplicaStorageFailureKind = "quota" | "unrelated";
export declare const classifyReplicaStorageFailure: (error: unknown) => ReplicaStorageFailureKind;
export type ReplicaQuotaRecovery = "propagate" | "reclaim" | "exhausted";
export declare const replicaQuotaRecovery: (attempt: number, failure: ReplicaStorageFailureKind) => ReplicaQuotaRecovery;
declare const ReplicaQuotaExhaustedError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ReplicaQuotaExhaustedError";
} & Readonly<A>;
export declare class ReplicaQuotaExhaustedError extends ReplicaQuotaExhaustedError_base<{
    readonly partition: string;
    readonly reclaimedNodes: number;
}> {
}
export type ReplicaGcOutcome = {
    readonly partitions: number;
    readonly swept: number;
    readonly skipped: number;
    readonly nodes: number;
    readonly retained: number;
    readonly staging: number;
};
export {};
//# sourceMappingURL=replica-gc.d.ts.map