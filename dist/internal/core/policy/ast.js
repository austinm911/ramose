/** The compiled policy AST: plain, versioned JSON. Reads attach to attributes / namespaces; writes attach to named operations. Nothing matching = deny. */
/** Current wire version: fragment arms + a query `rules` section. */
export const POLICY_VERSION = 2;
/** Expression-arm policies compiled before fragment rules. Still parsed. */
export const POLICY_LEGACY_VERSION = 1;
/** Max nesting of `ref` arrows in one v1 expression. */
export const MAX_REF_DEPTH = 3;
export const POLICY_OPS = ["read"];
/** Denial / toast spelling. Write verbs are gone; the name is kept for read denials. */
export const publicPolicyOp = (op) => op;
export const isRuleArm = (arm) => "rule" in arm;
/**
 * True when `expr` reads the entity (`eq` / `ref`, or a composite that
 * contains one). Class / const folds are session-constant and do not
 * need a resolved `on` target.
 */
export function exprNeedsTarget(expr) {
    switch (expr._tag) {
        case "const":
        case "class":
            return false;
        case "eq":
        case "ref":
            return true;
        case "not":
            return exprNeedsTarget(expr.expr);
        case "and":
        case "or":
            return expr.exprs.some(exprNeedsTarget);
    }
}
/**
 * True when an arm needs a resolved `on` target: a named v2 rule, or a
 * v1 expression that reads the entity. `rule: true` is the class-only
 * (public) fragment and does not.
 */
export function armNeedsTarget(arm) {
    if (isRuleArm(arm))
        return arm.rule !== true;
    return exprNeedsTarget(arm.expr);
}
/**
 * Wire / unparsed form of {@link armNeedsTarget}. Used by the Server
 * deploy check, which inspects `RAMOSE_POLICY` JSON without requiring a
 * fully valid policy document.
 */
