import type { AuthenticatedCaller } from "../authorization/request.ts";
import type { GraphPathLeaseIdentity } from "../authorization/graph-path.ts";
import type { ResolvedDatabaseRoute } from "../authorization/database-bindings.ts";
import type { JsonValue } from "../authorization/json.ts";
import type { DatabaseId, ReadCompatibilityHash } from "../authorization/identities.ts";
import type { OpaqueReplicationId, ReplicationIdentity } from "./protocol.ts";
import type { EntityIdScope } from "./entity-id.ts";
import { type ServerSealingKey } from "./server-identity.ts";
export declare const opaqueHmac: (sealing: ServerSealingKey, domain: string, value: JsonValue) => Promise<OpaqueReplicationId>;
export declare const opaqueDigest: (domain: string, bytes: Uint8Array) => Promise<OpaqueReplicationId>;
export type ReplicationIdentityInput = {
    readonly sealing: ServerSealingKey;
    readonly origin: string;
    readonly caller: AuthenticatedCaller;
    readonly path: GraphPathLeaseIdentity;
    readonly readRoutes: readonly ReplicationReadRouteIdentity[];
};
export type ReplicationReadRouteIdentity = {
    readonly database: DatabaseId;
    readonly readCompatibilityHash: ReadCompatibilityHash;
    readonly readPolicy: string;
};
export declare const replicationReadRouteIdentities: (routes: readonly ResolvedDatabaseRoute[]) => Promise<readonly ReplicationReadRouteIdentity[]>;
export type EntityIdScopeInput = {
    readonly origin: string;
    readonly caller: AuthenticatedCaller;
    readonly database: DatabaseId;
};
export type ReplicationEntityIdScope = EntityIdScope & {
    readonly server: OpaqueReplicationId;
    readonly principal: OpaqueReplicationId;
    readonly database: OpaqueReplicationId;
};
export declare const makeEntityIdScope: (sealing: ServerSealingKey, input: EntityIdScopeInput) => Promise<ReplicationEntityIdScope>;
export declare const entityIdScopeOf: (identity: ReplicationIdentity) => ReplicationEntityIdScope;
export declare const makeReplicationIdentity: (input: ReplicationIdentityInput) => Promise<ReplicationIdentity>;
export declare const makeEntityIdentity: (sealing: ServerSealingKey, database: string, eid: number) => Promise<OpaqueReplicationId>;
export declare const makeRevision: (sealing: ServerSealingKey, identity: ReplicationIdentity, stateDigest: OpaqueReplicationId) => Promise<OpaqueReplicationId>;
export declare const makeSnapshotIdentity: (sealing: ServerSealingKey, identity: ReplicationIdentity, revision: OpaqueReplicationId) => Promise<OpaqueReplicationId>;
//# sourceMappingURL=identity.d.ts.map