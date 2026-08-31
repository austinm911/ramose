import type { Eid } from "../Eid.ts";
import type { AnyComposer } from "../Composer.ts";
import type { InFocus } from "./focus.ts";
import type { FocusShape, Shape, ValidShape, SelectResult, AttrValue } from "../shapes.ts";
export type VarKind = "entity" | "value" | "id" | "t" | "tx" | "op";
export type VarNs<T> = T extends {
    readonly _ns: infer E;
} ? E extends AnyComposer ? E : AnyComposer : AnyComposer;
/**
 * A query variable — an *identity*, not a name. Two mentions of one `Var`
 * are the same variable wherever they appear; a typo is a compile error
 * because there is no string to mistype. `T` is the value the var binds
 * (phantom); `N` is the focus namespace an entity var is branded with
 * (the same brand {@link Eid} carries — not a fourth vocabulary).
 */
export interface Var<T = unknown, N extends AnyComposer = VarNs<T>> {
    readonly _tag: "QVar";
    readonly id: number;
    kind: VarKind;
    ns?: string | undefined;
    readonly _type?: T;
    readonly _ns?: N;
}
export type AnyVar = Var<any, any>;
export type FocusOf<V> = V extends Var<any, infer N> ? N : AnyComposer;
export declare const mkVar: <T = unknown, N extends AnyComposer = VarNs<T>>(kind?: VarKind, ns?: string) => Var<T, N>;
export declare const isVar: (x: unknown) => x is AnyVar;
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
export type EidCell = {
    readonly id: number;
};
/** A fragment: a rule with modes — bound vars are arguments, the free var
 * is its return. `void` keeps the pipeline's focus; a handle refocuses. */
