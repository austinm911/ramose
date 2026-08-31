import type { Eid } from "../Eid.ts";
import { type AnyComposer } from "../Composer.ts";
import type { AnyEntity } from "../Entity.ts";
import type { UnbrandedId } from "../idents.ts";
import type { AttrValue, FocusSelect, OrderDir, OrderEmpty, PathCarrier, Shape, ValidShape, SelectResult } from "../shapes.ts";
import type { EntityEq, FocusMismatch, InFocus, OwnerOf, RefTarget, ReverseOk } from "./focus.ts";
import { type AggSpec, type AnyVar, type AttrLike, type EidCell, type QueryGen, type StringPredOpts, type Var } from "./kernel.ts";
import { type Pipeline } from "./query.ts";
/** The row a bare (select-less) pipeline yields: the matched entity id. */
export type IdRow<N extends AnyComposer = AnyComposer> = {
    readonly id: Eid<N>;
};
/**
 * The source stage: concrete entities of one type, or every concrete type
 * composing one trait. Membership is derived from the protected type fact
 * and current deployed composition through a catalog-generated rule.
 */
export declare const entities: <N extends AnyComposer>(ns: N) => Pipeline<IdRow<N>, N>;
type FilterOut<X> = [X] extends [never] ? QueryGen<void> : [X] extends [Pipeline<infer Row, infer N>] ? [N] extends [AnyComposer] ? Pipeline<Row, N> : QueryGen<void> : QueryGen<void>;
type FilterParam<X, A> = [X] extends [Pipeline<any, infer N>] ? [A] extends [void] ? X : [InFocus<A, N>] extends [true] ? X : FocusMismatch : X;
/**
 * A filter parameterized by the focus namespace. `N` is the pipeline
 * focus the stage may be applied to; the attr-capturing form
 * (`FilterStage<AnyComposer, typeof User.name>`) rejects a foreign
 * field map at the call site. The return carries an ident brand so a
 * policy `FragFn` can tell a `Query.is` from a handwritten generator
 * (`{ _ident?: never }`).
 */
export type FilterStage<N extends AnyComposer = AnyComposer, A = void> = <X>(x: FilterParam<X, A>) => FilterOut<X> & {
    readonly _ident?: A extends {
        readonly ident: infer I extends string;
    } ? I : ":db/id";
};
type FollowOut<A extends AttrLike, X> = [X] extends [never] ? QueryGen<Var<Eid<RefTarget<A, AnyComposer>>>> : [X] extends [Pipeline<infer _Row, infer N>] ? [N] extends [AnyComposer] ? Pipeline<IdRow<RefTarget<A, N>>, RefTarget<A, N>> : QueryGen<Var<Eid<RefTarget<A, AnyComposer>>>> : QueryGen<Var<Eid<RefTarget<A, AnyComposer>>>>;
type FollowParam<X, A> = [X] extends [Pipeline<any, infer N>] ? [InFocus<A, N>] extends [true] ? X : FocusMismatch : X;
/** `follow(A)` as a dual stage: pipeline in keeps a branded target row. */
export type FollowStage<A extends AttrLike> = <X>(x: FollowParam<X, A>) => FollowOut<A, X>;
/**
 * `{ id }` row when a traversal's target namespace is not known
 * statically (`backlink`, `stage`). `row.id` is the documented
 * unbranded-number hatch; the row itself is not a branded cell.
 */
export type HatchIdRow = {
    readonly id: UnbrandedId;
};
type TraversalOut<A, X> = [X] extends [never] ? QueryGen<Var<EidCell>> : [X] extends [Pipeline<any, any>] ? [A] extends [void] ? Pipeline<HatchIdRow> : Pipeline<HatchIdRow, OwnerOf<A>> : QueryGen<Var<EidCell>>;
type ReverseParam<X, A> = [X] extends [Pipeline<any, infer N>] ? [A] extends [void] ? X : [ReverseOk<A, N>] extends [true] ? X : FocusMismatch : X;
/** A traversal: refocuses the pipeline; as a fragment, returns the new focus. */
export type TraversalStage<A = void> = <X>(x: ReverseParam<X, A>) => TraversalOut<A, X>;
/**
 * Lift a plain fragment into a pipeable stage — the same adapter every
 * shipped combinator uses, so a userland combinator is indistinguishable
 * from a shipped one. A fragment returning a handle refocuses the
 * pipeline; `void` keeps the focus.
 */
