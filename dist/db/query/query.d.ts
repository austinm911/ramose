/**
 * `Query.q(body)` — one constructor, one kind of object.
 *
 * A query is a rule: a body of kernel clauses plus a projection. The body
 * is a generator that returns the projection, or a function returning a
 * closed pipeline — two spellings of the same value, so escalating from
 * pipe to generator is un-sugaring, never rewriting.
 *
 * Output is inferred: the type of one return expression. Queries compose
 * one way — generator delegation — at three altitudes: `yield* frag(handle)`
 * (build-inlined fragment), `yield* q.open()` (a whole closed query as a
 * subquery), and `Query.rule` (engine-expanded, which is what makes
 * recursion work). Effect appears nowhere here: a built query is inert
 * data — hashable for live identity, stable as a hook dependency — and
 * computation starts at `db.query`.
 */
import { type Eid } from "../Eid.ts";
import type { AnyEntity } from "../Entity.ts";
import { type OrderDir, type OrderEmpty, type PathCarrier, type Shape } from "../shapes.ts";
import { type AggSpec, type AnyVar, type BClause, type Cell, type EidCell, type CellRecord, type Fragment, type Position, type PullSpec, type QueryGen, type RowOfProjection, type SpliceCommand, type ValueSpec, type Var } from "./kernel.ts";
/**
 * Where a page ended — feed it to `q.after` to get the next one. Opaque: the
 * `keys` are the last row's sort-key values (the entity-id tie-breaker
 * included), and they mean something only to the query that minted them —
 * `.after` rejects a cursor whose shape does not fit. Hold it in memory, or
 * round-trip through `Query.encodeCursor` / `Query.decodeCursor` so Instant
 * keys stay `Date`s (a JSON-stringified `Date` sorts as a string).
 */
export interface Cursor {
    readonly _tag: "Cursor";
    /** @internal One value per lowered `:order` key, the tie-breaker last. */
    readonly keys: readonly unknown[];
}
export declare const isCursor: (x: unknown) => x is Cursor;
/**
 * What a cursor-paged query resolves to: the page's rows, and the cursor of
 * its last row — `null` when there is no next page (the page came back empty,
 * or shorter than its `limit`). Without a `limit`, a full sweep always ends
 * on one empty page: the peer cannot know the last row is the last.
 */
export interface Page<Row = unknown> {
    readonly rows: readonly Row[];
    readonly cursor: Cursor | null;
}
export type BuiltOrder = {
    readonly kind: "path";
    readonly path: readonly string[];
    readonly revs: readonly boolean[];
    readonly dir: OrderDir;
    readonly empty: OrderEmpty;
} | {
    readonly kind: "cell";
    readonly cell: Cell;
    readonly dir: OrderDir;
    readonly empty: OrderEmpty;
};
/** Extra aggregate cells on a `select` — a record, or a callback of the focus. */
export type SelectExtra = CellRecord | ((focus: AnyVar) => CellRecord);
export type PipeStage = {
    readonly kind: "frag";
    readonly frag: Fragment<AnyVar, unknown>;
} | {
    readonly kind: "select";
    readonly shape: Shape;
    readonly extra?: SelectExtra;
} | {
    readonly kind: "orderBy";
    readonly key: string | PathCarrier;
    readonly dir: OrderDir;
    readonly empty: OrderEmpty;
} | {
    readonly kind: "limit";
    readonly n: number;
} | {
    readonly kind: "offset";
    readonly n: number;
} | {
    readonly kind: "ids";
};
/**
 * What {@link QueryObject.orderBy} accepts: a selected column name, an
 * attribute path, a bound var / aggregate cell, or a picker of a projected
 * cell (`r => r.n`).
 */
export type QueryOrderKey<Row = unknown> = (string & keyof Row) | AnyVar | AggSpec<any> | ((row: Row) => unknown);
export interface QueryOrder {
    readonly key: unknown;
    readonly dir: OrderDir;
    readonly empty: OrderEmpty;
}
/**
 * The pipe surface's incremental builder for the same body value
 * `Query.q` writes directly. `Row` is a phantom: the row the
 * pipeline's terminals have shaped so far. `N` is the current focus
 * namespace (`entities(User)` starts as `User`; `follow` moves it).
 * Runtime `ns` is the scan root `entities(...)` planted — membership
 * lowering reads that object; `N` is the type-level focus and does
 * not have to stay in lockstep after a traversal. In a generator
 * body the same value is a clause source: `yield* entities(Issue)`
 * mints the branded focus var and contributes membership.
 */
export interface Pipeline<Row = unknown, N extends AnyEntity = AnyEntity> {
    readonly _tag: "Pipeline";
    readonly ns: N;
    readonly stages: readonly PipeStage[];
    readonly _row?: Row;
    [Symbol.iterator](): Iterator<never, Var<Eid<N>>, any>;
}
export declare const isPipeline: (x: unknown) => x is Pipeline;
/** What `yield* q.open(p)` answers: the focus to keep constraining, and the
 * opened query's projected columns to keep (or extend). `cols` is typed as
 * a pull spec carrying the opened query's row — treat it as opaque: return
 * it, or extend it with `Q.row(cols, extra)`. */
