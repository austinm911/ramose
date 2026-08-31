import type { CodeDefinition } from "../../db/Binding.ts";
import { type AnySchema } from "../../db/Schema.ts";
import type { CatalogDescriptor } from "./catalog.ts";
import { CatalogId } from "./identities.ts";
export type CatalogReadTables = Omit<CatalogDescriptor, "database" | "version" | "fingerprint">;
export declare const completeSchema: (definition: CodeDefinition) => AnySchema;
export declare const descriptorTables: (catalog: CatalogId, schema: AnySchema, operations: CatalogDescriptor["operations"]) => CatalogReadTables;
export declare const catalogReadTables: (definition: CodeDefinition) => CatalogReadTables;
//# sourceMappingURL=read-tables.d.ts.map