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