import * as Effect from "effect/Effect";
import type { AnySchemaDefinition } from "../db/Schema.ts";
import { type DeployedCatalogDefinitions } from "../internal/authorization/definitions.ts";
import { type DatabaseCatalogBindings } from "../internal/authorization/database-bindings.ts";
import { CatalogId, type CatalogUnitHash } from "../internal/authorization/identities.ts";
declare const OperationCatalogsTypeId: unique symbol;
export interface OperationCatalogProof {
    readonly catalog: string;
    readonly unitHash: string;
}
export interface OperationCatalogs {
    readonly [OperationCatalogsTypeId]: typeof OperationCatalogsTypeId;
    readonly proof: (database: string) => OperationCatalogProof | undefined;
}
export interface OperationCatalogDeployment {
    readonly database: string;
    readonly catalogKey?: string;
}
export interface DeployOperationCatalogsInput {
    readonly root: AnySchemaDefinition;
    readonly deployments: readonly OperationCatalogDeployment[];
}
declare const OperationCatalogDeploymentError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "OperationCatalogDeploymentError";
} & Readonly<A>;
export declare class OperationCatalogDeploymentError extends OperationCatalogDeploymentError_base<{
    readonly message: string;
}> {
}
export declare const deployedCatalogProof: (operationCatalogs: OperationCatalogs, database: string) => {
    readonly catalogKey: CatalogId;
    readonly unitHash: CatalogUnitHash;
} | undefined;
export declare const deployedOperationCatalogs: (operationCatalogs: OperationCatalogs) => DeployedCatalogDefinitions;
export declare const deployedDatabaseCatalogBindings: (operationCatalogs: OperationCatalogs) => DatabaseCatalogBindings;
export declare const deployOperationCatalogsForVersion: (input: DeployOperationCatalogsInput, versionMetadata: unknown) => Effect.Effect<OperationCatalogs, OperationCatalogDeploymentError, never>;
export {};
//# sourceMappingURL=operation-catalogs.d.ts.map