export interface OpenResult<Row = unknown> {
    readonly focus: Var<EidCell>;
    readonly cols: PullSpec<Row>;
    readonly _row?: Row;
}
interface OpenCommand<Row> extends SpliceCommand {
    readonly _row?: Row;
    [Symbol.iterator](): Iterator<never, OpenResult<Row>, any>;
}
/**
 * A closed query value: a body, runnable by `db.query` / `db.live` and
 * delegable into other builds via {@link QueryObject.open}. `Row` is the
 * inferred row; `Out` is what a terminal resolves to — the rows array by
 * default, one row (or `null`) after {@link QueryObject.one} /
 * {@link QueryObject.oneOrFail}, a {@link Page} after
 * {@link QueryObject.after}, a scalar after {@link Q.value}.
 *
 * `Term` distinguishes a body-derived scalar (`Q.value`) from cursor
 * terminals that also set `Out` (`one` / `oneOrFail` / `after`), so
 * {@link QueryObject.logic} can reset the latter to the rows array
 * without lying about the former.
 */
type QueryTerm = "rows" | "value" | "one" | "oneOrFail" | "after";
export interface QueryObject<Row = unknown, Out = readonly Row[], Term extends QueryTerm = "rows"> {
    readonly _tag: "Query";
    /** @internal provenance: re-run per inclusion, so vars stay hygienic */
    readonly body: () => unknown;
    /** @internal `logic()` strips cursor stages instead of failing `open` */
    readonly stripCursor: boolean;
    /** @internal `one()` / `oneOrFail()` — forced `limit 1`/`2`, unwrapped. */
    readonly take: "one" | "oneOrFail" | undefined;
    /** @internal the keyset cursor `after(...)` seeks past; `null` is page one. */
    readonly seek: Cursor | null | undefined;
    /** @internal `orderBy` keys stored on the query value (both spellings). */
    readonly orders: readonly QueryOrder[];
    /** @internal `limit(n)` stored on the query value. */
    readonly limitN: number | undefined;
    /** @internal `offset(n)` stored on the query value. */
    readonly offsetN: number | undefined;
    /**
     * Delegate this whole query into an enclosing build: its clauses inline,
     * and it answers `{ focus, cols }` to keep constraining. Cursor terminals
     * don't delegate: extend then order, or strip with {@link QueryObject.logic}.
     */
    open(): OpenCommand<Row>;
    /** This query without its cursor (orderBy/limit/offset/one/after) — the
     * logic composes; the cursor was post-processing for the outermost query.
     * Body-derived `Q.value` scalars stay scalars; `one` / `oneOrFail` /
     * `after` reset to the rows array. */
    logic(): QueryObject<Row, Term extends "value" ? Out : readonly Row[], Term extends "value" ? "value" : "rows">;
    /**
     * Sort by a selected column, an attribute path, a bound var / projected
     * cell, or a picker of one (`r => r.n`). Reaches both the fluent chain
     * and `Query.q` generator values. The fluent override keeps row-typed
     * string keys (`keyof Row`) and focus-typed attributes.
     */
    orderBy(key: (row: Row) => unknown, dir?: OrderDir, opts?: {
        readonly empty?: OrderEmpty;
    }): QueryObject<Row, Out, Term>;
    orderBy(key: any, dir?: OrderDir, opts?: {
        readonly empty?: OrderEmpty;
    }): QueryObject<Row, Out, Term>;
    /** Keep at most `n` rows. */
    limit(n: number): QueryObject<Row, Out, Term>;
    /** Drop `n` rows from the front of the (ordered) result. */
    offset(n: number): QueryObject<Row, Out, Term>;
    /**
     * At most one row. Lowering forces `limit 1`; the result is that row or
     * `null`, the same absence `db.pull` uses. Extra matches are not fetched.
     */
    one(): QueryObject<Row, Row | null, "one">;
    /**
     * Exactly one row. Lowering forces `limit 2` so a second match is
     * witnessed without pulling a whole page, and `db.query` fails with `NotOne`
     * when the peer answers zero or two.
     */
    oneOrFail(): QueryObject<Row, Row, "oneOrFail">;
    /**
     * Keyset-page a sorted query: the result becomes a {@link Page}, whose
     * `cursor` is where it ended — pass `null` for the first page and the
     * previous page's cursor after that. Needs an `orderBy` (the cursor is a
     * position in the sort); the entity id rides as a final tie-breaker, so
     * rows that tie on every key still land on exactly one page. The seek is
     * the peer's: `limit(n)` is n rows *past* the cursor, and unlike `offset`
     * the walk does not shift when rows are inserted before it.
     */
    after(cursor: Cursor | null): QueryObject<Row, Page<Row>, "after">;
    /** Phantom — the inferred row. Never present at runtime. */
    readonly _row?: Row;
    /** Phantom — what a terminal resolves to. Never present at runtime. */
    readonly _out?: Out;
}
export type AnyQueryObject = QueryObject<any, any>;
/**
 * The row type a query yields — so an app names it once, from the query,
 * instead of restating the shape by hand:
 *
 * ```ts
 * const boardQuery = Query.q(() => pipe(entities(Issue), select({ … })));
 * type BoardRow = Ramose.Row<typeof boardQuery>;   // one row
 * type BoardRows = Ramose.Rows<typeof boardQuery>; // the readonly array
 * ```
 */
