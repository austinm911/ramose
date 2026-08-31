import { INVOKE_RULE_TAG } from "./types.js";
const ruleOf = (target, kind, expr) => ({ _tag: INVOKE_RULE_TAG, target, kind, expr });
export const invoke = (target) => ({
    when: (expr) => ruleOf(target, "allow", expr),
    deny: (expr) => ruleOf(target, "deny", expr),
});
//# sourceMappingURL=invoke.js.map