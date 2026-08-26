/**
 * The pipeable standard library — every combinator here bootstraps from the
 * kernel (`fact`, comparisons, `or`/`not`, rules), which is the test of the
 * kernel's completeness: a userland combinator is indistinguishable from a
 * shipped one.
 *
 * A fragment is a rule with modes: bound head vars are the function's
 * arguments, the free var is its return — exactly the dataflow that makes
 * `pipe` thread. Each shipped combinator is dual-natured: applied to a
 * pipeline it appends itself as a stage, applied to a bound handle it is
 * the plain generator fragment (`yield* is(Issue.done, false)(issue)`), so
 * one vocabulary serves both spellings.
 */
import type { Eid } from "../Eid.ts";
import type { AnyEntity } from "../Entity.ts";
import type { UnbrandedId } from "../idents.ts";
import type { AttrValue, FocusSelect, OrderDir, OrderEmpty, PathCarrier, Shape, ValidShape, SelectResult } from "../shapes.ts";
import type { FocusMismatch, InFocus, OwnerOf, RefTarget, ReverseOk } from "./focus.ts";
import { type AggSpec, type AnyVar, type AttrLike, type EidCell, type QueryGen, type StringPredOpts, type Var } from "./kernel.ts";
import { type Pipeline } from "./query.ts";
/** The row a bare (select-less) pipeline yields: the matched entity id. */
export type IdRow<N extends AnyEntity = AnyEntity> = {
    readonly id: Eid<N>;
};
/**
 * The source stage: the entities of one namespace. There is no entity
 * table — membership means "has at least one fact in the namespace", named
 * as a catalog-generated rule so the planner can treat it as a scan; when
 * the pipeline already constrains the focus through a namespace attr, the
 * rule is entailed and lowering emits nothing.
 */
export declare const entities: <N extends AnyEntity>(ns: N) => Pipeline<IdRow<N>, N>;
/**
 * Dual stage output: a pipeline keeps its row and focus namespace;
 * anything else is the generator fragment. One generic (not an
 * overload) so `pipe` infers `N` from the argument instead of
 * defaulting it to {@link AnyEntity}.
 */
type FilterOut<X> = [X] extends [never] ? QueryGen<void> : [X] extends [Pipeline<infer Row, infer N>] ? [N] extends [AnyEntity] ? Pipeline<Row, N> : QueryGen<void> : QueryGen<void>;
/**
 * A filter's argument: a pipeline is accepted only when `A` is a member
 * of the focus field map (`A = void` is namespace-generic — `byId`,
 * `updatedSince`). One generic so `pipe` infers `N` from the argument.
 */
type FilterParam<X, A> = [X] extends [Pipeline<any, infer N>] ? [A] extends [void] ? X : [InFocus<A, N>] extends [true] ? X : FocusMismatch : X;
/**
 * A filter parameterized by the focus namespace. `N` is the pipeline
 * focus the stage may be applied to; the attr-capturing form
 * (`FilterStage<AnyEntity, typeof User.name>`) rejects a foreign
 * field map at the call site. The return carries an ident brand so a
 * policy `FragFn` can tell a `Query.is` from a handwritten generator
 * (`{ _ident?: never }`).
 */
export type FilterStage<N extends AnyEntity = AnyEntity, A = void> = <X>(x: FilterParam<X, A>) => FilterOut<X> & {
    readonly _ident?: A extends {
        readonly ident: infer I extends string;
    } ? I : ":db/id";
};
type FollowOut<A extends AttrLike, X> = [X] extends [never] ? QueryGen<Var<Eid<RefTarget<A, AnyEntity>>>> : [X] extends [Pipeline<infer _Row, infer N>] ? [N] extends [AnyEntity] ? Pipeline<IdRow<RefTarget<A, N>>, RefTarget<A, N>> : QueryGen<Var<Eid<RefTarget<A, AnyEntity>>>> : QueryGen<Var<Eid<RefTarget<A, AnyEntity>>>>;
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
/**
 * A reverse-ref argument: the attr must point at the current focus
 * (`backlink(Comment.issue)` on an Issue pipeline).
 */
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
type ValueIn<A> = AttrValue<A> | AnyVar | {
    readonly id: number;
};
/** `is(A, v)`: `p(e) := [e A v]`. `is(N.id, v)` is the same filter as {@link byId}. */
export declare const is: <A extends AttrLike>(attr: A, value: ValueIn<A>) => FilterStage<AnyEntity, A>;
/**
 * `byId(id)`: the focus is this entity. The blessed spelling of a filter by
 * entity id — a serializable query stage, equivalent to `is(N.id, id)`. The
 * id is a number or an `{ id }` cell; lowering unifies the focus with that
 * id (`ground`), and never emits a `:db/id` pattern (that is not an
 * attribute).
 */
export declare const byId: (id: number | AnyVar | {
    readonly id: number;
}) => FilterStage;
/** `has(A)`: the focus carries some `A` fact. */
export declare const has: <A extends AttrLike>(attr: A) => FilterStage<AnyEntity, A>;
/** `missing(A)`: no `A` fact at all. */
export declare const missing: <A extends AttrLike>(attr: A) => FilterStage<AnyEntity, A>;
/**
 * `matching(A, (v) => cmp)`: bind the attr's value and constrain it —
 * `matching(Issue.title, (t) => Q.startsWith(t, "re:", { ignoreCase: true }))`.
 * The callback may return one comparison or a whole generator of clauses.
 *
 * Renamed from `where` so the general filter is `.where` / object-literal
 * equality on the fluent chain (#204, #208).
 */