export declare const stage: {
    (frag: (focus: AnyVar) => QueryGen<Var<EidCell>>): TraversalStage;
    (frag: (focus: AnyVar) => QueryGen<void>): FilterStage;
};
type EntityIn<E> = EntityEq<E> | {
    readonly id: EntityEq<E>;
};
type RefIn<A> = A extends {
    readonly ident: ":db/id";
} ? EntityIn<OwnerOf<A>> : A extends {
    readonly valueType: "ref";
} ? EntityIn<RefTarget<A, AnyComposer>> : never;
type ValueIn<A> = AttrValue<A> | AnyVar | {
    readonly id: number;
} | RefIn<A>;
type IdIn<E> = number | EntityEq<E> | {
    readonly id: number | EntityEq<E>;
};
type IdFilterStage<E> = <X>(x: [X] extends [Pipeline<any, infer N>] ? [E] extends [AnyEntity] ? [N] extends [AnyEntity] ? ([N] extends [E] ? X : FocusMismatch) : X : X : X) => FilterOut<X> & {
    readonly _ident?: ":db/id";
};
/** `is(A, v)`: `p(e) := [e A v]`. `is(N.id, v)` is the same filter as {@link byId}. */
export declare const is: <A extends AttrLike>(attr: A, value: ValueIn<A>) => FilterStage<AnyComposer, A>;
/**
 * `byId(id)`: the focus is this entity. The blessed spelling of a filter by
 * entity id — a serializable query stage, equivalent to `is(N.id, id)`. The
 * id is an entity identity, a local id, or an `{ id }` cell; lowering unifies
 * the focus with that id (`ground`), and never emits a `:db/id` pattern (that
 * is not an attribute).
 */
export declare const byId: <E extends AnyComposer = AnyComposer>(id: IdIn<E> | AnyVar) => IdFilterStage<E>;
/** `has(A)`: the focus carries some `A` fact. */
export declare const has: <A extends AttrLike>(attr: A) => FilterStage<AnyComposer, A>;
/** `missing(A)`: no `A` fact at all. */
export declare const missing: <A extends AttrLike>(attr: A) => FilterStage<AnyComposer, A>;
export declare const matching: <A extends AttrLike>(attr: A, pred: (v: Var<AttrValue<A>>) => Iterable<unknown>) => FilterStage<AnyComposer, A>;
type StageAttr<S> = S extends FilterStage<any, infer A> ? A : void;
/**
 * Disjunction of filter stages — `any(startsWith(Issue.title, x), includes(Issue.body, x))`.
 * Built on {@link Q.or}; usable in fluent `.where(...)`. Each arm is
 * namespace-constrained the same way `is` / `matching` are.
 */
export declare const any: <const S extends readonly FilterStage<AnyComposer, any>[]>(...stages: S) => FilterStage<AnyComposer, StageAttr<S[number]>>;
/**
 * Negation of a filter stage — `not(any(...))` is the negated disjunction.
 * Built on {@link Q.not}.
 */
export declare const not: <A = void>(stage: FilterStage<AnyComposer, A>) => FilterStage<AnyComposer, A>;
/** `gt(A, v)`: the attr's value is greater than `v`. */
export declare const gt: <A extends AttrLike>(attr: A, value: AttrValue<A>) => FilterStage<AnyComposer, A>;
/** `gte(A, v)`: the attr's value is greater than or equal to `v`. */
export declare const gte: <A extends AttrLike>(attr: A, value: AttrValue<A>) => FilterStage<AnyComposer, A>;
/** `lt(A, v)`: the attr's value is less than `v`. */
export declare const lt: <A extends AttrLike>(attr: A, value: AttrValue<A>) => FilterStage<AnyComposer, A>;
/** `lte(A, v)`: the attr's value is less than or equal to `v`. */
export declare const lte: <A extends AttrLike>(attr: A, value: AttrValue<A>) => FilterStage<AnyComposer, A>;
/** `startsWith(A, s)`: the string attr starts with `s`. */
export declare const startsWith: <A extends AttrLike>(attr: A, needle: Extract<AttrValue<A>, string>, opts?: StringPredOpts) => FilterStage<AnyComposer, A>;
/** `includes(A, s)`: the string attr contains `s`. */
export declare const includes: <A extends AttrLike>(attr: A, needle: Extract<AttrValue<A>, string>, opts?: StringPredOpts) => FilterStage<AnyComposer, A>;
/** `follow(A)`: `p(e) → other := [e A other]` — refocus on the target. */
export declare const follow: <A extends AttrLike>(attr: A) => FollowStage<A>;
/** `backlink(A)`: same clause, opposite mode — refocus on the referrer. */
export declare const backlink: <A extends AttrLike>(attr: A) => TraversalStage<A>;
type ElemPred = (focus: AnyVar) => Iterable<unknown>;
export type ReverseFilter<A extends AttrLike> = <X>(x: ReverseParam<X, A>) => FilterOut<X>;
/** `some(R, ps…)`: ∃ other. `[other R e]` ∧ ps(other). */
export declare const some: <A extends AttrLike>(ref: A, ...ps: readonly ElemPred[]) => ReverseFilter<A>;
/** `none(R, ps…)`: ¬∃ other. `[other R e]` ∧ ps(other). */
export declare const none: <A extends AttrLike>(ref: A, ...ps: readonly ElemPred[]) => ReverseFilter<A>;
/** `every(R, ps…)`: ¬∃ other. `[other R e]` ∧ ¬ps(other) — vacuously true
 * of a focus nothing points at, like the nav surface's `every`. */
