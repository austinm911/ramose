import { type AllocationPathSegment } from "../../db/allocations.ts";
import { type ClientRef } from "../../db/refs.ts";
import { type EntityIdScope, type SealedEntityId } from "../replication/entity-id.ts";
import type { ServerSealingKey } from "../replication/server-identity.ts";
import type { AllocationSlotDescriptor, OperationInputShape, OperationWireShape } from "./catalog.ts";
export type InvocationAllocation = {
    readonly slot: string;
    readonly clientRef: ClientRef;
};
export declare const parseInvocationAllocations: (value: unknown) => readonly InvocationAllocation[] | undefined;
export type EpochBoundScope = {
    readonly keyId: string;
    readonly scope: EntityIdScope;
};
export type EpochDecision = {
    readonly _tag: "Agreed";
    readonly sealing: ServerSealingKey;
    readonly scope: EntityIdScope;
} | {
    readonly _tag: "UpdateRequired";
};
export declare const decideEpoch: (bound: EpochBoundScope, sealing: ServerSealingKey) => EpochDecision;
export declare const sameEpochScope: (left: EpochBoundScope, right: EpochBoundScope) => boolean;
export declare const parseEntityIdScope: (value: unknown) => EntityIdScope | undefined;
export type SealedTargetResolution = {
    readonly _tag: "Resolved";
    readonly eid: number;
} | {
    readonly _tag: "UpdateRequired";
} | {
    readonly _tag: "Denied";
};
export declare const resolveSealedTarget: (sealing: ServerSealingKey, scope: EntityIdScope, token: string) => Promise<SealedTargetResolution>;
export declare const isEntityRefPath: (shape: OperationInputShape, path: readonly AllocationPathSegment[]) => boolean;
export type AllocatedSlot = {
    readonly slot: string;
    readonly eid: number;
};
export type AllocationExtraction = {
    readonly _tag: "Allocated";
    readonly slots: readonly AllocatedSlot[];
} | {
    readonly _tag: "Unallocated";
    readonly slot: string;
};
export declare const allocatedEids: (tempids: Readonly<Record<string, number>>) => ReadonlySet<number>;
export declare const extractAllocations: (declared: readonly AllocationSlotDescriptor[], outputShape: OperationInputShape, output: unknown, requested: readonly InvocationAllocation[], allocated: ReadonlySet<number>) => AllocationExtraction;
export declare const outputEntityRefPaths: (shape: OperationInputShape, output: unknown) => readonly (readonly AllocationPathSegment[])[];
export declare const sealOutputEntityRefs: (sealing: ServerSealingKey, scope: EntityIdScope, output: unknown, paths: readonly (readonly AllocationPathSegment[])[]) => Promise<unknown>;
export declare const mayCarrySealedEntityId: (input: unknown) => boolean;
export declare const inputEntityRefHandles: (shape: OperationWireShape, input: unknown) => readonly (readonly AllocationPathSegment[])[];
export type SealedInputResolution = {
    readonly _tag: "Resolved";
    readonly input: unknown;
} | {
    readonly _tag: "UpdateRequired";
} | {
    readonly _tag: "Denied";
};
export declare const resolveSealedInputRefs: (sealing: ServerSealingKey, scope: EntityIdScope, input: unknown, paths: readonly (readonly AllocationPathSegment[])[]) => Promise<SealedInputResolution>;
export type SealedAllocationMapping = {
    readonly slot: string;
    readonly clientRef: string;
    readonly entityId: SealedEntityId;
};
export declare const sealAllocationMappings: (sealing: ServerSealingKey, scope: EntityIdScope, slots: readonly AllocatedSlot[], requested: readonly InvocationAllocation[]) => Promise<readonly SealedAllocationMapping[]>;
//# sourceMappingURL=entity-targets.d.ts.map