export declare const matching: <A extends AttrLike>(attr: A, pred: (v: Var<AttrValue<A>>) => Iterable<unknown>) => FilterStage<AnyEntity, A>;
/** The attr brand a filter stage carries — unioned across `any` / `not`. */
type StageAttr<S> = S extends FilterStage<any, infer A> ? A : void;
/**
 * Disjunction of filter stages — `any(startsWith(Issue.title, x), includes(Issue.body, x))`.
 * Built on {@link Q.or}; usable in fluent `.where(...)`. Each arm is
 * namespace-constrained the same way `is` / `matching` are.
 */
export declare const any: <const S extends readonly FilterStage<AnyEntity, any>[]>(...stages: S) => FilterStage<AnyEntity, StageAttr<S[number]>>;
/**
 * Negation of a filter stage — `not(any(...))` is the negated disjunction.
 * Built on {@link Q.not}.
 */
export declare const not: <A = void>(stage: FilterStage<AnyEntity, A>) => FilterStage<AnyEntity, A>;
/** `gt(A, v)`: the attr's value is greater than `v`. */
export declare const gt: <A extends AttrLike>(attr: A, value: AttrValue<A>) => FilterStage<AnyEntity, A>;
/** `gte(A, v)`: the attr's value is greater than or equal to `v`. */
export declare const gte: <A extends AttrLike>(attr: A, value: AttrValue<A>) => FilterStage<AnyEntity, A>;
/** `lt(A, v)`: the attr's value is less than `v`. */
export declare const lt: <A extends AttrLike>(attr: A, value: AttrValue<A>) => FilterStage<AnyEntity, A>;
/** `lte(A, v)`: the attr's value is less than or equal to `v`. */
export declare const lte: <A extends AttrLike>(attr: A, value: AttrValue<A>) => FilterStage<AnyEntity, A>;
/** `startsWith(A, s)`: the string attr starts with `s`. */
export declare const startsWith: <A extends AttrLike>(attr: A, needle: Extract<AttrValue<A>, string>, opts?: StringPredOpts) => FilterStage<AnyEntity, A>;
/** `includes(A, s)`: the string attr contains `s`. */
export declare const includes: <A extends AttrLike>(attr: A, needle: Extract<AttrValue<A>, string>, opts?: StringPredOpts) => FilterStage<AnyEntity, A>;
/** `follow(A)`: `p(e) → other := [e A other]` — refocus on the target. */
export declare const follow: <A extends AttrLike>(attr: A) => FollowStage<A>;
/** `backlink(A)`: same clause, opposite mode — refocus on the referrer. */
export declare const backlink: <A extends AttrLike>(attr: A) => TraversalStage<A>;
type ElemPred = (focus: AnyVar) => Iterable<unknown>;
/** A filter over a reverse ref: the attr must point at the current focus. */
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
type SelectArg<S, N extends AnyEntity> = [S] extends [FocusSelect<N, S>] ? unknown : FocusMismatch;
/** Contribute the projection — what a generator body says with its return.
 * A second argument adds aggregate cells beside the shape
 * (`.select({ name: User.name }, { n: Q.count(Q.focus) })`). */
export declare const select: {
    <const S extends Shape>(shape: S & ValidShape<S>): <N extends AnyEntity>(q: Pipeline<any, N> & SelectArg<S, N>) => Pipeline<SelectResult<S>, N>;
    <const S extends Shape, const Extra>(shape: S & ValidShape<S>, extra: (e: Var<EidCell>) => Extra & {
        readonly [K in keyof Extra]: AggSpec<any>;
    }): <N extends AnyEntity>(q: Pipeline<any, N> & SelectArg<S, N>) => Pipeline<SelectResult<S> & {
        readonly [K in keyof Extra]: Extra[K] extends AggSpec<infer T> ? T : never;
    }, N>;
    <const S extends Shape, const Extra>(shape: S & ValidShape<S>, extra: Extra & {
        readonly [K in keyof Extra]: AggSpec<any>;
    }): <N extends AnyEntity>(q: Pipeline<any, N> & SelectArg<S, N>) => Pipeline<SelectResult<S> & {
        readonly [K in keyof Extra]: Extra[K] extends AggSpec<infer T> ? T : never;
    }, N>;
};
type OrderKeyArg<K, Row, N extends AnyEntity> = [K] extends [string] ? [K] extends [keyof Row] ? unknown : FocusMismatch : [InFocus<K, N>] extends [true] ? unknown : FocusMismatch;
/** Contribute a sort key: a selected column's name, or an attr path. */
export declare const orderBy: <const K extends string | PathCarrier>(key: K, dir?: OrderDir, opts?: {
    readonly empty?: OrderEmpty;
}) => <Row, N extends AnyEntity>(q: Pipeline<Row, N> & OrderKeyArg<K, Row, N>) => Pipeline<Row, N>;
/** Keep at most `n` rows. */
export declare const limit: (n: number) => <Row, N extends AnyEntity>(q: Pipeline<Row, N>) => Pipeline<Row, N>;
/** Drop `n` rows from the front of the (ordered) result. */
export declare const offset: (n: number) => <Row, N extends AnyEntity>(q: Pipeline<Row, N>) => Pipeline<Row, N>;
/**
 * Project only the matched entity ids — today's cheap-subscription shape
 * (`{ id }` rows). The focus namespace is the pipeline's `N`, so a
 * `pipe(entities(User), ids())` row is `IdRow<User>` and a valid
 * {@link import("../idents.ts").EntityRef}.
 */
export declare const ids: () => <Row, N extends AnyEntity>(q: Pipeline<Row, N>) => Pipeline<IdRow<N>, N>;
export {};
//# sourceMappingURL=lib.d.ts.map