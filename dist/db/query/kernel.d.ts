/**
 * The query kernel: inert typed clause descriptions over the engine IR.
 *
 * Primitives are **data, not Effects** — a clause value means nothing until
 * a query lowers it, so serializability is definitional and there is no
 * build runtime, ambient collector, or cast. The kernel is exactly:
 *
 *   - `Q.fact(e, attr, v?)` — the one pattern clause, five positions. An
 *     unbound position mints a typed var; the handle exposes
 *     `{ e, v, t, tx, op }`, so time-based questions are ordinary clauses.
 *   - Value comparisons (`Q.eq`, `Q.gt`, `Q.startsWith`, …) over bound vars.
 *     String predicates take `{ ignoreCase: true }`, lowered through the
 *     engine's `lower-case` function.
 *   - `Q.call(fn, …args)` — function-binding clause; the engine's builtin
 *     set as an escape hatch (`lower-case`, `str`, arithmetic, …).
 *   - `Q.or` / `Q.not` — take sub-generators; closure capture over outer
 *     handles supplies the join-variable lists. No explicit var lists, ever.
 *   - Rule invocation (`query.ts`) — yielding a rule application records an
 *     inert call descriptor.
 *   - `Q.var` / `Q._` — naming devices; they contribute nothing to the IR.
 *
 * `yield*` is the collector: you cannot obtain a clause's binding without
 * contributing the clause, clauses accumulate implicitly while bindings
 * return explicitly, and every inclusion re-runs the build function, so
 * fresh vars make self-joins hygienic with no alpha-renaming machinery.
 */
import type { Eid } from "../Eid.ts";
import type { AnyEntity } from "../Entity.ts";
import type { InFocus } from "./focus.ts";
import type { FocusShape, Shape, ValidShape, SelectResult, AttrValue } from "../shapes.ts";
/**
 * What a var stands for, which decides how its cell reads back:
 * an `entity` cell wraps as an `Eid`, a `t` cell converts the engine's tx
 * eid back to the basis `t`, everything else passes through.
 */
export type VarKind = "entity" | "value" | "t" | "tx" | "op";
/**
 * The namespace brand a var carries — the same `_ns` phantom {@link Eid}
 * uses. `Var<Eid<Issue>>` brands as `Issue`; a value var stays
 * {@link AnyEntity} (unconstrained).
 */
export type VarNs<T> = T extends {
    readonly _ns: infer E;
} ? E extends AnyEntity ? E : AnyEntity : AnyEntity;
/**
 * A query variable — an *identity*, not a name. Two mentions of one `Var`
 * are the same variable wherever they appear; a typo is a compile error
 * because there is no string to mistype. `T` is the value the var binds
 * (phantom); `N` is the focus namespace an entity var is branded with
 * (the same brand {@link Eid} carries — not a fourth vocabulary).
 */
export interface Var<T = unknown, N extends AnyEntity = VarNs<T>> {
    readonly _tag: "QVar";
    readonly id: number;
    /** @internal refined as positions are minted; drives cell reshaping */
    kind: VarKind;
    /** @internal the namespace an entity var is branded with, when known */
    ns?: string | undefined;
    /** Phantom — the bound value's type. Never present at runtime. */
    readonly _type?: T;
    /** Phantom — the focus namespace, same brand as {@link Eid}. */
    readonly _ns?: N;
}
export type AnyVar = Var<any, any>;
/** The focus namespace a var is branded with (`AnyEntity` when unbranded). */
export type FocusOf<V> = V extends Var<any, infer N> ? N : AnyEntity;
/** @internal Mint a fresh var. Public spelling is {@link Q.var}. */
export declare const mkVar: <T = unknown, N extends AnyEntity = VarNs<T>>(kind?: VarKind, ns?: string) => Var<T, N>;
export declare const isVar: (x: unknown) => x is AnyVar;
/** `Q._` — "this position is unconstrained". Minting device, not IR. */
export interface Blank {
    readonly _tag: "QBlank";
}
export declare const isBlank: (x: unknown) => x is Blank;
/**
 * The body of a query, rule or fragment: a generator whose yields are
 * kernel commands and whose return is the binding (a handle, a projection,
 * or nothing). Fragments compose by native delegation — `yield* frag(e)` —
 * typed by TS's own Generator types.
 */
export type QueryGen<R = void> = Generator<AnyCommand, R, any>;
/** The row cell an entity var reads back as: the wrapped id. */
export type EidCell = {
    readonly id: number;
};
/** A fragment: a rule with modes — bound vars are arguments, the free var
 * is its return. `void` keeps the pipeline's focus; a handle refocuses. */
