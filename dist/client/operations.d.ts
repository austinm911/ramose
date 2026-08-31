import type { AllocationSlots } from "../db/allocations.ts";
import type { AnySchema, AnySchemaDefinition } from "../db/Schema.ts";
import { type AnyOptimisticProjection } from "../db/Projection.ts";
import type { OperationInputShape } from "../internal/authorization/catalog.ts";
import { CatalogId, type OperationVersion, type OwnerRef } from "../internal/authorization/identities.ts";
import type { CompositionIndex } from "../internal/core/composition.ts";
import type { InstalledProjection } from "../internal/replication/projection-binding.ts";
export type ClientOperation = {
    readonly owner: OwnerRef;
    readonly localName: string;
    readonly self: boolean;
    readonly version: () => Promise<OperationVersion>;
    readonly allocations: AllocationSlots;
    readonly composers: readonly string[];
    readonly input: OperationInputShape;
    readonly encode: (input: unknown) => unknown;
    readonly optimistic: {
        readonly revision: number;
        readonly run: AnyOptimisticProjection;
    } | undefined;
};
export type ClientOperations = {
    readonly catalog: CatalogId;
    readonly database: ReadonlyMap<string, ClientOperation>;
    readonly self: ReadonlyMap<string, ReadonlyMap<string, ClientOperation>>;
    readonly installed: readonly InstalledProjection[];
};
export declare const installClientOperations: (definition: AnySchemaDefinition, schema: AnySchema) => ClientOperations;
export declare const selfOperationsFor: (operations: ClientOperations, composition: CompositionIndex, focus: {
    readonly kind: "entity" | "trait";
    readonly name: string;
}) => ReadonlyMap<string, ClientOperation>;
//# sourceMappingURL=operations.d.ts.map