import type { Cardinality } from "./Field.ts";
import { type ClientRef, type MutationRef } from "./refs.ts";
import type { DbValueType } from "./valueTypes.ts";
export type ProjectionValue = {
    readonly type: "long";
    readonly value: number;
} | {
    readonly type: "double";
    readonly value: number | "positive-infinity" | "negative-infinity";
} | {
    readonly type: "string";
    readonly value: string;
} | {
    readonly type: "boolean";
    readonly value: boolean;
} | {
    readonly type: "ref";
    readonly value: MutationRef;
} | {
    readonly type: "uuid";
    readonly value: string;
} | {
    readonly type: "instant";
    readonly value: number;
} | {
    readonly type: "bytes";
    readonly value: string;
};
export type ProjectionOp = {
    readonly op: "set";
    readonly entity: MutationRef;
    readonly field: string;
    readonly value: ProjectionValue;
} | {
    readonly op: "remove";
    readonly entity: MutationRef;
    readonly field: string;
    readonly value: ProjectionValue | null;
} | {
    readonly op: "create";
    readonly entity: ClientRef;
    readonly slot: string;
    readonly type: string;
} | {
    readonly op: "delete";
    readonly entity: MutationRef;
};
export type ProjectionChangeset = readonly ProjectionOp[];
/** What `tx.set` / `tx.remove` accept: a stamped field ref carries both. */
export type ProjectionField = {
    readonly ident: string;
    readonly valueType: DbValueType | undefined;
    readonly cardinality?: Cardinality;
};
/** What `tx.create` accepts: an entity definition names its own type. */
export type ProjectionEntity = {
    readonly ns: string;
};
/**
 * The transaction builder. Every verb returns the builder so a projection reads
 * as one expression; `create` returns the slot's client ref instead, because
 * that is the value the rest of the projection needs.
 *
 * It accumulates plain data and reads nothing.
 */
export interface ProjectionTx {
    set(entity: MutationRef, field: ProjectionField, value: unknown): ProjectionTx;
    remove(entity: MutationRef, field: ProjectionField, value?: unknown): ProjectionTx;
    create(slot: string, definition: ProjectionEntity): ClientRef;
    delete(entity: MutationRef): ProjectionTx;
}
/** Everything a projection may observe. */
export type ProjectionContext<Input> = {
    readonly input: Input;
    readonly self: MutationRef | undefined;
    readonly tx: ProjectionTx;
};
/** One declared optimistic projection. Synchronous, and returns nothing. */
export type OptimisticProjection<Input> = (context: ProjectionContext<Input>) => void;
/** Erased projection, for registries that cannot name the input type. */
export type AnyOptimisticProjection = OptimisticProjection<never>;
export declare const DEFAULT_PROJECTION_REVISION = 1;
export declare const normalizeProjectionRevision: (value: unknown) => number;
export type ProjectionInvocation<Input> = {
    readonly input: Input;
    readonly self?: MutationRef | undefined;
    readonly allocations?: Readonly<Record<string, ClientRef>> | undefined;
};
export type ProjectionOutcome = {
    readonly type: "changeset";
    readonly changeset: ProjectionChangeset;
} | {
    readonly type: "failed";
    readonly reason: string;
};
export declare const runProjection: <Input>(projection: OptimisticProjection<Input>, invocation: ProjectionInvocation<Input>) => ProjectionOutcome;
//# sourceMappingURL=Projection.d.ts.map