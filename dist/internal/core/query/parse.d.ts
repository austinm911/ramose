/**
 * Query / pull-pattern parsing: EDN strings or JS forms → AST.
 *
 * JS form mirrors EDN structurally:
 *   { find: ["?e", ["count", "?x"]], in: ["$", "?name"], where: [["?e", ":user/name", "?name"], [[">", "?x", 5]]] }
 * Strings beginning with '?' are variables, '_' is blank, strings beginning
 * with ':' are keywords (attribute idents / enum values); wrap other strings
 * that happen to look like that in `{ const: "..." }`.
 */
import { type Clause, type PullPattern, type Query, type Term } from "./ast.ts";
export declare class QueryParseError extends Error {
}
export declare function toTerm(x: unknown): Term;
export declare function toClause(form: unknown): Clause;
export declare function parseQuery(form: unknown): Query;
export declare function parsePullPattern(form: unknown): PullPattern;
//# sourceMappingURL=parse.d.ts.map