export function wireArmNeedsTarget(arm) {
    if (arm == null || typeof arm !== "object" || Array.isArray(arm))
        return false;
    const o = arm;
    if ("rule" in o)
        return o.rule !== true;
    if ("expr" in o)
        return wireExprNeedsTarget(o.expr);
    return false;
}
const wireExprNeedsTarget = (expr) => {
    if (expr == null || typeof expr !== "object" || Array.isArray(expr))
        return false;
    const o = expr;
    switch (o._tag) {
        case "const":
        case "class":
            return false;
        case "eq":
        case "ref":
            return true;
        case "not":
            return wireExprNeedsTarget(o.expr);
        case "and":
        case "or":
            return Array.isArray(o.exprs) && o.exprs.some(wireExprNeedsTarget);
        default:
            return false;
    }
};
/** True when any arm in a wire `operations` entry needs an `on` target. */
export function wireOperationNeedsTarget(arms) {
    return Array.isArray(arms) && arms.some(wireArmNeedsTarget);
}
// ---------------------------------------------------------------------------
// Constructors (small; alchemy's typed combinators lower to these)
// ---------------------------------------------------------------------------
export const PolicyAst = {
    const: (value) => ({ _tag: "const", value }),
    class: (c) => ({ _tag: "class", class: c }),
    eq: (attr, operand) => ({ _tag: "eq", attr, operand }),
    ref: (attr, target) => ({ _tag: "ref", attr, target }),
    and: (...exprs) => ({ _tag: "and", exprs }),
    or: (...exprs) => ({ _tag: "or", exprs }),
    not: (expr) => ({ _tag: "not", expr }),
    allow: (expr) => ({ _tag: "allow", expr }),
    deny: (expr) => ({ _tag: "deny", expr }),
    principal: { _tag: "principal" },
    claim: (...path) => ({ _tag: "claim", path }),
    lit: (value) => ({ _tag: "lit", value }),
};
/** ":doc/title" → "doc"; undefined when the ident has no namespace. */
export function nsPrefix(ident) {
    const start = ident[0] === ":" ? 1 : 0;
    const slash = ident.lastIndexOf("/");
    return slash > start ? ident.slice(start, slash) : undefined;
}
// ---------------------------------------------------------------------------
// Runtime validation
// ---------------------------------------------------------------------------
export class PolicyParseError extends Error {
    constructor(message) {
        super(message);
        this.name = "PolicyParseError";
    }
}
function fail(path, msg) {
    throw new PolicyParseError(`policy${path}: ${msg}`);
}
function obj(x, path) {
    if (typeof x !== "object" || x === null || Array.isArray(x))
        fail(path, `expected an object, got ${describe(x)}`);
    return x;
}
function describe(x) {
    if (x === null)
        return "null";
    if (Array.isArray(x))
        return "an array";
    return typeof x;
}
function attrIdent(x, path) {
    if (typeof x !== "string" || x[0] !== ":")
        fail(path, `expected an attribute ident like ":user/sub", got ${JSON.stringify(x)}`);
    return x;
}
function parseOperand(x, path) {
    const o = obj(x, path);
    switch (o._tag) {
        case "principal":
            return { _tag: "principal" };
        case "claim": {
            if (!Array.isArray(o.path) || o.path.length === 0 || o.path.some((k) => typeof k !== "string")) {
                fail(path + ".path", "expected a non-empty array of strings");
            }
            return { _tag: "claim", path: o.path.slice() };
        }
        case "lit":
            if (!("value" in o))
                fail(path, "lit operand needs a `value`");
            return { _tag: "lit", value: o.value };
        default:
            fail(path, `unknown operand _tag ${JSON.stringify(o._tag)} (principal | claim | lit)`);
    }
}
function parseExpr(x, path, classes, refDepth) {
    const o = obj(x, path);
    switch (o._tag) {
        case "const":
            if (typeof o.value !== "boolean")
                fail(path + ".value", "expected a boolean");
            return { _tag: "const", value: o.value };
        case "class": {
            if (typeof o.class !== "string")
                fail(path + ".class", "expected a string");
            if (!classes.has(o.class))
                fail(path + ".class", `${JSON.stringify(o.class)} is not a declared class`);
            return { _tag: "class", class: o.class };
        }
        case "eq":
            return { _tag: "eq", attr: attrIdent(o.attr, path + ".attr"), operand: parseOperand(o.operand, path + ".operand") };
        case "ref": {
            if (refDepth + 1 > MAX_REF_DEPTH)
                fail(path, `ref nesting exceeds depth ${MAX_REF_DEPTH}`);
            return {
                _tag: "ref",
                attr: attrIdent(o.attr, path + ".attr"),
                target: parseExpr(o.target, path + ".target", classes, refDepth + 1),
            };
        }
        case "and":
        case "or": {
            if (!Array.isArray(o.exprs) || o.exprs.length === 0)
                fail(path + ".exprs", "expected a non-empty array");
            const exprs = o.exprs.map((e, i) => parseExpr(e, `${path}.exprs[${i}]`, classes, refDepth));
            return o._tag === "and" ? { _tag: "and", exprs } : { _tag: "or", exprs };
        }
        case "not":
            return { _tag: "not", expr: parseExpr(o.expr, path + ".expr", classes, refDepth) };
        default:
            fail(path, `unknown expr _tag ${JSON.stringify(o._tag)}`);
    }
}
function parseExprArm(x, path, classes) {
    const a = obj(x, path);
    if (a._tag !== "allow" && a._tag !== "deny") {
        fail(`${path}._tag`, `expected "allow" or "deny", got ${JSON.stringify(a._tag)}`);
    }
    return { _tag: a._tag, expr: parseExpr(a.expr, `${path}.expr`, classes, 0) };
}
function parseRuleArm(x, path, classes, ruleNames) {
    const a = obj(x, path);
    if (a._tag !== "allow") {
        fail(`${path}._tag`, `expected "allow", got ${JSON.stringify(a._tag)}`);
    }
    if (a.rule !== true && typeof a.rule !== "string") {
        fail(`${path}.rule`, `expected true or a rule name, got ${JSON.stringify(a.rule)}`);
    }
    if (typeof a.rule === "string") {
        if (a.rule.length === 0)
            fail(`${path}.rule`, "rule name must not be empty");
        if (!ruleNames.has(a.rule))
            fail(`${path}.rule`, `${JSON.stringify(a.rule)} is not in rules`);
    }
    let gate;
    if (a.class !== undefined) {
        if (!Array.isArray(a.class) || a.class.length === 0 || a.class.some((c) => typeof c !== "string")) {
            fail(`${path}.class`, "expected a non-empty array of class names");
        }
        gate = a.class.slice();
        for (const c of gate) {
            if (!classes.has(c))
                fail(`${path}.class`, `${JSON.stringify(c)} is not a declared class`);
        }
    }
    return gate === undefined
        ? { _tag: "allow", rule: a.rule }
        : { _tag: "allow", class: gate, rule: a.rule };
}
function parseRules(x, path, classes, version, ruleNames) {
    const o = obj(x, path);
    const out = {};
    for (const [op, arms] of Object.entries(o)) {
        if (!POLICY_OPS.includes(op)) {
            fail(`${path}.${op}`, `unknown op (${POLICY_OPS.join(" | ")})`);
        }
        if (!Array.isArray(arms))
            fail(`${path}.${op}`, "expected an array of arms");
        out[op] = arms.map((arm, i) => version === 1
            ? parseExprArm(arm, `${path}.${op}[${i}]`, classes)
            : parseRuleArm(arm, `${path}.${op}[${i}]`, classes, ruleNames));
    }
    return out;
}
function parseRuleNames(rules, path) {
    const names = new Set();
    for (let i = 0; i < rules.length; i++) {
        const def = rules[i];
        if (!Array.isArray(def) || def.length === 0 || !Array.isArray(def[0])) {
            fail(`${path}[${i}]`, "expected a rule definition [[name, ?arg…], clause…]");
        }
        const name = def[0][0];
        if (typeof name !== "string" || name.length === 0) {
            fail(`${path}[${i}][0][0]`, "expected a rule name");
        }
        names.add(name);
    }
    return names;
}
/** Decode + validate a compiled policy. Throws `PolicyParseError` when bad. */
export function parsePolicy(json) {
    const o = obj(json, "");
    if (o.version !== POLICY_VERSION && o.version !== POLICY_LEGACY_VERSION) {
        fail(".version", `expected ${POLICY_LEGACY_VERSION} or ${POLICY_VERSION}, got ${JSON.stringify(o.version)}`);
    }
    const version = o.version;
    const principal = attrIdent(o.principal, ".principal");
    if (!Array.isArray(o.classes) || o.classes.length === 0 || o.classes.some((c) => typeof c !== "string")) {
        fail(".classes", "expected a non-empty array of strings");
    }
    const classes = o.classes.slice();
    if (new Set(classes).size !== classes.length)
        fail(".classes", "duplicate class");
    const classSet = new Set(classes);
    let superuser;
    if (o.superuser !== undefined) {
        if (typeof o.superuser !== "string" || o.superuser.length === 0) {
            fail(".superuser", "expected a declared class name");
        }
        if (!classSet.has(o.superuser)) {
            fail(".superuser", `${JSON.stringify(o.superuser)} is not a declared class`);
        }
        superuser = o.superuser;
    }
    let schemaClasses;
    if (o.schemaClasses !== undefined) {
        if (!Array.isArray(o.schemaClasses) ||
            o.schemaClasses.length === 0 ||
            o.schemaClasses.some((c) => typeof c !== "string" || c.length === 0)) {
            fail(".schemaClasses", "expected a non-empty array of class names");
        }
        schemaClasses = o.schemaClasses.slice();
        if (new Set(schemaClasses).size !== schemaClasses.length)
            fail(".schemaClasses", "duplicate class");
        for (const c of schemaClasses) {
            if (!classSet.has(c))
                fail(".schemaClasses", `${JSON.stringify(c)} is not a declared class`);
        }
    }
    else if (superuser !== undefined) {
        schemaClasses = [superuser];
    }
    let ruleDefs;
    let ruleNames = new Set();
    if (o.rules !== undefined) {
        if (version === 1)
            fail(".rules", "rules are a version-2 field");
        if (!Array.isArray(o.rules))
            fail(".rules", "expected an array of rule definitions");
        ruleDefs = o.rules;
        ruleNames = parseRuleNames(ruleDefs, ".rules");
    }
    const attrsIn = obj(o.attrs ?? {}, ".attrs");
    const attrs = {};
    for (const [ident, rules] of Object.entries(attrsIn)) {
        attrs[attrIdent(ident, `.attrs["${ident}"]`)] = parseRules(rules, `.attrs["${ident}"]`, classSet, version, ruleNames);
    }
    let ns;
    if (o.ns !== undefined && o.ns !== null) {
        ns = {};
        for (const [prefix, rules] of Object.entries(obj(o.ns, ".ns"))) {
            if (prefix.length === 0 || prefix.includes(":") || prefix.includes("/")) {
                fail(`.ns["${prefix}"]`, "expected a bare namespace prefix like \"doc\"");
            }
            ns[prefix] = parseRules(rules, `.ns["${prefix}"]`, classSet, version, ruleNames);
        }
    }
    if (o.preset !== undefined) {
        fail(".preset", "preset is gone — write who-did-this fields from op.principal");
    }
    let operations;
    if (o.operations !== undefined && o.operations !== null) {
        operations = {};
        for (const [name, arms] of Object.entries(obj(o.operations, ".operations"))) {
            if (typeof name !== "string" || name.length === 0) {
                fail(`.operations`, "expected a non-empty operation name");
            }
            if (!Array.isArray(arms))
                fail(`.operations["${name}"]`, "expected an array of arms");
            operations[name] = arms.map((arm, i) => version === 1
                ? parseExprArm(arm, `.operations["${name}"][${i}]`, classSet)
                : parseRuleArm(arm, `.operations["${name}"][${i}]`, classSet, ruleNames));
        }
    }
    return {
        version,
        principal,
        classes,
        ...(superuser !== undefined ? { superuser } : {}),
        ...(schemaClasses !== undefined ? { schemaClasses } : {}),
        claims: o.claims,
        attrs,
        ns,
        ...(operations !== undefined ? { operations } : {}),
        ...(ruleDefs !== undefined ? { rules: ruleDefs } : {}),
    };
}
//# sourceMappingURL=ast.js.map