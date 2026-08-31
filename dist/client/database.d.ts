import type { AnyComposer } from "../db/Composer.ts";
import { type AnyQueryObject, type QueryObject } from "../db/query/index.ts";
import type { ReplicationIdentity } from "../internal/replication/protocol.ts";
import { OptimisticReconciler } from "../internal/replication/reconciliation.ts";
import { type ReplicaDatabaseScope } from "../internal/replication/replica-lifecycle.ts";
import { type ReplicationSessionSnapshot } from "../internal/replication/session.ts";
import type { QueueProgress } from "../internal/replication/submission.ts";
import type { IndexedDbReplicaStorage } from "../internal/replication/indexeddb.ts";
import type { ClientCatalog } from "./catalog.ts";
import { GraphDatabaseHandle, type ClientQuery, type ClientValue, type EntityFocused, type EntityResult, type GraphAncestor, type GraphRegistry } from "./graph.ts";
import { type MutationContext } from "./mutation.ts";
import type { MutationNamespace } from "./mutation-schema.ts";
import { type Subscription } from "./subscription.ts";
import { type SyncState, type SyncStatus } from "./sync.ts";
/**
 * One query's current answer.
 *
 * `getSnapshot()` returns the same object until this value actually changes:
 * a rerun that found the same rows republishes nothing, and one that found new
 * rows publishes a new snapshot whose `data` is a new value too. A rerun that
 * changed only `stale` keeps the previous `data` identity.
 */
export type QuerySnapshot<Out> = {
    readonly status: "pending" | "ready" | "error";
    readonly data: Out | undefined;
    readonly stale: boolean;
    readonly error: Error | undefined;
};
export type QuerySubscription<Out> = Subscription<QuerySnapshot<Out>>;
export declare const queryObservationKey: (query: AnyQueryObject) => string;
export type SessionDisposition = {
    readonly status: SyncStatus;
    readonly publishes: boolean;
};
export declare const readSessionSnapshot: (snapshot: ReplicationSessionSnapshot) => SessionDisposition;
export type DatabaseContext = {
    readonly server: string;
    readonly root: string;
    readonly graphPath: readonly string[];
    readonly graphLineage?: (() => readonly string[] | undefined) | undefined;
    readonly graph: () => GraphRegistry;
    readonly catalog: () => Promise<ClientCatalog>;
    readonly storage: () => Promise<IndexedDbReplicaStorage>;
    readonly credential: () => Promise<{
        readonly token: string;
        readonly cacheKey: string;
    }>;
    readonly assertLive: (operation: string) => void;
    readonly live: () => boolean;
    readonly onSyncChange: () => void;
    readonly onConfirmed: (identity: ReplicationIdentity) => void;
    readonly onFenced: () => void;
    readonly mutations: MutationContext;
};
/**
 * The public database handle.
 *
 * `query.from` is the portable query language, unchanged: there is no client
 * query DSL, and a query value built here is the same inert value the deployed
 * code builds.
 */
export interface ClientDatabaseReads {
    readonly query: {
        readonly from: <N extends AnyComposer>(entity: N) => ClientQuery<N>;
    };
    readonly observe: {
        <N extends AnyComposer, Row, Out>(query: EntityFocused<N, Row, Out>): QuerySubscription<EntityResult<N, Row, Out>>;
        <Row, Out>(query: QueryObject<Row, Out>): QuerySubscription<ClientValue<Out>>;
    };
    readonly sync: Subscription<SyncState>;
}
export type ClientDatabase<Mutations = MutationNamespace> = ClientDatabaseReads & {
    readonly mutate: Mutations;
};
export declare class ClientDatabaseHandle implements ClientDatabase, GraphAncestor {
    private readonly context;
    readonly query: {
        from: <N extends AnyComposer>(entity: N) => ClientQuery<N>;
    };
    private mutations;
    get mutate(): MutationNamespace;
    private readonly syncStore;
    readonly sync: Subscription<SyncState>;
    readonly binding: Subscription<unknown>;
    private readonly graphChildren;
    private readonly observers;
    private readonly retired;
    private activation;
    private opening;
    private readonly settling;
    private catalog;
    private session;
    private releaseSession;
    private reconciler;
    private reconcilerKey;
    private reconcilerPending;
    private releaseOverlay;
    private identity;
    private committed;
    private account;
    private handles;
    private reverse;
    private speculative;
    private registry;
    private viewValue;
    private viewGeneration;
    private lastSession;
    private stale;
    private updateRequired;
    private queueUpdateRequired;
    private closed;
    private refused;
    private wakePending;
    private awaitedRoute;
    private generation;
    constructor(context: DatabaseContext);
    private spawn;
    private drain;
    observe<N extends AnyComposer, Row, Out>(query: EntityFocused<N, Row, Out>): QuerySubscription<EntityResult<N, Row, Out>>;
    observe<Row, Out>(query: QueryObject<Row, Out>): QuerySubscription<ClientValue<Out>>;
    private shapeRows;
    private entities;
    private republishLocal;
    private acquire;
    boundReconciler(): OptimisticReconciler | undefined;
    authenticatedBy(credential: {
        readonly cacheKey: string;
    }): boolean;
    graphPath(): readonly string[];
    activateGraph(): void;
    boundDatabase(): ClientDatabaseHandle | undefined;
    bindingFailure(): Error | undefined;
    graphChild(key: string, canonical: AnyQueryObject): GraphDatabaseHandle;
    activate(): Promise<void>;
    private restart;
    reactivateRefused(): void;
    private disposition;
    reactivateOffline(): void;
    private answerWake;
    private open;
    refreshCommitted(): Promise<void>;
    refreshOptimistic(): Promise<void>;
    reactivateUnconfirmed(): void;
    reconcileSubmissions(progress: readonly QueueProgress[]): Promise<void>;
    private live;
    private accept;
    private retryAwaitedRoute;
    private fence;
    private closeGraphChildren;
    private transition;
    private refence;
    revalidate(): Promise<void>;
    private statusOf;
    private publishStatus;
    syncStatus(): SyncStatus;
    activated(): boolean;
    confirmedIdentity(): ReplicationIdentity | undefined;
    viewWithdrawn(): boolean;
    private recompute;
    private bindReconciler;
    private reconciliationOptions;
    private forgetCredential;
    private forgetHandles;
    private withdrawEntities;
    private entityId;
    private localIdOf;
    sealedHandleOf(eid: number): string | undefined;
    confirmedScope(): ReplicaDatabaseScope | undefined;
    private overlay;
    private settleActivation;
    close(): Promise<void>;
}
//# sourceMappingURL=database.d.ts.map