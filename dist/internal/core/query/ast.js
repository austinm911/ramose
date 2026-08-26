/**
 * Datalog query AST. The engine is AST-first: `parseQuery` turns EDN strings
 * or JS-form objects into this shape, and callers may build it directly.
 */
// --- pull -------------------------------------------------------------------
/**
 * Comparison operators a nested pull `:where` understands. The names are the
 * engine's builtin predicate names (`PREDICATES` in builtins.ts) so the same
 * client lowering serves both places:
 *
 *   `=` `!=` `<` `<=` `>` `>=`  — compare the element's value(s) to `value`
 *   `in`                        — `value` is an array; membership by identity
 *   `starts-with?` `ends-with?` `includes?`  — string tests, `value` is the needle
 *   `re-find?` `re-matches?`    — `value` is a regex *source string* (no flags)
 *   `exists` `missing`          — the path has (no) value at all; `value` unused
 *
 * Every operator except `exists`/`missing` is existential over the values the
 * path reaches: it holds when *some* value satisfies it, and never holds when
 * the path reaches nothing (so `!=` means "has a value, and it differs").
 */
export const PULL_ELEM_OPS = [
    "=",
    "!=",
    "<",
    "<=",
    ">",
    ">=",
    "in",
    "starts-with?",
    "ends-with?",
    "includes?",
    "re-find?",
    "re-matches?",
    "exists",
    "missing",
];
/** Stamp `origin` through a clause tree (rule expansion inherits the call's origin). */
export function stampOrigin(c, origin) {
    switch (c.kind) {
        case "not":
            return { ...c, origin, clauses: c.clauses.map((x) => stampOrigin(x, origin)) };
        case "or":
            return { ...c, origin, branches: c.branches.map((b) => b.map((x) => stampOrigin(x, origin))) };
        default:
            return c.origin === origin ? c : { ...c, origin };
    }
}
export function isVar(t) {
    return t.kind === "var";
}
export function v(name) {
    return { kind: "var", name };
}
export function c(value) {
    return { kind: "const", value };
}
export const blank = { kind: "blank" };
//# sourceMappingURL=ast.js.map