export declare const every: <A extends AttrLike>(ref: A, ...ps: readonly ElemPred[]) => ReverseFilter<A>;
/** Some fact about the focus was asserted at basis `t >= since`. */
export declare const updatedSince: (since: number) => FilterStage;
/** Some fact about the focus rides a transaction whose entity carries
 * `[tx A who]` — provenance as an ordinary clause. */
export declare const assertedBy: <A extends AttrLike>(attr: A, who: ValueIn<A>) => FilterStage;
type SelectArg<S, N extends AnyComposer> = [S] extends [FocusSelect<N, S>] ? unknown : FocusMismatch;
/** Contribute the projection — what a generator body says with its return.
 * A second argument adds aggregate cells beside the shape
 * (`.select({ name: User.name }, { n: Q.count(Q.focus) })`). */
export declare const select: {
    <const S extends Shape>(shape: S & ValidShape<S>): <N extends AnyComposer>(q: Pipeline<any, N> & SelectArg<S, N>) => Pipeline<SelectResult<S>, N>;
    <const S extends Shape, const Extra>(shape: S & ValidShape<S>, extra: (e: Var<EidCell>) => Extra & {
        readonly [K in keyof Extra]: AggSpec<any>;
    }): <N extends AnyComposer>(q: Pipeline<any, N> & SelectArg<S, N>) => Pipeline<SelectResult<S> & {
        readonly [K in keyof Extra]: Extra[K] extends AggSpec<infer T> ? T : never;
    }, N>;
    <const S extends Shape, const Extra>(shape: S & ValidShape<S>, extra: Extra & {
        readonly [K in keyof Extra]: AggSpec<any>;
    }): <N extends AnyComposer>(q: Pipeline<any, N> & SelectArg<S, N>) => Pipeline<SelectResult<S> & {
        readonly [K in keyof Extra]: Extra[K] extends AggSpec<infer T> ? T : never;
    }, N>;
};
type OrderKeyArg<K, Row, N extends AnyComposer> = [K] extends [string] ? [K] extends [keyof Row] ? unknown : FocusMismatch : [InFocus<K, N>] extends [true] ? unknown : FocusMismatch;
/** Contribute a sort key: a selected column's name, or an attr path. */
export declare const orderBy: <const K extends string | PathCarrier>(key: K, dir?: OrderDir, opts?: {
    readonly empty?: OrderEmpty;
}) => <Row, N extends AnyComposer>(q: Pipeline<Row, N> & OrderKeyArg<K, Row, N>) => Pipeline<Row, N>;
/** Keep at most `n` rows. */
export declare const limit: (n: number) => <Row, N extends AnyComposer>(q: Pipeline<Row, N>) => Pipeline<Row, N>;
/** Drop `n` rows from the front of the (ordered) result. */
export declare const offset: (n: number) => <Row, N extends AnyComposer>(q: Pipeline<Row, N>) => Pipeline<Row, N>;
/**
 * Project only the matched entity ids — today's cheap-subscription shape
 * (`{ id }` rows). The focus namespace is the pipeline's `N`, so a
 * `pipe(entities(User), ids())` row is `IdRow<User>` and a valid
 * {@link import("../idents.ts").EntityRef}.
 */
export declare const ids: () => <Row, N extends AnyComposer>(q: Pipeline<Row, N>) => Pipeline<IdRow<N>, N>;
export {};
//# sourceMappingURL=lib.d.ts.map