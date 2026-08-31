import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { Unauthorized } from "../../db/Errors.ts";
import type { CatalogDescriptor } from "./catalog.ts";
import type { InstalledCatalogUnitV2 } from "./catalog-unit.ts";
import type { CompositionIndex } from "../core/composition.ts";
import { CatalogMismatch, CatalogUnitCorrupt, CatalogVersionMismatch, InvalidIR } from "./failures.ts";
import type { CatalogId, CatalogUnitHash, CatalogVersion, DatabaseId } from "./identities.ts";
import type { PolicyTemplateIR } from "./ir.ts";
export type CatalogBoundRef = {
    readonly database: DatabaseId;
    readonly catalogKey: CatalogId;
    readonly unitHash: CatalogUnitHash;
};
export type DeployedCatalog = {
    readonly database: DatabaseId;
    readonly catalogKey: CatalogId;
    readonly unitHash: CatalogUnitHash;
    readonly unit: InstalledCatalogUnitV2;
    readonly composition: CompositionIndex;
};
export type DeployedCatalogs = {
    readonly requireDatabase: (database: DatabaseId) => Result.Result<DeployedCatalog, CatalogMismatch>;
    readonly databases: () => readonly DatabaseId[];
};
export type CatalogAssemblyUnit = {
    readonly catalog: CatalogId;
    readonly database: DatabaseId;
    readonly version: CatalogVersion;
    readonly children?: readonly CatalogId[];
    readonly descriptor: CatalogDescriptor;
    readonly policy: PolicyTemplateIR;
};
export type CatalogAssemblyInput = {
    readonly root: CatalogId;
    readonly units: readonly CatalogAssemblyUnit[];
};
export declare const requireCatalogKey: (actual: CatalogId, expected: CatalogId) => Result.Result<void, CatalogMismatch>;
export declare const requireUnitHash: (actual: CatalogUnitHash, expected: CatalogUnitHash, catalog: CatalogId) => Result.Result<void, CatalogVersionMismatch>;
export declare const resolveDeployedCatalog: (catalogs: DeployedCatalogs, ref: CatalogBoundRef) => Result.Result<DeployedCatalog, CatalogMismatch | CatalogVersionMismatch>;
export declare const opaqueCatalogDenial: (_error: CatalogMismatch | CatalogVersionMismatch) => Unauthorized;
export declare const assembleDeployedCatalogs: (input: CatalogAssemblyInput) => Effect.Effect<DeployedCatalogs, CatalogMismatch | CatalogUnitCorrupt | InvalidIR, never>;
//# sourceMappingURL=deployed.d.ts.map