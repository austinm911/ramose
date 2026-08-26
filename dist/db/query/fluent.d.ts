/**
 * `Query.from(Entity)` — the primary app spelling.
 *
 * Thin wrappers over the existing immutable pipeline AST. Stage functions
 * stay one tier down for the generator/kernel path; this chain is the
 * serializable value `db.query` / `useLive` run. Changing values go in
 * `.where` as literals.
 */
import type { Eid } from "../Eid.ts";
import type { AnyEntity } from "../Entity.ts";
import type { FocusAttr } from "./focus.ts";
import type { AttrValue, FocusShape, OrderDir, OrderEmpty, SelectResult, Shape, ValidShape } from "../shapes.ts";
import { type IdRow } from "./lib.ts";
import { type AggSpec, type EidCell, type Var } from "./kernel.ts";
import { type Pipeline, type QueryObject, type QueryOrderKey } from "./query.ts";
type IsMany<A> = A extends {
    readonly cardinality: "many";
} ? true : false;
type IsRef<A> = A extends {
    readonly valueType: "ref";
} ? true : false;
type IsOptional<A> = A extends {
    readonly isOptional: true;
} ? true : undefined extends AttrValue<A> ? true : false;
/** Instant is a branded `Date`; the app row is the friendly `Date`. */
type FriendlyScalar<T> = T extends Date ? Date : T;
/**
 * The entity a `Ref(Issue)` field points at. Self-refs resolve to the
 * enclosing entity. Untargeted refs stay `AnyEntity`.
 */
type RefTarget<A, Enclosing extends AnyEntity> = A extends {
    readonly schema: {
        readonly _target?: infer T;
    };
} ? [T] extends [AnyEntity] ? T : Enclosing : AnyEntity;
/**
 * A ref under the default shape: an `{ id }` cell branded with the
 * *target* entity, never auto-nested. `Comment.issue` → `{ id: Eid<Issue> }`.
 */
export type RefIdCell<N extends AnyEntity = AnyEntity> = {
    readonly id: Eid<N>;
};
type ScalarRow<A, Enclosing extends AnyEntity> = IsRef<A> extends true ? RefIdCell<RefTarget<A, Enclosing>> : FriendlyScalar<Exclude<AttrValue<A>, undefined>>;
type FieldRow<A, Enclosing extends AnyEntity> = IsMany<A> extends true ? readonly ScalarRow<A, Enclosing>[] : IsOptional<A> extends true ? ScalarRow<A, Enclosing> | undefined : ScalarRow<A, Enclosing>;
/**
 * The row a select-less fluent query yields: friendly keys, refs as
 * `{ id: Eid<Target> }` cells. `| undefined` only on optional fields;
 * required scalars stay required. Card-many are arrays. Not `all(N)` /
 * `[*]` — lowering expands `N.fields` into this shape.
 */
export type EntityRow<N extends AnyEntity> = {
    readonly id: Eid<N>;
} & {
    readonly [K in keyof N["fields"]]: FieldRow<N["fields"][K], N>;
};
/**
 * Expand `N.fields` into the pull shape. Card-one fields are `.optional` at
 * runtime so a missing fact does not drop the row; {@link EntityRow} still
 * types required scalars as required (optimistic about presence).
 */
export declare const entityShape: (ns: AnyEntity) => Shape;
type EqValue<A> = IsRef<A> extends true ? AttrValue<A> | {
    readonly id: number;
} : AttrValue<A>;
/**
 * Object-literal equality filters. Keys are the entity's fields (plus `id`);
 * a wrong key or value type is a compile error.
 */
export type WhereEq<N extends AnyEntity> = {
    readonly [K in keyof N["fields"]]?: EqValue<N["fields"][K]>;
} & {
    readonly id?: Eid<N> | number | {
        readonly id: number;
    };
};
/**
 * A closed query that still accepts chain methods. Immutable: each call
 * returns a new value, hoistable at module scope exactly as `Query.q` is.
 */
export interface FluentQuery<N extends AnyEntity = AnyEntity, Row = unknown, Out = readonly Row[]> extends QueryObject<Row, Out> {
    /**
     * Conjunction of equality filters, keys typechecked from the entity's
     * fields; or one-or-more stage fragments (`Query.some`, `Query.any`,
     * `Query.gt`, `Query.matching`, …).
     */
    where<const W extends WhereEq<N>>(eq: W): FluentQuery<N, Row, Out>;
    where(...stages: ReadonlyArray<(q: Pipeline<Row, N>) => Pipeline<Row, N>>): FluentQuery<N, Row, Out>;
    /** Narrow / reshape the row. Without this, the default is the full entity.
     * A second argument adds aggregate cells beside the shape. */
    select<const S extends Shape>(shape: S & ValidShape<S> & FocusShape<N, S>): FluentQuery<N, SelectResult<S>>;
    select<const S extends Shape, const Extra>(shape: S & ValidShape<S> & FocusShape<N, S>, extra: (e: Var<EidCell>) => Extra & {
        readonly [K in keyof Extra]: AggSpec<any>;
    }): FluentQuery<N, SelectResult<S> & {
        readonly [K in keyof Extra]: Extra[K] extends AggSpec<infer T> ? T : never;
    }>;
    select<const S extends Shape, const Extra>(shape: S & ValidShape<S> & FocusShape<N, S>, extra: Extra & {
        readonly [K in keyof Extra]: AggSpec<any>;
    }): FluentQuery<N, SelectResult<S> & {
        readonly [K in keyof Extra]: Extra[K] extends AggSpec<infer T> ? T : never;
    }>;
    orderBy(key: QueryOrderKey<Row> | FocusAttr<N>, dir?: OrderDir, opts?: {
        readonly empty?: OrderEmpty;
    }): FluentQuery<N, Row, Out>;
    limit(n: number): FluentQuery<N, Row, Out>;
    offset(n: number): FluentQuery<N, Row, Out>;
    /**
     * Id-only projection — today's cheap live-subscription workhorse.
     * Default-full-entity widens invalidation; `.select` / `.ids` are the levers.
     */
    ids(): FluentQuery<N, IdRow<N>>;
}
/**
 * Start a fluent query at an entity. Select-less, the row is the full
 * entity (friendly keys); `.select` narrows, `.ids` keeps today's id-only
 * cheap subscription. Put changing values in `.where` — two independently
 * built queries with the same literals share a live subscription.
 */
export declare const from: <N extends AnyEntity>(ns: N) => FluentQuery<N, EntityRow<N>>;
export {};
//# sourceMappingURL=fluent.d.ts.map