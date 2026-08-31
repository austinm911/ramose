import * as Effect from "effect/Effect";
import type { AllocationSlots } from "../../db/allocations.ts";
import type { OperationInputShape } from "./catalog.ts";
import { type CatalogId, type OperationTarget, type OwnerRef } from "./identities.ts";
import type { JsonValue } from "./json.ts";
export declare const OPERATION_VERSION_DESCRIPTOR_VERSION: 2;
export declare const DEFAULT_OPERATION_REVISION = 1;
export type OperationContractMaterial = {
    readonly representation: JsonValue;
    readonly shape: OperationInputShape;
};
export type OperationVersionDescriptor = {
    readonly catalog: CatalogId;
    readonly owner: OwnerRef;
    readonly localName: string;
    readonly target: OperationTarget;
    readonly revision: number;
    readonly input: OperationContractMaterial;
    readonly output: OperationContractMaterial;
    readonly composers: readonly string[];
    readonly writes: readonly string[];
    readonly allocations: AllocationSlots;
};
export declare const requireOperationRevision: (value: unknown, label: string) => number;
export declare const normalizeContractRepresentation: (representation: JsonValue) => JsonValue;
export declare const operationVersionMaterial: (descriptor: OperationVersionDescriptor) => JsonValue;
export declare const hashOperationVersion: (descriptor: OperationVersionDescriptor) => Effect.Effect<string & import("effect/Brand").Brand<"OperationVersion">, import("./failures.ts").InvalidIR, never>;
//# sourceMappingURL=operation-version.d.ts.map