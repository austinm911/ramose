import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { Unauthorized } from "../../db/Errors.ts";
import type { CatalogDefinitions, DeployedCatalogDefinition, DeployedCatalogDefinitions } from "./definitions.ts";
import { CatalogMismatch, InvalidIR } from "./failures.ts";
import type { CatalogId, CatalogUnitHash, DatabaseId } from "./identities.ts";
import type { DeployedCatalog } from "./deployed.ts";
declare const ResolvedDatabaseRouteTypeId: unique symbol;
declare const DatabaseCatalogBindingsTypeId: unique symbol;
export interface ResolvedDatabaseRoute {
    readonly [ResolvedDatabaseRouteTypeId]: typeof ResolvedDatabaseRouteTypeId;
    readonly database: DatabaseId;
    readonly deployed: DeployedCatalog;
}
export type DynamicGraphBinding = {
    readonly graphEntity: number;
    readonly catalogKey: CatalogId;
};
export type DatabaseRouteDerivation = {
    readonly rootDatabase: DatabaseId;
    readonly graphs: readonly DynamicGraphBinding[];
};
declare const DynamicCatalogDefinitionMissing_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "DynamicCatalogDefinitionMissing";
} & Readonly<A>;
export declare class DynamicCatalogDefinitionMissing extends DynamicCatalogDefinitionMissing_base<{
    readonly parentDatabase: DatabaseId;
    readonly graphEntity: number;
    readonly catalogKey: CatalogId;
}> {
}
declare const DatabaseCatalogBindingConflict_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "DatabaseCatalogBindingConflict";
} & Readonly<A>;
export declare class DatabaseCatalogBindingConflict extends DatabaseCatalogBindingConflict_base<{
    readonly database: DatabaseId;
    readonly expectedCatalogKey: CatalogId;
    readonly expectedUnitHash: CatalogUnitHash;
    readonly actualCatalogKey: CatalogId;
    readonly actualUnitHash: CatalogUnitHash;
}> {
}
declare const InvalidResolvedDatabaseRoute_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "InvalidResolvedDatabaseRoute";
} & Readonly<A>;
export declare class InvalidResolvedDatabaseRoute extends InvalidResolvedDatabaseRoute_base<{
    readonly message: string;
}> {
}
declare const InvalidDynamicGraphIdentity_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "InvalidDynamicGraphIdentity";
} & Readonly<A>;
export declare class InvalidDynamicGraphIdentity extends InvalidDynamicGraphIdentity_base<{
    readonly graphEntity: number;
}> {
}
export type DynamicDatabaseBindingFailure = DynamicCatalogDefinitionMissing | DatabaseCatalogBindingConflict | InvalidResolvedDatabaseRoute | InvalidDynamicGraphIdentity | InvalidIR;
export declare const opaqueDatabaseBindingDenial: (_error: DynamicDatabaseBindingFailure | CatalogMismatch) => Unauthorized;
export interface DatabaseCatalogBindings {
    readonly [DatabaseCatalogBindingsTypeId]: typeof DatabaseCatalogBindingsTypeId;
    readonly root: (database: DatabaseId) => Result.Result<ResolvedDatabaseRoute, CatalogMismatch>;
    readonly child: (parent: ResolvedDatabaseRoute, graph: DynamicGraphBinding) => Effect.Effect<ResolvedDatabaseRoute, DynamicDatabaseBindingFailure>;
}
export declare const deriveDynamicChildDatabaseId: (parentDatabase: string & import("effect/Brand").Brand<"DatabaseId">, graphEntity: number) => Effect.Effect<string & import("effect/Brand").Brand<"DatabaseId">, InvalidDynamicGraphIdentity | InvalidIR, never>;
export declare const deployDatabaseCatalogBindings: (definitions: CatalogDefinitions, roots: DeployedCatalogDefinitions) => Result.Result<DatabaseCatalogBindings, CatalogMismatch | InvalidIR>;
export declare const resolveBoundCatalogDefinition: (bindings: DatabaseCatalogBindings, route: ResolvedDatabaseRoute) => Result.Result<DeployedCatalogDefinition, InvalidResolvedDatabaseRoute>;
export declare const acquireResolvedDatabase: <A, E, R>(bindings: DatabaseCatalogBindings, route: ResolvedDatabaseRoute, acquire: (database: DatabaseId) => Effect.Effect<A, E, R>) => Effect.Effect<A, E | InvalidResolvedDatabaseRoute, R>;
export declare const deriveResolvedDatabaseRoute: (bindings: DatabaseCatalogBindings, derivation: DatabaseRouteDerivation) => Effect.Effect<ResolvedDatabaseRoute, CatalogMismatch | DynamicDatabaseBindingFailure, never>;
export {};
//# sourceMappingURL=database-bindings.d.ts.map