export type Row<Q> = Q extends QueryObject<infer R, any> ? R : never;
/** The readonly array of {@link Row} — what `db.query` resolves an unpaged,
 * untaken query to. */
export type Rows<Q> = readonly Row<Q>[];
export declare const isQueryObject: (x: unknown) => x is AnyQueryObject;
/** What a body may produce. */
export type QueryBody<P, Prj> = (p: P) => QueryGen<Prj> | Pipeline<any>;
type RowFromBody<B> = B extends () => infer Out ? Out extends QueryGen<infer Prj> ? Prj extends ValueSpec<infer T> ? T : Prj extends AnyVar ? {
    readonly id: number;
} : RowOfProjection<Prj> : Out extends Pipeline<infer Row> ? Row : never : never;
type IsValueBody<B> = B extends () => QueryGen<infer Prj> ? (Prj extends ValueSpec<any> ? true : false) : false;
type OutFromBody<B> = IsValueBody<B> extends true ? RowFromBody<B> : readonly RowFromBody<B>[];
export declare const makeQueryObject: <Row, Out = readonly Row[], Term extends QueryTerm = "rows">(body: () => unknown, stripCursor: boolean, take?: "one" | "oneOrFail", seek?: Cursor | null, orders?: readonly QueryOrder[], limitN?: number, offsetN?: number) => QueryObject<Row, Out, Term>;
/**
 * Build a query. The body returns the projection; both the pipe and
 * generator spellings denote the same value. Put changing values in the
 * body as literals — `Query.q` takes one argument.
 */
export declare function q<B extends () => QueryGen<any> | Pipeline<any>>(body: B): QueryObject<RowFromBody<B>, OutFromBody<B>, IsValueBody<B> extends true ? "value" : "rows">;
interface RuleBuilt {
    readonly headVars: readonly AnyVar[];
    readonly retVar: AnyVar | undefined;
    readonly clauses: readonly BClause[];
}
/**
 * A named rule: apply it to bound handles (`yield* projectOf(issue)`) and
 * the application records an inert call descriptor — the body is expanded
 * by the engine, not the builder, which is what makes recursion work and
 * what lets the same value install as policy data.
 */
export interface RuleValue {
    (...args: readonly Position[]): SpliceCommand;
    readonly _tag: "QueryRule";
    readonly ruleName: string;
    /** @internal memoized head/body build */
    ensureBuilt(): RuleBuilt;
}
export declare const isRuleValue: (x: unknown) => x is RuleValue;
/**
 * `Query.rule(name, body)` — the named form of the head/body constructor.
 * The body's parameters are the bound head vars; a returned var joins the
 * head as the free position (promotion: an instantiated fragment becomes a
 * named engine rule in exactly this one mechanical call).
 */
export declare function rule(name: string, body: (...vars: never[]) => QueryGen<unknown>): RuleValue;
/**
 * Lift an enricher generator into a query transformer: the query-level
 * generics live here, never in user code. The enricher sees the opened
 * query's focus and returns extra cells for the row.
 */
export declare const enrich: <Extra extends CellRecord>(body: (e: Var<EidCell>) => QueryGen<Extra>) => <Row>(qv: QueryObject<Row>) => QueryObject<Row & RowOfProjection<Extra>>;
/** Shape-preserving sibling of {@link enrich}: extra constraints, same row. */
export declare const refine: (frag: Fragment<Var<EidCell>, unknown>) => <Row>(qv: QueryObject<Row>) => QueryObject<Row>;
export interface LoweredKernelQuery {
    /** The JS-form wire query (`find`/`where`/`rules`/`order`/`limit`/`offset`). */
    readonly query: Record<string, unknown>;
    /** Reshape the peer's raw result rows into the query's rows. */
    readonly finalize: (result: unknown) => unknown;
}
/** The lowered wire AST — the same JSON `db.query` sends. */
export declare const lowerQueryAst: (qv: AnyQueryObject) => Record<string, unknown>;
/**
 * Lower, or throw {@link InvalidRequest}. `db.query` / `db.live` / an
 * operation's `q` handle share this so a query that cannot lower is a
 * 400 everywhere, not a 500 on the op path.
 */
export declare const tryLowerQueryObject: (qv: AnyQueryObject) => LoweredKernelQuery;
export declare const lowerQueryObject: (qv: AnyQueryObject) => LoweredKernelQuery;
export {};
//# sourceMappingURL=query.d.ts.map