export type Fragment<In = AnyVar, R = void> = (focus: In) => QueryGen<R>;
interface Yieldable<R> {
    [Symbol.iterator](): Iterator<AnyCommand, R, any>;
}
/** An attr reference in a clause: anything carrying an ident. */
export interface AttrLike {
    readonly ident: string;
}
/** A position: a var/handle, a literal, `Q._`, or omitted. */
export type Position = AnyVar | Blank | unknown;
/**
 * The handle a fact answers with. Positions are minted lazily — reading
 * `.t` is what puts the tx position on the wire, so an unread position
 * stays a blank. `t` and `tx` are the same position read two ways (the
 * basis `t`, or the transaction entity); a fact hands out one or the other.
 */
export interface FactHandle<T = unknown> {
    readonly e: Var<EidCell>;
    readonly v: Var<T>;
    readonly t: Var<number>;
    readonly tx: Var<EidCell>;
    readonly op: Var<boolean>;
}
export interface FactCommand<T = unknown> extends Yieldable<FactHandle<T>> {
    readonly _tag: "fact";
    /** @internal e as given; undefined/blank mints via the handle */
    readonly e0: Position | undefined;
    readonly attr: AttrLike | undefined;
    readonly v0: Position | undefined;
    /** @internal minted positions (lazy) */
    eVar?: AnyVar;
    vVar?: AnyVar;
    txVar?: AnyVar;
    txKind?: "t" | "tx";
    opVar?: AnyVar;
    readonly handle: FactHandle<T>;
}
export interface CmpCommand extends Yieldable<void> {
    readonly _tag: "cmp";
    /** engine builtin name: `=`, `not=`, `<`, `starts-with?`, `re-find?`, `in` … */
    readonly op: string;
    readonly args: readonly Position[];
    /** Fold both sides through `lower-case` before the predicate. */
    readonly ignoreCase?: boolean;
}
/**
 * A function-binding clause: `[(fn arg…) ?ret]`. `yield*` answers the
 * bound result var so the next clause can name it.
 */
export interface FnBindCommand extends Yieldable<AnyVar> {
    readonly _tag: "fnBind";
    readonly fn: string;
    readonly args: readonly Position[];
    readonly ret: AnyVar;
}
/** `{ ignoreCase: true }` on {@link Q.startsWith} / {@link Q.endsWith} / {@link Q.includes}. */
export interface StringPredOpts {
    readonly ignoreCase?: boolean;
}
export interface OrCommand extends Yieldable<void> {
    readonly _tag: "or";
    readonly branches: readonly SubBody[];
}
export interface NotCommand extends Yieldable<void> {
    readonly _tag: "not";
    readonly body: SubBody;
}
/** A sub-body: a generator function, an already-applied generator
 * (`Q.not(has(Issue.assignee)(e))`), or one bare command. */
export type SubBody = QueryGen<unknown> | (() => QueryGen<unknown>) | CmpCommand | FactCommand<any> | OrCommand | NotCommand;
/** `entities(ns)` in a generator body: mint a branded var, membership rule. */
export interface MemberCommand<N extends AnyEntity = AnyEntity> extends Yieldable<Var<Eid<N>>> {
    readonly _tag: "member";
    readonly ns: N;
}
/** A command that splices itself (rule calls, `q.open`) — it records its
 * own clauses through the collector it is handed. */
export interface SpliceCommand extends Yieldable<any> {
    readonly _tag: "splice";
    splice(ctx: BuildCtx): unknown;
}
export type AnyCommand = FactCommand<any> | CmpCommand | FnBindCommand | OrCommand | NotCommand | MemberCommand | SpliceCommand;
export interface MemberClause {
    readonly _tag: "memberOf";
    readonly ns: AnyEntity;
    readonly v: AnyVar;
}
export interface OrClause {
    readonly _tag: "orGroup";
    readonly branches: readonly BClause[][];
}
export interface NotClause {
    readonly _tag: "notGroup";
    readonly clauses: readonly BClause[];
}
/** An applied named rule; `query.ts` records these via a splice command. */
export interface CallClause {
    readonly _tag: "ruleCall";
    readonly rule: unknown;
    readonly args: readonly Position[];
    readonly ret: AnyVar;
}
export type BClause = FactCommand<any> | CmpCommand | FnBindCommand | MemberClause | OrClause | NotClause | CallClause;
/** The local collector one build pass accumulates into. */
export interface BuildCtx {
    readonly clauses: BClause[];
}
/**
 * Drive a body: yields are recorded as clauses, the yielded command's
 * handle flows back as the `yield*` value, and the return value is the
 * body's binding. Synchronous, pure, and total — this *is* `Query.gen`.
 */
