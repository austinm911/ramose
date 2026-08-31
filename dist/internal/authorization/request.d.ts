import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { Unauthorized } from "../../db/Errors.ts";
import type { Db } from "../core/db.ts";
import type { InstalledCatalogUnitV2 } from "./catalog-unit.ts";
import { type DatabaseCatalogBindings, type ResolvedDatabaseRoute } from "./database-bindings.ts";
import { type DeployedCatalogs } from "./deployed.ts";
import { type CatalogId, type CatalogUnitHash, type DatabaseId } from "./identities.ts";
import type { JsonValue } from "./json.ts";
import type { AuthorizationPrincipal } from "./principal.ts";
export type AuthenticatedCaller = {
    readonly claims: Readonly<Record<string, JsonValue>>;
    readonly classes: readonly string[];
    readonly exp: number;
};
export type AuthorizedRequestView = {
    readonly asOf?: number;
    readonly history?: boolean;
};
export type AuthorizedRequestContext = {
    readonly unit: InstalledCatalogUnitV2;
    readonly principal: AuthorizationPrincipal;
    readonly currentDb: Db;
    readonly filteredDb: Db;
};
export type AuthorizedRequestInput<R = never, EDb = unknown> = {
    readonly authenticate: Effect.Effect<AuthenticatedCaller, Unauthorized, R>;
    readonly catalogs: DeployedCatalogs;
    readonly routeDatabase: DatabaseId;
    readonly catalogKey: CatalogId;
    readonly unitHash: CatalogUnitHash;
    readonly currentDb: (database: DatabaseId) => Effect.Effect<Db, EDb, R>;
    readonly view?: AuthorizedRequestView;
    readonly interruptAfter?: Duration.Input;
};
export type AuthorizedResolvedRequestInput<R = never, EDb = unknown> = {
    readonly authenticate: Effect.Effect<AuthenticatedCaller, Unauthorized, R>;
    readonly bindings: DatabaseCatalogBindings;
    readonly route: ResolvedDatabaseRoute;
    readonly currentDb: (database: DatabaseId) => Effect.Effect<Db, EDb, R>;
    readonly view?: AuthorizedRequestView;
    readonly interruptAfter?: Duration.Input;
};
export declare const callerFromVerified: (verified: {
    readonly exp: number;
    readonly principal: {
        readonly sub?: string;
        readonly class: string;
        readonly classes?: readonly string[];
        readonly claims: {
            readonly attrs?: Record<string, unknown>;
        };
    };
}) => AuthenticatedCaller;
export declare const constructAuthorizedRequestContext: <R, EDb>(input: AuthorizedRequestInput<R, EDb>, caller: AuthenticatedCaller) => Effect.Effect<AuthorizedRequestContext, Unauthorized | EDb, R>;
export declare const constructAuthorizedResolvedRequestContext: <R, EDb>(input: AuthorizedResolvedRequestInput<R, EDb>, caller: AuthenticatedCaller) => Effect.Effect<AuthorizedRequestContext, Unauthorized | EDb, R>;
export type AuthorizedLeaseInput<R> = {
    readonly authenticate: Effect.Effect<AuthenticatedCaller, Unauthorized, R>;
    readonly interruptAfter?: Duration.Input;
};
export declare const executeWithinAuthorizedLease: <A, E, R>(input: AuthorizedLeaseInput<R>, execute: (caller: AuthenticatedCaller) => Effect.Effect<A, E, R>) => Effect.Effect<A, Unauthorized | E, R>;
export declare const executeAuthorizedRequest: <A, E, R, EDb = unknown>(input: AuthorizedRequestInput<R, EDb>, execute: (filteredDb: Db) => Effect.Effect<A, E, R>) => Effect.Effect<A, E | EDb | Unauthorized, R>;
export declare const executeAuthorizedResolvedRequest: <A, E, R, EDb = unknown>(input: AuthorizedResolvedRequestInput<R, EDb>, execute: (filteredDb: Db) => Effect.Effect<A, E, R>) => Effect.Effect<A, E | EDb | Unauthorized, R>;
//# sourceMappingURL=request.d.ts.map