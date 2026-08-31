import { $, seededPath } from "./path.js";
import { isAuthPath, isEntityTarget, isPathCarrier, isTraitTarget, READ_RULE_TAG, } from "./types.js";
const resolveExpr = (target, expr) => {
    if (typeof expr !== "function" || isAuthPath(expr))
        return expr;
    if (isEntityTarget(target) || isTraitTarget(target)) {
        return expr($(target));
    }
    if (isPathCarrier(target)) {
        return expr(seededPath(target));
    }
    return expr($({ fields: {} }));
};
const ruleOf = (target, kind, expr) => ({
    _tag: READ_RULE_TAG,
    target,
    kind,
    expr,
});
const builder = (target) => ({
    when: (expr) => ruleOf(target, "allow", resolveExpr(target, expr)),
    deny: (expr) => ruleOf(target, "deny", resolveExpr(target, expr)),
});
export function read(target) {
    return builder(target);
}
//# sourceMappingURL=read.js.map