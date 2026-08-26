/**
 * Built-in predicates, functions and aggregates for datalog queries.
 * Values are plain JS (numbers, strings, booleans, Dates, Uint8Array).
 */
export type QueryFn = (...args: any[]) => unknown;
/** Stable key for hashing values in joins/sets. */
export declare function vkey(v: unknown): string;
/** Total-ish order over JS values (numbers, strings, Dates, booleans). */
export declare function compareJs(a: unknown, b: unknown): number;
/** A resolved sort key: which column, which direction, where empties go. */
export interface SortKey {
    col: number;
    dir: 1 | -1;
    emptyLast: boolean;
}
/** Resolve order specs into {@link SortKey}s; `col` names each spec's column. */
export declare function sortKeys<T extends {
    dir: "asc" | "desc";
    empty?: "first" | "last";
}>(order: readonly T[], col: (o: T) => number): SortKey[];
/**
 * One sort key's verdict on two cells: direction applied, null/undefined
 * placed by `empty` in *both* directions. This is the comparison
 * {@link sortRows} sorts by, and the one `:after` seeks with — the cursor
 * boundary has to sit exactly where the sort put the row.
 */
export declare function compareCells(x: unknown, y: unknown, k: SortKey): number;
/**
 * Stable in-place sort. Mixed types get a deterministic total order (numbers
 * before strings before booleans before instants before the rest — see
 * {@link compareJs}); null/undefined are placed by `empty` in *both*
 * directions, so `:desc` does not float missing values to the top. Ties fall
 * through to the remaining keys and then to the incoming row order.
 */
export declare function sortRows(rows: unknown[][], keys: readonly SortKey[]): void;
export declare const PREDICATES: Record<string, QueryFn>;
export declare const FUNCTIONS: Record<string, QueryFn>;
export type AggFn = (values: unknown[], ...consts: unknown[]) => unknown;
export declare const AGGREGATES: Record<string, AggFn>;
//# sourceMappingURL=builtins.d.ts.map