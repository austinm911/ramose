import type { ReadCompatibilityHash } from "../authorization/identities.ts";
import { Db, type Roots } from "../core/db.ts";
import { type AttributeSpec } from "../core/schema.ts";
import { type RuntimeBoundaries } from "../runtime-boundaries.ts";
import { type Change, type ReplicationIdentity, type SnapshotChunk, type SnapshotCommit, type SnapshotStart } from "./protocol.ts";
import type { ReplicaRouteSlot } from "./route-slot.ts";
import { IndexedDbOutbox } from "./outbox-storage.ts";
import { type ReplicaGcOutcome } from "./replica-gc.ts";
import type { LeadershipFence } from "./leadership.ts";
import { type ReplicaNoticeListener } from "./notices.ts";
import { ReplicaLease, type ReplicaDatabaseScope, type ReplicaScope } from "./replica-lifecycle.ts";
import { type ReplicaRestoreOutcome } from "./replica-integrity.ts";
export declare const REPLICA_MANIFEST_STORAGE_VERSION: number;
export declare const REPLICA_DATABASE_VERSION: number;
export declare const DEFAULT_REPLICA_DATABASE_NAME = "ramose-replicas";
export { replicaPartitionKey } from "./replica-lifecycle.ts";
export { ReplicaQuotaExhaustedError, replicaSweepKey, type ReplicaGcOutcome, } from "./replica-gc.ts";
export declare const REPLICA_GRAPH_RECEIVER_VERSION: 1;
export type ReplicaGraphReceiver = {
    readonly key: string;
    readonly version: typeof REPLICA_GRAPH_RECEIVER_VERSION;
    readonly scope: string;
    readonly route: string;
    readonly graphPath: readonly string[];
    readonly graphLineage: readonly string[];
    readonly confirmedAt: number;
};
export type ReplicaRouteObservation = {
    readonly scope: string;
    readonly pathKey: string;
};
export type ReplicaWriteCounts = {
    readonly nodes: number;
    readonly manifests: number;
    readonly heads: number;
    readonly staging: number;
    readonly stagingChunks: number;
};
export type RestoredReplica = {
    readonly db: Db;
    readonly revision: string;
    readonly handles: ReadonlyMap<string, number>;
    readonly release: () => void;
};
export type BoundRestoredReplica = RestoredReplica & {
    readonly identity: ReplicationIdentity;
};
export type ReplicaCacheCandidate = {
    readonly identity: ReplicationIdentity;
    readonly revision: string;
};
export type ReplicaCacheCandidateKey = {
    readonly selector: string;
    readonly routeSlot: ReplicaRouteSlot;
};
export type ReplicaAuthenticatedBinding = {
    readonly fingerprint: string;
    readonly identity: ReplicationIdentity;
    readonly candidateKey?: ReplicaCacheCandidateKey | undefined;
    readonly route?: (ReplicaRouteObservation & {
        readonly slot: ReplicaRouteSlot;
        readonly graphPath?: readonly string[];
    }) | undefined;
};
export type ReplicaInstallOptions = {
    readonly signal?: AbortSignal;
    readonly lease?: ReplicaLease | undefined;
};
export type ReplicaClearOutcome = {
    readonly scope: string;
    readonly generation: number;
    readonly partitions: number;
    readonly nodes: number;
    readonly bindings: number;
    readonly candidates: number;
    readonly routeObservations: number;
    readonly queued: number;
    readonly clientRefs: number;
    readonly layers: number;
};
export type ReplicaEvictOutcome = {
    readonly database: string;
    readonly generation: number;
    readonly partitions: number;
    readonly nodes: number;
    readonly bindings: number;
    readonly candidates: number;
};
export type ReplicaScopeParticipant = {
    readonly scope: ReplicaScope;
    readonly database?: ReplicaDatabaseScope | undefined;
    readonly close: () => Promise<void>;
};
export declare class IndexedDbReplicaStorage {
    readonly name: string;
    private readonly database;
    private readonly boundaries;
    private readonly channel;
    private readonly clearedScopes;
    private readonly registry;
    private readonly registrations;
    private readonly invalidations;
    private readonly meter;
    private constructor();
    static open(name?: string, boundaries?: RuntimeBoundaries): Promise<IndexedDbReplicaStorage>;
    notices(listener: ReplicaNoticeListener): () => void;
    announces(): boolean;
    private announce;
    onInvalidated(listener: () => void): () => void;
    private invalidated;
    close(): void;
    writeCounts(): ReplicaWriteCounts;
    resetWriteCounts(): void;
    private register;
    outbox(leader?: () => LeadershipFence | undefined): IndexedDbOutbox;
    claimLeadership(key: string, scope: ReplicaScope): Promise<number>;
    admission(): Promise<number>;
    lease(): Promise<ReplicaLease>;
    confirmLease(lease: ReplicaLease, identity: ReplicationIdentity): Promise<void>;
    leaseFor(identity: ReplicationIdentity): Promise<ReplicaLease>;
    pinDatabase(scope: ReplicaDatabaseScope): () => void;
    retainRoots(identity: ReplicationIdentity, roots: Roots): () => void;
    private markMaterializing;
    enroll(participant: ReplicaScopeParticipant): () => void;
    private assertScopeLive;
    private closeMatching;
    clearScope(scope: ReplicaScope): Promise<ReplicaClearOutcome>;
    private stageClear;
    evictDatabase(scope: ReplicaDatabaseScope): Promise<ReplicaEvictOutcome>;
    private stageEviction;
    collectGarbage(options?: {
        readonly scope?: ReplicaScope | undefined;
    }): Promise<ReplicaGcOutcome>;
    private surveyPartitions;
    private surveyManifest;
    private liveNodeHashes;
    private retainedRoots;
    private sweepPartition;
    private committed;
    private priorManifest;
    private quarantinePartition;
    private validated;
    private validatedOnce;
    private confirmNoSweep;
    private sweepGeneration;
    private confirmGuardingGenerations;
    boundIdentity(fingerprint: string): Promise<ReplicationIdentity | undefined>;
    unbindCredential(fingerprint: string): Promise<void>;
    restoreOutcome(identity: ReplicationIdentity, attributes: readonly AttributeSpec[], readCompatibilityHash: ReadCompatibilityHash): Promise<ReplicaRestoreOutcome<RestoredReplica>>;
    restore(identity: ReplicationIdentity, attributes: readonly AttributeSpec[], readCompatibilityHash: ReadCompatibilityHash): Promise<RestoredReplica | undefined>;
    selectCacheCandidate(key: ReplicaCacheCandidateKey, readCompatibilityHash: ReadCompatibilityHash): Promise<ReplicaCacheCandidate | undefined>;
    restoreCandidateOutcome(candidate: ReplicaCacheCandidate, attributes: readonly AttributeSpec[], readCompatibilityHash: ReadCompatibilityHash): Promise<ReplicaRestoreOutcome<BoundRestoredReplica>>;
    restoreConfirmedCandidate(candidate: ReplicaCacheCandidate, attributes: readonly AttributeSpec[], readCompatibilityHash: ReadCompatibilityHash): Promise<BoundRestoredReplica | undefined>;
    graphReceiver(receiver: ReplicaDatabaseScope): Promise<ReplicaGraphReceiver | undefined>;
    observedRouteSlot(observation: ReplicaRouteObservation): Promise<ReplicaRouteSlot | undefined>;
    bindAuthenticated(binding: ReplicaAuthenticatedBinding, options?: ReplicaInstallOptions): Promise<void>;
    private stageReplacedPrincipals;
    private advanceBarrier;
    bindCredential(fingerprint: string, identity: ReplicationIdentity, options?: ReplicaInstallOptions): Promise<void>;
    restoreBoundOutcome(fingerprint: string, attributes: readonly AttributeSpec[], readCompatibilityHash: ReadCompatibilityHash): Promise<ReplicaRestoreOutcome<BoundRestoredReplica>>;
    restoreBound(fingerprint: string, attributes: readonly AttributeSpec[], readCompatibilityHash: ReadCompatibilityHash): Promise<BoundRestoredReplica | undefined>;
    resetStaging(identity: ReplicationIdentity, options?: ReplicaInstallOptions): Promise<void>;
    startSnapshot(frame: SnapshotStart, options?: ReplicaInstallOptions): Promise<void>;
    stageSnapshotChunk(frame: SnapshotChunk, options?: ReplicaInstallOptions): Promise<void>;
    private stagedState;
    private installWithQuotaRecovery;
    commitSnapshot(frame: SnapshotCommit, attributes: readonly AttributeSpec[], options?: ReplicaInstallOptions): Promise<RestoredReplica | undefined>;
    private commitSnapshotOnce;
    private installSnapshot;
    applyChange(frame: Change, options?: ReplicaInstallOptions): Promise<RestoredReplica | undefined>;
    private applyChangeOnce;
    private installChange;
}
//# sourceMappingURL=indexeddb.d.ts.map