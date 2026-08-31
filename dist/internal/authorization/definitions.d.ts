import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { type AnySchemaDefinition } from "../../db/Schema.ts";
import { type CompiledCreationOptions } from "../../db/creation.ts";
import { type CreationDefaultContext } from "../../db/Field.ts";
import type { CompositionIndex } from "../core/composition.ts";
import { type AssembleCatalogUnitFailure, type InstalledCatalogUnitV2 } from "./catalog-unit.ts";
import { CatalogMismatch, CatalogUnitCorrupt, CatalogVersionMismatch, InvalidIR } from "./failures.ts";
import { CatalogId, type CatalogUnitHash, DatabaseId, type DigestHex } from "./identities.ts";
import { type InstallFailure } from "./install.ts";
import { type DeployedOperationBinding } from "./authoring/operations.ts";
import { type CatalogBoundRef, type DeployedCatalogs } from "./deployed.ts";
export type InstalledFieldRuntime = {
    readonly cardinality: "one" | "many";
    readonly validate: (value: unknown) => void;
    readonly fixed: {
        readonly _tag: "mutable";
    } | {
        readonly _tag: "fixed";
        readonly value: unknown;
    };
};
export type InstalledCatalogDefinition = {
    readonly catalogKey: CatalogId;
    readonly unitHash: CatalogUnitHash;
    readonly unit: InstalledCatalogUnitV2;
    readonly composition: CompositionIndex;
    readonly operations: readonly DeployedOperationBinding[];
    readonly path: readonly string[];
    readonly resolveCreationValues: (entityName: string, input: Readonly<Record<string, unknown>>, context: CreationDefaultContext, options?: CompiledCreationOptions) => Readonly<Record<string, unknown>>;
    readonly requireFieldRuntime: (entityName: string, fieldIdent: string) => InstalledFieldRuntime;
    readonly validateFieldValue: (fieldIdent: string, value: unknown) => void;
};
export type CatalogDefinitions = {
    readonly root: CatalogId;
    readonly require: (catalogKey: CatalogId) => Result.Result<InstalledCatalogDefinition, CatalogMismatch>;
    readonly keys: () => readonly CatalogId[];
};
export type CatalogDefinitionDeployment = {
    readonly database: DatabaseId;
    readonly catalogKey: CatalogId;
};
export type DeployedCatalogDefinition = {
    readonly database: DatabaseId;
    readonly definition: InstalledCatalogDefinition;
};
export type DeployedCatalogDefinitions = {
    readonly catalogs: DeployedCatalogs;
    readonly requireDatabase: (database: DatabaseId) => Result.Result<DeployedCatalogDefinition, CatalogMismatch>;
    readonly databases: () => readonly DatabaseId[];
};
export type CatalogDefinitionBoundRef = {
    readonly catalogKey: CatalogId;
    readonly unitHash: CatalogUnitHash;
};
export type AssembleCatalogDefinitionsInput = {
    readonly root: AnySchemaDefinition;
    readonly artifactHash: DigestHex;
};
type AssemblyFailure = AssembleCatalogUnitFailure | CatalogUnitCorrupt | InstallFailure | InvalidIR;
export declare const resolveCatalogDefinition: (definitions: CatalogDefinitions, ref: CatalogDefinitionBoundRef) => Result.Result<InstalledCatalogDefinition, CatalogMismatch | CatalogVersionMismatch>;
export declare const assembleCatalogDefinitions: (input: AssembleCatalogDefinitionsInput) => Effect.Effect<CatalogDefinitions, AssemblyFailure, never>;
export declare const deployCatalogDefinitions: (definitions: CatalogDefinitions, deployments: readonly CatalogDefinitionDeployment[]) => Result.Result<DeployedCatalogDefinitions, CatalogMismatch | InvalidIR>;
export declare const resolveDeployedCatalogDefinition: (deployed: DeployedCatalogDefinitions, ref: CatalogBoundRef) => Result.Result<DeployedCatalogDefinition, CatalogMismatch | CatalogVersionMismatch>;
export {};
//# sourceMappingURL=definitions.d.ts.map