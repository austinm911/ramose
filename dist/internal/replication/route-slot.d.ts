export type ReplicaRouteSlot = string;
export type ReplicaRouteScope = {
    readonly origin: string;
    readonly root: string;
};
export declare const rootReplicaRouteSlot: () => Promise<ReplicaRouteSlot>;
export declare const stableReplicaRouteSlot: (lineage: readonly string[]) => Promise<ReplicaRouteSlot>;
export declare const provisionalReplicaRouteSlot: (graphPath: readonly string[]) => Promise<ReplicaRouteSlot>;
export declare const replicaRouteScope: (scope: ReplicaRouteScope) => Promise<string>;
export declare const replicaRoutePathKey: (graphPath: readonly string[]) => Promise<string>;
export declare const replicaRouteSlotFor: (input: {
    readonly graphPath: readonly string[];
    readonly lineage?: readonly string[] | undefined;
}) => Promise<ReplicaRouteSlot>;
//# sourceMappingURL=route-slot.d.ts.map