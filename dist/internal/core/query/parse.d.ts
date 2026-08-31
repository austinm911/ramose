import { type Clause, type PullPattern, type Query, type Term } from "./ast.ts";
export declare class QueryParseError extends Error {
}
export declare function toTerm(x: unknown): Term;
export declare function toClause(form: unknown): Clause;
export declare function parseQuery(form: unknown): Query;
export declare function parsePullPattern(form: unknown): PullPattern;
//# sourceMappingURL=parse.d.ts.map