import * as Effect from "effect/Effect";
import { Unauthorized } from "../../db/Errors.ts";
import { type DatabaseCatalogBindings, type DatabaseRouteDerivation, type DynamicDatabaseBindingFailure, type ResolvedDatabaseRoute } from "./database-bindings.ts";
import { CatalogId, type CatalogUnitHash, type DatabaseId } from "./identities.ts";
import { type AuthenticatedCaller, type AuthorizedRequestContext, type AuthorizedRequestView } from "./request.ts";
import type { InstalledCatalogDefinition } from "./definitions.ts";
import type { Db } from "../core/db.ts";
declare const InvalidGraphPath_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "InvalidGraphPath";
} & Readonly<A>;
export declare class InvalidGraphPath extends InvalidGraphPath_base<{
    readonly index: number;
    readonly reason: string;
}> {
}
declare const GraphPathSegmentInaccessible_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "GraphPathSegmentInaccessible";
} & Readonly<A>;
export declare class GraphPathSegmentInaccessible extends GraphPathSegmentInaccessible_base<{
    readonly parentDatabase: DatabaseId;
    readonly index: number;
    readonly segment: string;
}> {
}
declare const GraphPathSegmentWrongKind_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "GraphPathSegmentWrongKind";
} & Readonly<A>;
export declare class GraphPathSegmentWrongKind extends GraphPathSegmentWrongKind_base<{
    readonly parentDatabase: DatabaseId;
    readonly index: number;
    readonly segment: string;
    readonly graphEntity: number;
}> {
}
declare const GraphPathCatalogUnavailable_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "GraphPathCatalogUnavailable";
} & Readonly<A>;
export declare class GraphPathCatalogUnavailable extends GraphPathCatalogUnavailable_base<{
    readonly parentDatabase: DatabaseId;
    readonly index: number;
    readonly graphEntity: number;
}> {
}
declare const GraphPathAuthorizationFailed_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "GraphPathAuthorizationFailed";
} & Readonly<A>;
export declare class GraphPathAuthorizationFailed extends GraphPathAuthorizationFailed_base<{
    readonly database: DatabaseId;
    readonly index: number;
}> {
}
declare const GraphPathDatabaseUnavailable_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "GraphPathDatabaseUnavailable";
} & Readonly<A>;
export declare class GraphPathDatabaseUnavailable extends GraphPathDatabaseUnavailable_base<{
    readonly database: DatabaseId;
    readonly index: number;
    readonly cause: unknown;
}> {
}
declare const GraphPathProvisioningFailed_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "GraphPathProvisioningFailed";
} & Readonly<A>;
export declare class GraphPathProvisioningFailed extends GraphPathProvisioningFailed_base<{
    readonly database: DatabaseId;
    readonly index: number;
    readonly cause: unknown;
}> {
}
export type GraphPathFailure = InvalidGraphPath | GraphPathSegmentInaccessible | GraphPathSegmentWrongKind | GraphPathCatalogUnavailable | GraphPathAuthorizationFailed | GraphPathDatabaseUnavailable | GraphPathProvisioningFailed | DynamicDatabaseBindingFailure;
export declare const opaqueGraphPathDenial: (_error: GraphPathFailure) => Unauthorized;
export type AuthorizedGraphPathInput<R = never, EDb = unknown, EProvision = unknown> = {
    readonly bindings: DatabaseCatalogBindings;
    readonly root: ResolvedDatabaseRoute;
    readonly path: readonly string[];
    readonly currentDb: (database: DatabaseId) => Effect.Effect<Db, EDb, R>;
    readonly provision: (route: ResolvedDatabaseRoute, derivation: DatabaseRouteDerivation) => Effect.Effect<void, EProvision, R>;
    readonly view?: AuthorizedRequestView;
};
export type GraphPathLeaseDependency = {
    readonly parentDatabase: DatabaseId;
    readonly graphEntity: number;
};
export type GraphPathLeaseRouteIdentity = {
    readonly database: DatabaseId;
    readonly catalogKey: CatalogId;
    readonly unitHash: CatalogUnitHash;
};
export type GraphPathLeaseIdentity = {
    readonly rootDatabase: DatabaseId;
    readonly path: readonly string[];
    readonly routes: readonly GraphPathLeaseRouteIdentity[];
    readonly dependencies: readonly GraphPathLeaseDependency[];
};
export type AuthorizedGraphPathTarget = {
    readonly route: ResolvedDatabaseRoute;
    readonly derivation: DatabaseRouteDerivation;
    readonly context: AuthorizedRequestContext;
    readonly routes: readonly ResolvedDatabaseRoute[];
    readonly dependencies: readonly GraphPathLeaseDependency[];
};
export declare const graphPathLeaseIdentity: (target: AuthorizedGraphPathTarget, path: readonly string[]) => GraphPathLeaseIdentity;
export declare const sameGraphPathLeaseIdentity: (left: GraphPathLeaseIdentity, right: GraphPathLeaseIdentity) => boolean;
export declare const graphPathLeaseDependsOn: (identity: GraphPathLeaseIdentity, dependency: GraphPathLeaseDependency) => boolean;
export type CatalogProvisioningAttribute = {
    readonly ":db/ident": string;
    readonly ":db/valueType": string;
    readonly ":db/cardinality": string;
    readonly ":db/unique"?: string;
    readonly ":db/index"?: true;
    readonly ":db/isComponent"?: true;
    readonly ":db/optional"?: true;
    readonly ":db/doc"?: string;
};
export declare const catalogProvisioningAttributes: (definition: InstalledCatalogDefinition) => readonly CatalogProvisioningAttribute[];
export declare const resolveAuthorizedGraphPath: <R, EDb, EProvision>(input: AuthorizedGraphPathInput<R, EDb, EProvision>, caller: AuthenticatedCaller) => Effect.Effect<AuthorizedGraphPathTarget, GraphPathFailure, R>;
export type ExecuteAuthorizedGraphPathInput<R = never, EDb = unknown, EProvision = unknown> = AuthorizedGraphPathInput<R, EDb, EProvision> & {
    readonly authenticate: Effect.Effect<AuthenticatedCaller, Unauthorized, R>;
    readonly interruptAfter?: import("effect/Duration").Input;
};
export declare const executeAuthorizedGraphPathTarget: <A, E, R, EDb = unknown, EProvision = unknown>(input: ExecuteAuthorizedGraphPathInput<R, EDb, EProvision>, execute: (target: AuthorizedGraphPathTarget) => Effect.Effect<A, E, R>) => Effect.Effect<A, E | Unauthorized, R>;
export declare const executeAuthorizedGraphPath: <A, E, R, EDb = unknown, EProvision = unknown>(input: ExecuteAuthorizedGraphPathInput<R, EDb, EProvision>, execute: (filteredDb: Db) => Effect.Effect<A, E, R>) => Effect.Effect<A, E | Unauthorized, R>;
export {};
//# sourceMappingURL=graph-path.d.ts.map