/**
 * Datalog planner + executor.
 *
 * Planning is *seek-driven*: each data pattern picks an index from its bound
 * components (E → EAVT, A → AEVT, A+V → AVET (indexed) / VAET (ref)), clauses
 * are ordered greedily by estimated cardinality, and joins are either
 * index-nested-loop (one seek per distinct join tuple) or streaming hash
 * joins (one scan, probe the relation), chosen by a cost estimate. There is
 * no scan-and-filter fallback except for patterns with no bound E/A at all.
 *
 * Relations are `{ vars, rows }` with rows as arrays aligned to `vars`.
 */
import { Db } from "../db.ts";
import { type ClauseOrigin, type Query } from "./ast.ts";
import { type QueryFn } from "./builtins.ts";
export declare class QueryError extends Error {
    readonly code: string;
}
/**
 * Raised when a query would materialise more intermediate state than the
 * budget allows. Tagged (`code`) so peers can map it to a clear 4xx instead
 * of dying with an OOM inside the 128 MB Worker limit.
 */
/** Who spent the cells that tripped the budget — the caller's clauses or policy's. */
export type BudgetSpentBy = "caller" | "policy";
export declare class QueryBudgetError extends QueryError {
    readonly clause: string;
    readonly cells: number;
    readonly limit: number;
    readonly code: string;
    readonly spentBy: BudgetSpentBy;
    constructor(clause: string, cells: number, limit: number, spentBy?: BudgetSpentBy);
}
/**
 * Memory budget for intermediate relations, in *cells* (row slots: rows ×
 * columns). A cell is one array slot (8 B) plus its share of the row array
 * header, i.e. roughly 16–32 B including the value; we plan on ~32 B/cell.
 * The default keeps the peak relation around 48 MB — well inside a 128 MB
 * Worker with room for segments, novelty and the response.
 */
export declare const CELLS_PER_MB: number;
export declare const DEFAULT_QUERY_MAX_CELLS: number;
/**
 * Row-count / intermediate-size budget shared by every relation a query
 * builds. Checked *while* rows are produced (hot loops compare against a
 * precomputed row limit), so an over-budget query aborts early with
 * {@link QueryBudgetError} rather than after the memory is already gone.
 */
export declare class QueryBudget {
    readonly maxCells: number;
    peakCells: number;
    /** Attribution for the next charge — the executor sets this from clause origin. */
    spentBy: BudgetSpentBy;
    constructor(maxCells: number);
    /** Rows a relation of `width` columns may hold. */
    rowLimit(width: number): number;
    /** Record a materialised relation; throws if it is over budget. */
    charge(clause: string, rows: number, width: number, spentBy?: BudgetSpentBy): void;
    exceeded(clause: string, rows: number, width: number, spentBy?: BudgetSpentBy): QueryBudgetError;
}
export interface QueryOptions {
    /** extra predicates/functions callable from :where */
    functions?: Record<string, QueryFn>;
    /**
     * Memory guard: abort (QueryBudgetError) if any intermediate relation would
     * exceed this many cells (rows × columns). Default {@link DEFAULT_QUERY_MAX_CELLS}.
     */
    maxCells?: number;
    /** @deprecated use maxCells; kept as a plain row cap for compatibility */
    maxRows?: number;
    /** collect planner/executor statistics */
    stats?: QueryStats;
    /**
     * Conjoin namespace read rules into the plan before execution (clause-level
     * pushdown). Default true when `db` is a filtered policy view. `false` is
     * the filtered-only path (#154 / #156) — used to prove equivalence.
     */
    pushdown?: boolean;
}
export interface QueryStats {
    clauses: {
        clause: string;
        strategy: string;
        origin?: ClauseOrigin;
        index?: string;
        rowsIn: number;
        rowsOut: number;
        seeks: number;
        scanned: number;
        ms: number;
    }[];
    /** budget usage: peak intermediate cells vs the limit */
    budget?: {
        maxCells: number;
        peakCells: number;
    };
}
export interface Rel {
    vars: string[];
    rows: unknown[][];
}
export declare function query(db: Db, q: Query | string | object, inputs?: unknown[], opts?: QueryOptions): Promise<any>;
//# sourceMappingURL=engine.d.ts.map