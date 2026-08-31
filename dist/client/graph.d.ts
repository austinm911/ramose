import { COMPOSED_TRAITS, type AnyComposer } from "../db/Composer.ts";
import type { AnyEntity } from "../db/Entity.ts";
import type { Eid } from "../db/Eid.ts";
import { type MutationRef } from "../db/refs.ts";
import type { EntityHandle } from "./entity.ts";
import type { EntityRow, FluentQuery, WhereEq } from "../db/query/fluent.ts";
import type { FocusAttr } from "../db/query/focus.ts";
import type { IdRow } from "../db/query/lib.ts";
import { type AnyQueryObject, type Cursor, type Page, type Pipeline, type QueryObject, type QueryOrderKey } from "../db/query/index.ts";
import type { OrderDir, OrderEmpty } from "../db/shapes.ts";
import type { ReplicationIdentity } from "../internal/replication/protocol.ts";
import { type ReplicaDatabaseScope } from "../internal/replication/replica-lifecycle.ts";
import { ClientDatabaseHandle, type ClientDatabase, type QuerySubscription } from "./database.ts";
import { GraphPathError, GraphReceiverError } from "./errors.ts";
import { type MutationContext } from "./mutation.ts";
import type { EntityMutations, MutationNamespace } from "./mutation-schema.ts";
import { type Subscription } from "./subscription.ts";
import { type SyncState, type SyncStatus } from "./sync.ts";
/**
 * Whether this focus carries the deployed `Graph` trait.
 *
 * Static, from the installed catalog: `.db()` exists exactly where the authored
 * schema says a child catalog is bound, and never appears or disappears based
 * on a client-side authorization guess.
 */
export type ComposesGraph<N> = N extends {
    readonly [COMPOSED_TRAITS]: {
        readonly graph: true;
    };
} ? true : N extends {
    readonly _tag: "Trait";
    readonly ns: "graph";
} ? true : false;
/** The `.db()` an exactly-one Graph focus carries. */
export type GraphFocusDb = {
    readonly db: () => ClientDatabase;
};
declare const EntityFocusBrand: unique symbol;
/**
 * A query value that still has one entity focus, stated at the type level.
 *
 * The runtime marker and this brand say the same thing from two directions: the
 * chain that keeps the focus carries both, and `select` — which projects the
 * focus away — carries neither. That is what lets `observe` promise live entity
 * handles for one and plain rows for the other without inspecting any data.
 *
 * Phantom: nothing reads this property, and the value it would hold is the
 * composer the query started from.
 */
export type EntityFocused<N extends AnyComposer, Row, Out> = QueryObject<Row, Out> & {
    readonly [EntityFocusBrand]: N;
};
/**
 * What an entity-focused observation publishes, in place of its rows.
 *
 * The row shape is preserved as the handle's `.data`, so an application reads
 * `issue.data.title` where it used to read `issue.title` — and the handle
 * carries the two things a plain row cannot: this client's own pending state,
 * and the operations the deployed catalog declares for the entity's type.
 */
export type EntityResult<N extends AnyComposer, Row, Out> = EntityResultOf<EntityHandle<ClientValue<Row>, EntityMutations<N>, [
    N
] extends [AnyEntity] ? N : AnyEntity>, Out>;
type EntityResultOf<Handle, Out> = [Out] extends [readonly unknown[]] ? readonly Handle[] : [Out] extends [{
    readonly rows: readonly unknown[];
}] ? Omit<Out, "rows"> & {
    readonly rows: readonly Handle[];
} : null extends Out ? Handle | null : Handle;
/** A `.one()` / `.oneOrFail()` terminal, with `.db()` only where it belongs. */
export type GraphFocus<N extends AnyComposer, Row, Out, Term extends "one" | "oneOrFail"> = ComposesGraph<N> extends true ? QueryObject<Row, Out, Term> & GraphFocusDb & {
    readonly [EntityFocusBrand]: N;
} : QueryObject<Row, Out, Term> & {
    readonly [EntityFocusBrand]: N;
};
/**
 * The portable fluent chain, re-typed so an entity-focused terminal can name a
 * database. Nothing here is a second query language: every value is the same
 * inert `QueryObject` the deployed code builds, and `.db()` is the only
 * addition.
 *
 * The chain keeps its entity focus through `where` / `orderBy` / `limit` /
 * `offset` / `ids`. `select` projects the focus away, so its result is an
 * ordinary {@link FluentQuery} — a projection is not an entity, and cannot name
 * a database.
 */
