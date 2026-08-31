import type { Datom } from "../core/datom.ts";
import type { Db } from "../core/db.ts";
import { type EntityIdScope, type SealedEntityId } from "./entity-id.ts";
import type { ServerSealingKey } from "./server-identity.ts";
import { type EntityHandleBinding, type LogicalDatom, type SnapshotDatom, type SnapshotLogicalValue, type OpaqueReplicationId } from "./protocol.ts";
export type LogicalEntry = {
    readonly raw: Datom;
    readonly datom: SnapshotDatom;
    readonly handles: readonly EntityHandleBinding[];
};
export type LogicalEntityIdentity = {
    readonly identity: OpaqueReplicationId;
    readonly handle: SealedEntityId;
};
export type LogicalIdentityEncoder = {
    readonly database: string;
    readonly entity: (eid: number) => Promise<LogicalEntityIdentity>;
};
export declare const makeLogicalIdentityEncoder: (sealing: ServerSealingKey, database: string, scope: EntityIdScope) => LogicalIdentityEncoder;
export declare const entryHandles: (entries: Iterable<LogicalEntry>) => readonly EntityHandleBinding[];
export declare function projectLogicalValueParts(datom: Datom, encoder: LogicalIdentityEncoder, collect?: (entity: LogicalEntityIdentity) => void): AsyncGenerator<SnapshotLogicalValue, void, undefined>;
export type ProjectedDatom = {
    readonly datom: SnapshotDatom;
    readonly handles: readonly EntityHandleBinding[];
};
export declare function projectLogicalDatoms(db: Db, raw: Datom, encoder: LogicalIdentityEncoder): AsyncGenerator<ProjectedDatom, void, undefined>;
export declare function logicalEntries(db: Db, encoder: LogicalIdentityEncoder, signal?: AbortSignal): AsyncGenerator<LogicalEntry, void, undefined>;
export declare const digestLogicalDb: (db: Db, encoder: LogicalIdentityEncoder, signal?: AbortSignal) => Promise<OpaqueReplicationId>;
export type LogicalDelta = {
    readonly previousStateDigest: OpaqueReplicationId;
    readonly stateDigest: OpaqueReplicationId;
    readonly datoms: readonly LogicalDatom[];
    readonly handles: readonly EntityHandleBinding[];
    readonly overflow: boolean;
};
export type SnapshotChunkFits = (entries: readonly LogicalEntry[], index: number) => boolean;
export declare const diffLogicalDbs: (previous: Db, current: Db, encoder: LogicalIdentityEncoder, signal?: AbortSignal) => Promise<LogicalDelta>;
export declare function snapshotEntryChunks(db: Db, encoder: LogicalIdentityEncoder, fits: SnapshotChunkFits, signal?: AbortSignal): AsyncGenerator<readonly LogicalEntry[], void, undefined>;
export declare const chunkStillAuthorized: (current: Db, chunk: readonly LogicalEntry[], signal?: AbortSignal) => Promise<boolean>;
//# sourceMappingURL=logical.d.ts.map