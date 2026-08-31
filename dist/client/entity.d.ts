import type { AnyComposer } from "../db/Composer.ts";
import type { AnyEntity } from "../db/Entity.ts";
import { type ClientRef, type MutationRef } from "../db/refs.ts";
import type { OptimisticPending } from "../internal/replication/reconciliation.ts";
import type { ClientDatabase } from "./database.ts";
import { type MutationContext } from "./mutation.ts";
import type { MutationNamespace } from "./mutation-schema.ts";
import type { ClientOperation } from "./operations.ts";
/**
 * The sidecar state of one entity, derived from the optimistic layers and
 * nothing else.
 *
 * Never a persisted trait, never an application datom, and never part of
 * `.data`: it describes what this *client* is still carrying for the entity,
 * so it must not be confused with what the entity *is*.
 */
export type EntityLocal = {
    readonly pending: boolean;
    readonly created: boolean;
};
declare const EntityWithdrawnError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "EntityWithdrawnError";
} & Readonly<A>;
/**
 * Mutating an entity whose partition this client no longer holds.
 *
 * A principal replacement, a read-view reset or a close withdraws every handle
 * that partition produced. The handle keeps saying what the entity was — a
 * rendered list must not turn into holes — but its target means nothing in the
 * partition that replaced it, so the call is refused here rather than queued
 * against a receiver that never held it.
 */
export declare class EntityWithdrawnError extends EntityWithdrawnError_base<{
    readonly operation: string;
}> {
}
/** One entity, as an application holds it. */
export interface EntityHandle<Data = unknown, Mutations = MutationNamespace, Entity extends AnyEntity = AnyEntity> {
    readonly id: MutationRef<Entity>;
    readonly data: Data;
    readonly local: EntityLocal;
    readonly mutate: Mutations;
}
export declare class EntityRegistry {
    private readonly context;
    private readonly database;
    private readonly operations;
    private readonly handles;
    private readonly aliases;
    private readonly reverse;
    private readonly views;
    private pending;
    constructor(context: MutationContext, database: ClientDatabase, operations: (focus: AnyComposer) => ReadonlyMap<string, ClientOperation>);
    observe(pending: OptimisticPending): ReadonlySet<EntityHandle>;
    alias(ref: ClientRef, id: MutationRef): void;
    handle(id: MutationRef, focus: AnyComposer, shape: string, data: unknown): EntityHandle;
    private stateFor;
    clear(): void;
}
export declare const rowIdentity: (row: unknown) => MutationRef | undefined;
export declare const isLocalIdentity: (id: MutationRef) => id is ClientRef;
export {};
//# sourceMappingURL=entity.d.ts.map