export declare const runBody: <R>(gen: QueryGen<R>, ctx: BuildCtx) => R;
/** Record a whole sub-body into a fresh clause list. */
export declare const collectBody: (b: SubBody) => BClause[];
/** `Q.pull(focus, shape)` — project one root through a select shape. */
export interface PullSpec<Row = unknown> {
    readonly _tag: "pullSpec";
    readonly focus: AnyVar;
    readonly shape: Shape;
    /** Phantom — the row this projects to. Never present at runtime. */
    readonly _row?: Row;
}
/** An aggregate cell over a bound var (`Q.max(f.t)`, `Q.count(e)`). */
export interface AggSpec<T = unknown> {
    readonly _tag: "aggSpec";
    readonly fn: "count" | "count-distinct" | "sum" | "avg" | "min" | "max";
    readonly v: AnyVar;
    readonly _out?: T;
}
/** One projected cell: a bound var, a pull, an aggregate, or a nested record. */
export type Cell = AnyVar | PullSpec<any> | AggSpec<any> | CellRecord;
export interface CellRecord {
    readonly [key: string]: Cell;
}
/** `Q.rows({...})` — a multi-column projection, one cell per key. */
export interface RowsSpec<Row = unknown> {
    readonly _tag: "rowsSpec";
    readonly cells: CellRecord;
    readonly _row?: Row;
}
/**
 * `Q.value(cell)` — a scalar terminal. `db.query` resolves to the cell
 * itself (`number`, not `[{ n }]`). The engine's scalar find spec.
 */
export interface ValueSpec<T = unknown> {
    readonly _tag: "valueSpec";
    readonly cell: AggSpec<T> | AnyVar | PullSpec<any>;
    readonly _out?: T;
}
/**
 * `Q.distinct({ … })` — opt into unique projected tuples. The default is
 * one row per source record; this is the set of projected cells.
 */
export interface DistinctSpec<Row = unknown> {
    readonly _tag: "distinctSpec";
    readonly inner: PullSpec<any> | RowsSpec<any> | CellRecord;
    readonly _row?: Row;
}
/** A row projection `Q.distinct` may wrap — not a scalar `Q.value`. */
export type Distinctable = PullSpec<any> | RowsSpec<any> | CellRecord | DistinctSpec<any>;
export type Projection = PullSpec<any> | RowsSpec<any> | CellRecord | ValueSpec<any> | DistinctSpec<any>;
export declare const isPullSpec: (x: unknown) => x is PullSpec;
export declare const isRowsSpec: (x: unknown) => x is RowsSpec;
export declare const isAggSpec: (x: unknown) => x is AggSpec;
export declare const isValueSpec: (x: unknown) => x is ValueSpec;
export declare const isDistinctSpec: (x: unknown) => x is DistinctSpec;
/**
 * The fluent/lib `.select(shape, extras)` focus. `Q.count(Q.focus)` in
 * the extras record rewrites to the pipeline's current focus var.
 */
export declare const FOCUS: AnyVar;
export declare const isFocusSentinel: (v: unknown) => v is AnyVar;
/** The row one cell reads back as. */
export type CellValue<C> = C extends Var<infer T> ? unknown extends T ? unknown : T : C extends PullSpec<infer R> ? R : C extends AggSpec<infer T> ? T : C extends CellRecord ? RecordRow<C> : never;
export type RecordRow<R> = {
    readonly [K in keyof R]: CellValue<R[K]>;
};
/** The row a projection value denotes. */
export type RowOfProjection<P> = P extends DistinctSpec<infer R> ? R : P extends ValueSpec<infer T> ? T : P extends PullSpec<infer R> ? R : P extends RowsSpec<infer R> ? R : P extends CellRecord ? RecordRow<P> : never;
/**
 * When `e` is a namespace-branded var, the attr must be a member of that
 * focus's field map. Unbranded vars, blanks, and omitted e stay open.
 */
type FactAttr<E, A> = [E] extends [Var<any, infer N>] ? [AnyEntity] extends [N] ? A : [InFocus<A, N>] extends [true] ? A : {
    readonly "ramose/query: this attribute is not a field of the focus entity": never;
} : A;
declare const fact: <E extends Position | undefined, A extends AttrLike = AttrLike>(e?: E, attr?: FactAttr<E, A> | Blank, v?: Position) => FactCommand<AttrValue<A>>;
/**
 * A comparison operand: a bound var, a literal, or an aggregate cell. A
 * comparison that mentions an aggregate cell lowers into the wire's
 * `:having` section — aggregates are not bound until after grouping, so
 * the placement *is* the semantics: it filters whole groups, after they
 * are computed. The cell must reach the projection (that is what names it
 * on the row), and such a comparison cannot sit inside `Q.or` / `Q.not`
 * — there is no group yet where those lower.
 */