export type Fragment<In = AnyVar, R = void> = (focus: In) => QueryGen<R>;
interface Yieldable<R> {
    [Symbol.iterator](): Iterator<AnyCommand, R, any>;
}
export interface AttrLike {
    readonly ident: string;
}
export type Position = AnyVar | Blank | unknown;
export interface FactHandle<T = unknown> {
    readonly e: Var<EidCell>;
    readonly v: Var<T>;
    readonly t: Var<number>;
    readonly tx: Var<EidCell>;
    readonly op: Var<boolean>;
}
export interface FactCommand<T = unknown> extends Yieldable<FactHandle<T>> {
    readonly _tag: "fact";
    readonly e0: Position | undefined;
    readonly attr: AttrLike | undefined;
    readonly v0: Position | undefined;
    eVar?: AnyVar;
    vVar?: AnyVar;
    txVar?: AnyVar;
    txKind?: "t" | "tx";
    opVar?: AnyVar;
    readonly handle: FactHandle<T>;
}
export interface CmpCommand extends Yieldable<void> {
    readonly _tag: "cmp";
    readonly op: string;
    readonly args: readonly Position[];
    readonly ignoreCase?: boolean;
}
export interface FnBindCommand extends Yieldable<AnyVar> {
    readonly _tag: "fnBind";
    readonly fn: string;
    readonly args: readonly Position[];
    readonly ret: AnyVar;
}
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
export type SubBody = QueryGen<unknown> | (() => QueryGen<unknown>) | CmpCommand | FactCommand<any> | OrCommand | NotCommand;
export interface MemberCommand<N extends AnyComposer = AnyComposer> extends Yieldable<Var<Eid<N>>> {
    readonly _tag: "member";
    readonly ns: N;
}
export interface SpliceCommand extends Yieldable<any> {
    readonly _tag: "splice";
    splice(ctx: BuildCtx): unknown;
}
export type AnyCommand = FactCommand<any> | CmpCommand | FnBindCommand | OrCommand | NotCommand | MemberCommand | SpliceCommand;
export interface MemberClause {
    readonly _tag: "memberOf";
    readonly ns: AnyComposer;
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
export interface CallClause {
    readonly _tag: "ruleCall";
    readonly rule: unknown;
    readonly args: readonly Position[];
    readonly ret: AnyVar;
}
export type BClause = FactCommand<any> | CmpCommand | FnBindCommand | MemberClause | OrClause | NotClause | CallClause;
export interface BuildCtx {
    readonly clauses: BClause[];
}
export declare const runBody: <R>(gen: QueryGen<R>, ctx: BuildCtx) => R;
export declare const collectBody: (b: SubBody) => BClause[];
export interface PullSpec<Row = unknown> {
    readonly _tag: "pullSpec";
    readonly focus: AnyVar;
    readonly shape: Shape;
    readonly _row?: Row;
}
export interface AggSpec<T = unknown> {
    readonly _tag: "aggSpec";
    readonly fn: "count" | "count-distinct" | "sum" | "avg" | "min" | "max";
    readonly v: AnyVar;
    readonly _out?: T;
}
export type Cell = AnyVar | PullSpec<any> | AggSpec<any> | CellRecord;
export interface CellRecord {
    readonly [key: string]: Cell;
}
export interface RowsSpec<Row = unknown> {
    readonly _tag: "rowsSpec";
    readonly cells: CellRecord;
    readonly _row?: Row;
}
export interface ValueSpec<T = unknown> {
    readonly _tag: "valueSpec";
    readonly cell: AggSpec<T> | AnyVar | PullSpec<any>;
    readonly _out?: T;
}
export interface DistinctSpec<Row = unknown> {
    readonly _tag: "distinctSpec";
    readonly inner: PullSpec<any> | RowsSpec<any> | CellRecord;
    readonly _row?: Row;
}
export type Distinctable = PullSpec<any> | RowsSpec<any> | CellRecord | DistinctSpec<any>;
export type Projection = PullSpec<any> | RowsSpec<any> | CellRecord | ValueSpec<any> | DistinctSpec<any>;
export declare const isPullSpec: (x: unknown) => x is PullSpec;
export declare const isRowsSpec: (x: unknown) => x is RowsSpec;
export declare const isAggSpec: (x: unknown) => x is AggSpec;
export declare const isValueSpec: (x: unknown) => x is ValueSpec;
export declare const isDistinctSpec: (x: unknown) => x is DistinctSpec;
export declare const FOCUS: AnyVar;
export declare const isFocusSentinel: (v: unknown) => v is AnyVar;
export type CellValue<C> = C extends Var<infer T> ? unknown extends T ? unknown : T : C extends PullSpec<infer R> ? R : C extends AggSpec<infer T> ? T : C extends CellRecord ? RecordRow<C> : never;
export type RecordRow<R> = {
    readonly [K in keyof R]: CellValue<R[K]>;
};
export type RowOfProjection<P> = P extends DistinctSpec<infer R> ? R : P extends ValueSpec<infer T> ? T : P extends PullSpec<infer R> ? R : P extends RowsSpec<infer R> ? R : P extends CellRecord ? RecordRow<P> : never;
type FactAttr<E, A> = [E] extends [Var<any, infer N>] ? [AnyComposer] extends [N] ? A : [InFocus<A, N>] extends [true] ? A : {
    readonly "ramose/query: this attribute is not a field of the focus entity": never;
} : A;
declare const fact: <E extends Position | undefined, A extends AttrLike = AttrLike>(e?: E, attr?: FactAttr<E, A> | Blank, v?: Position) => FactCommand<AttrValue<A>>;
export type Operand<T = unknown> = Var<T> | AggSpec<T> | T;
/**
 * The kernel, as one namespace. Everything here is an inert description;
 * `db.query` is where computation (and Effect) begins.
 */
export declare const Q: {
    fact: typeof fact;
    var: <T = unknown>() => Var<T>;
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
    matches: (v: Operand<string>, re: RegExp | string) => CmpCommand;
    in: <T>(v: Operand<T>, values: readonly T[]) => CmpCommand;
    call: (fn: string, ...args: Position[]) => FnBindCommand;
    or: (...branches: readonly SubBody[]) => OrCommand;
    not: (body: SubBody) => NotCommand;
    pull: <V extends AnyVar, const S extends Shape>(focus: V, shape: S & ValidShape<S> & FocusShape<FocusOf<V>, S>) => PullSpec<SelectResult<S>>;
    rows: <const R extends CellRecord>(cells: R) => RowsSpec<RecordRow<R>>;
    value: <C extends AggSpec<any> | AnyVar | PullSpec<any>>(cell: C) => ValueSpec<CellValue<C>>;
    distinct: <const P extends Distinctable>(proj: P) => DistinctSpec<RowOfProjection<P>>;
    focus: AnyVar;
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