export interface ClientQuery<N extends AnyComposer, Row = EntityRow<N>, Out = readonly Row[]> extends FluentQuery<N, Row, Out> {
    readonly [EntityFocusBrand]: N;
    where<const W extends WhereEq<N>>(eq: W): ClientQuery<N, Row, Out>;
    where(...stages: ReadonlyArray<(q: Pipeline<Row, N>) => Pipeline<Row, N>>): ClientQuery<N, Row, Out>;
    orderBy(key: QueryOrderKey<Row> | FocusAttr<N>, dir?: OrderDir, opts?: {
        readonly empty?: OrderEmpty;
    }): ClientQuery<N, Row, Out>;
    limit(n: number): ClientQuery<N, Row, Out>;
    offset(n: number): ClientQuery<N, Row, Out>;
    after(cursor: Cursor | null): EntityFocused<N, Row, Page<Row>>;
    ids(): ClientQuery<N, IdRow<N>>;
    one(): GraphFocus<N, Row, Row | null, "one">;
    oneOrFail(): GraphFocus<N, Row, Row, "oneOrFail">;
}
/**
 * One observed value, with every entity id rendered as the opaque identity the
 * client publishes: an `EntityId`, or a `ClientRef` for an entity this device
 * created and the server has not issued a handle for yet.
 */
export type ClientValue<A> = A extends Eid<infer E extends AnyEntity> ? MutationRef<E> : A extends Date | Uint8Array ? A : A extends readonly (infer Item)[] ? readonly ClientValue<Item>[] : A extends object ? {
    readonly [K in keyof A]: K extends ":db/id" ? MutationRef | Extract<A[K], undefined> : ClientValue<A[K]>;
} : A;
export interface GraphAncestor {
    readonly activateGraph: () => void;
    readonly boundDatabase: () => ClientDatabaseHandle | undefined;
    readonly bindingFailure: () => Error | undefined;
    readonly binding: Subscription<unknown>;
    readonly graphChild: (key: string, canonical: AnyQueryObject) => GraphDatabaseHandle;
}
type AnyFluent = FluentQuery<AnyComposer, unknown, unknown>;
export declare const graphResolutionQuery: (logic: AnyFluent, ns: AnyComposer) => AnyQueryObject;
export declare const graphStableKey: (scope: ReplicaDatabaseScope, entity: string) => string;
export declare const receiverStableKey: (receiver: ReplicaDatabaseScope) => string;
export declare const ENTITY_FOCUS: symbol;
export declare const entityFocusOf: (query: unknown) => AnyComposer | undefined;
export declare const clientQueryFrom: (node: GraphAncestor) => <N extends AnyComposer>(entity: N) => ClientQuery<N>;
export type GraphDatabaseFactory = (input: {
    readonly graphPath: readonly string[];
    readonly graphLineage: () => readonly string[] | undefined;
    readonly onConfirmed: (identity: ReplicationIdentity) => void;
}) => ClientDatabaseHandle;
export declare class GraphRegistry {
    private readonly factory;
    private readonly membershipChanged;
    private readonly databases;
    private readonly lineages;
    private readonly closing;
    constructor(factory: GraphDatabaseFactory, membershipChanged: () => void);
    private release;
    acquire(stable: string, graphPath: readonly string[], holder: object): ClientDatabaseHandle;
    retire(stable: string, holder: object): void;
    handles(): readonly ClientDatabaseHandle[];
    close(): Promise<void>;
}
type GraphBinding = {
    readonly status: "pending";
} | {
    readonly status: "bound";
    readonly db: ClientDatabaseHandle;
} | {
    readonly status: "failed";
    readonly error: Error;
};
export declare const terminalPathError: (status: SyncStatus) => GraphPathError | undefined;
export declare class GraphDatabaseHandle implements ClientDatabase, GraphAncestor {
    private readonly parent;
    private readonly canonical;
    private readonly registry;
    private readonly assertLive;
    private readonly mutationContext;
    readonly query: {
        from: <N extends AnyComposer>(entity: N) => ClientQuery<N>;
    };
    private mutations;
    private readonly bindingStore;
    readonly binding: Subscription<GraphBinding>;
    private readonly syncStore;
    readonly sync: Subscription<SyncState>;
    private readonly children;
    private activated;
    private closed;
    private releaseParent;
    private releaseResolution;
    private releaseParentSync;
    private resolution;
    private failureSnapshot;
    private boundKey;
    private releaseBoundSync;
    constructor(parent: GraphAncestor, canonical: AnyQueryObject, registry: GraphRegistry, assertLive: (operation: string) => void, mutationContext: MutationContext);
    activateGraph(): void;
    boundDatabase(): ClientDatabaseHandle | undefined;
    bindingFailure(): Error | undefined;
    graphChild(key: string, canonical: AnyQueryObject): GraphDatabaseHandle;
    get mutate(): MutationNamespace;
    observe<N extends AnyComposer, Row, Out>(query: EntityFocused<N, Row, Out>): QuerySubscription<EntityResult<N, Row, Out>>;
    observe<Row, Out>(query: QueryObject<Row, Out>): QuerySubscription<ClientValue<Out>>;
    private unboundSnapshot;
    private reattach;
    private ancestorFence;
    private settle;
    private bind;
    private fail;
    private publish;
    close(): void;
}
export declare const resolveGraphReceiver: (database: ClientDatabase) => Promise<ReplicaDatabaseScope>;
export declare const fencedReceiver: (status: SyncStatus) => GraphReceiverError | undefined;
export {};
//# sourceMappingURL=graph.d.ts.map