export type QueryFn = (...args: any[]) => unknown;
export declare function vkey(v: unknown): string;
export declare function compareJs(a: unknown, b: unknown): number;
export interface SortKey {
    col: number;
    dir: 1 | -1;
    emptyLast: boolean;
}
export declare function sortKeys<T extends {
    dir: "asc" | "desc";
    empty?: "first" | "last";
}>(order: readonly T[], col: (o: T) => number): SortKey[];
export declare function compareCells(x: unknown, y: unknown, k: SortKey): number;
export declare function sortRows(rows: unknown[][], keys: readonly SortKey[]): void;
export declare const PREDICATES: Record<string, QueryFn>;
export declare const FUNCTIONS: Record<string, QueryFn>;
export type AggFn = (values: unknown[], ...consts: unknown[]) => unknown;
export declare const AGGREGATES: Record<string, AggFn>;
//# sourceMappingURL=builtins.d.ts.map