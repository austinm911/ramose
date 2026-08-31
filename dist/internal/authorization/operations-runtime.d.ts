import * as Effect from "effect/Effect";
import { Unauthorized } from "../../db/Errors.ts";
import type { DeployedOperationBinding } from "./authoring/operations.ts";
import type { Connection, TxReport } from "../core/conn.ts";
import type { EntityRef } from "../core/db.ts";
import type { OperationDescriptor, OperationInputShape, OperationWireShape } from "./catalog.ts";
import { type DeployedCatalogDefinition, type DeployedCatalogDefinitions } from "./definitions.ts";
import { type DatabaseCatalogBindings, type DatabaseRouteDerivation, type ResolvedDatabaseRoute } from "./database-bindings.ts";
import type { CatalogId, CatalogUnitHash, DatabaseId, OperationVersion, OwnerRef } from "./identities.ts";
import { type AuthenticatedCaller, type AuthorizedRequestContext } from "./request.ts";
import type { InvocationReplayFenceV1 } from "./invocation-receipts.ts";
import { type InvocationAllocation, type SealedAllocationMapping } from "./entity-targets.ts";
import type { EntityIdScope } from "../replication/entity-id.ts";
import type { ServerSealingKey } from "../replication/server-identity.ts";
export type OperationInvocation = {
    readonly database: DatabaseId;
    readonly catalogKey: CatalogId;
    readonly unitHash: CatalogUnitHash;
    readonly owner: OwnerRef;
    readonly localName: string;
    readonly operationVersion?: OperationVersion;
    readonly target?: EntityRef;
    readonly sealedTarget?: string;
    readonly entityIdScope?: EntityIdScope;
    readonly entityIdKeyId?: string;
    readonly allocations?: readonly InvocationAllocation[];
    readonly input: unknown;
    readonly caller: AuthenticatedCaller;
    readonly routeDerivation?: DatabaseRouteDerivation;
};
export type OperationExecution = {
    readonly report: TxReport;
    readonly output: unknown;
    readonly replayFence: InvocationReplayFenceV1;
    readonly allocations: readonly SealedAllocationMapping[];
    readonly assertFresh: () => void;
};
export type OperationRuntime = {
    readonly catalogs: DeployedCatalogDefinitions;
    readonly bindings?: DatabaseCatalogBindings;
    readonly environment: unknown;
    readonly now: () => number;
    readonly sealing?: () => Promise<ServerSealingKey>;
};
export type ResolvedOperationCatalog = {
    readonly deployed: DeployedCatalogDefinition;
    readonly route?: ResolvedDatabaseRoute;
};
declare const OPERATION_ADMISSION: unique symbol;
export type CatalogOperationAdmission = {
    readonly [OPERATION_ADMISSION]: {
        readonly connection: Connection;
        readonly runtime: OperationRuntime;
        readonly invocation: OperationInvocation;
    };
    readonly resolved: ResolvedOperationCatalog;
    readonly binding: DeployedOperationBinding;
    readonly descriptor: OperationDescriptor;
    readonly context: AuthorizedRequestContext;
    readonly decoded: unknown;
    readonly expiresAtSeconds: number;
    readonly authoritativeNowMs: number;
    readonly target?: {
        readonly eid: number;
        readonly type: string;
    };
};
export declare const resolveOperationCatalog: (runtime: OperationRuntime, invocation: OperationInvocation) => Effect.Effect<ResolvedOperationCatalog, Unauthorized, never>;
export declare class OperationRuntimeFault extends Error {
    readonly stage: string;
    readonly detail: unknown;
    constructor(stage: string, detail: unknown);
}
export declare const opaqueOperationDenial: () => Unauthorized;
export declare const deployedOperationVersion: (resolved: ResolvedOperationCatalog, owner: OwnerRef, localName: string) => OperationVersion | undefined;
export declare const deployedOperationOutputShape: (resolved: ResolvedOperationCatalog, owner: OwnerRef, localName: string) => OperationInputShape | undefined;
export declare const deployedOperationInputWireShape: (resolved: ResolvedOperationCatalog, owner: OwnerRef, localName: string) => OperationWireShape | undefined;
export declare const authorizeCatalogOperationGrant: (connection: Connection, runtime: OperationRuntime, invocation: OperationInvocation, resolvedCatalog?: ResolvedOperationCatalog) => Promise<void>;
export declare const authorizeCatalogOperation: (connection: Connection, runtime: OperationRuntime, invocation: OperationInvocation, resolvedCatalog?: ResolvedOperationCatalog) => Promise<CatalogOperationAdmission>;
export declare const authorizeCatalogOperationReplay: (connection: Connection, runtime: OperationRuntime, invocation: OperationInvocation, replayFence: InvocationReplayFenceV1, resolvedCatalog?: ResolvedOperationCatalog) => Promise<void>;
export declare const executeCatalogOperation: (connection: Connection, runtime: OperationRuntime, invocation: OperationInvocation, resolvedCatalog?: ResolvedOperationCatalog, admitted?: CatalogOperationAdmission, sealing?: ServerSealingKey) => Promise<OperationExecution>;
export {};
//# sourceMappingURL=operations-runtime.d.ts.map