import type { AnySchema, AnySchemaDefinition } from "../db/Schema.ts";
import type { ReadCompatibilityHash } from "../internal/authorization/identities.ts";
import type { CompositionIndex } from "../internal/core/composition.ts";
import type { AttributeSpec } from "../internal/core/schema.ts";
import { type ClientProjectionCatalog, type InstalledProjection } from "../internal/replication/projection-binding.ts";
export type ClientCatalog = {
    readonly key: string;
    readonly schema: AnySchema;
    readonly attributes: readonly AttributeSpec[];
    readonly composition: CompositionIndex;
    readonly readCompatibilityHash: ReadCompatibilityHash;
    readonly projections: ClientProjectionCatalog;
};
export declare const installClientCatalog: (definition: AnySchemaDefinition, projections?: readonly InstalledProjection[]) => Promise<ClientCatalog>;
//# sourceMappingURL=catalog.d.ts.map