export type Operand<T = unknown> = Var<T> | AggSpec<T> | T;
/**
 * The kernel, as one namespace. Everything here is an inert description;
 * `db.query` is where computation (and Effect) begins.
 */
export declare const Q: {
    /**
     * The one pattern clause. Unbound positions mint typed vars — the
     * e-position brand flows from the attr — and the returned handle exposes
     * `{ e, v, t, tx, op }`. `Q.fact(e)` (attr-free) is generic over every
     * namespace: it says "some fact about `e`".
     */
    fact: typeof fact;
    /** A fresh var, unconstrained until a clause names it. */
    var: <T = unknown>() => Var<T>;
    /** The unconstrained position. */
    _: Blank;
    eq: <T>(a: Operand<T>, b: Operand<T>) => CmpCommand;
    ne: <T>(a: Operand<T>, b: Operand<T>) => CmpCommand;
    lt: <T>(a: Operand<T>, b: Operand<T>) => CmpCommand;
    lte: <T>(a: Operand<T>, b: Operand<T>) => CmpCommand;
    gt: <T>(a: Operand<T>, b: Operand<T>) => CmpCommand;
    gte: <T>(a: Operand<T>, b: Operand<T>) => CmpCommand;
    startsWith: (v: Operand<string>, needle: Operand<string>, opts?: StringPredOpts) => CmpCommand;
    endsWith: (v: Operand<string>, needle: Operand<string>, opts?: StringPredOpts) => CmpCommand;
    includes: (v: Operand<string>, needle: Operand<string>, opts?: StringPredOpts) => CmpCommand;
    /** `re-find?` compiles the pattern with no flags — there is no inline `(?i)`. */
    matches: (v: Operand<string>, re: RegExp | string) => CmpCommand;
    in: <T>(v: Operand<T>, values: readonly T[]) => CmpCommand;
    /**
     * Bind the result of an engine function: `yield* Q.call("+", a, 1)` is
     * `[(+ ?a 1) ?ret]`. The names `Q.call` accepts are the engine's
     * function set (`lower-case`, `str`, arithmetic, …) — documented on
     * the query-language page.
     */
    call: (fn: string, ...args: Position[]) => FnBindCommand;
    /**
     * Disjunction of sub-bodies. Join variables are whatever outer handles
     * the branches close over — never an explicit list.
     */
    or: (...branches: readonly SubBody[]) => OrCommand;
    /** Negation of a sub-body, scoped by closure capture like {@link Q.or}. */
    not: (body: SubBody) => NotCommand;
    /** Project one root through a select shape — the closing contract of a
     * single-root body. A branded focus var rejects another entity's fields. */
    pull: <V extends AnyVar, const S extends Shape>(focus: V, shape: S & ValidShape<S> & FocusShape<FocusOf<V>, S>) => PullSpec<SelectResult<S>>;
    /** Several roots (or computed cells) per row — the multi-root contract. */
    rows: <const R extends CellRecord>(cells: R) => RowsSpec<RecordRow<R>>;
    /**
     * A scalar terminal: `db.query` resolves to the cell, not a one-row
     * array. `Q.value(Q.count(e))` is a `number` — 0 over no matches.
     */
    value: <C extends AggSpec<any> | AnyVar | PullSpec<any>>(cell: C) => ValueSpec<CellValue<C>>;
    /**
     * Unique projected tuples. The default is one row per source record
     * — two issues with the same title are two rows. Wrap the same
     * record (or `Q.rows` / `Q.pull`) to keep one row when every
     * projected cell agrees.
     */
    distinct: <const P extends Distinctable>(proj: P) => DistinctSpec<RowOfProjection<P>>;
    /**
     * The `.select(shape, extras)` focus. Write `Q.count(Q.focus)` in the
     * extras record; lowering rewrites it to the pipeline's current focus.
     */
    focus: AnyVar;
    /** Merge extra cells onto a base projection (used by `Query.enrich`). */
    row: <Base extends Projection, const Extra extends CellRecord>(base: Base, extra: Extra) => Base extends DistinctSpec<any> ? DistinctSpec<RowOfProjection<Base> & RecordRow<Extra>> : RowsSpec<RowOfProjection<Base> & RecordRow<Extra>>;
    count: (v: AnyVar) => AggSpec<number>;
    countDistinct: (v: AnyVar) => AggSpec<number>;
    sum: (v: Var<number> | AnyVar) => AggSpec<number>;
    avg: (v: Var<number> | AnyVar) => AggSpec<number | null>;
    min: <T>(v: Var<T>) => AggSpec<T | null>;
    max: <T>(v: Var<T>) => AggSpec<T | null>;
};
export {};
//# sourceMappingURL=kernel.d.ts.map