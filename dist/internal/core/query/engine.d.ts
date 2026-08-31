import { Db } from "../db.ts";
import { type ClauseOrigin, type Query } from "./ast.ts";
import { type QueryFn } from "./builtins.ts";
export declare class QueryError extends Error {
    readonly code: string;
}
export type BudgetSpentBy = "caller";
export declare class QueryBudgetError extends QueryError {
    readonly clause: string;
    readonly cells: number;
    readonly limit: number;
    readonly code: string;
    readonly spentBy: BudgetSpentBy;
    constructor(clause: string, cells: number, limit: number, spentBy?: BudgetSpentBy);
}
export declare const CELLS_PER_MB: number;
export declare const DEFAULT_QUERY_MAX_CELLS: number;
export declare class QueryBudget {
    readonly maxCells: number;
    peakCells: number;
    spentBy: BudgetSpentBy;
    constructor(maxCells: number);
    rowLimit(width: number): number;
    charge(clause: string, rows: number, width: number, spentBy?: BudgetSpentBy): void;
    exceeded(clause: string, rows: number, width: number, spentBy?: BudgetSpentBy): QueryBudgetError;
}
export interface QueryOptions {
    functions?: Record<string, QueryFn>;
    maxCells?: number;
    maxRows?: number;
    stats?: QueryStats;
}
export interface QueryStats {
    clauses: {
        clause: string;
        strategy: string;
        origin?: ClauseOrigin | undefined;
        index?: string | undefined;
        rowsIn: number;
        rowsOut: number;
        seeks: number;
        scanned: number;
        ms: number;
    }[];
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