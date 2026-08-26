/**
 * Typed policy authoring. The document is head/body shaped like `Query.q`:
 * the head's `principal` attr derives `me`, and every arm is a fragment
 * (or `true`, or an OR of fragments) contextually checked against that
 * token. Combinators lower to named query rules at compile; every check
 * is deploy-time.
 */
import * as Schema from "effect/Schema";
import { parseQuery } from "../internal/core/query/parse.js";
import { POLICY_VERSION, parsePolicy, wireOperationNeedsTarget } from "../internal/core/policy/ast.js";
import { POLICY_OPS } from "../internal/core/policy/ast.js";
import { isAttrRef } from "./attrRef.js";
import { isOptionalField } from "./Field.js";
import { roleIdentOf } from "../internal/core/policy/provision.js";
import { inferDbValueType } from "./valueTypes.js";
import { inspectPullField, isAgain, isAllShape } from "./Pull.js";
import { Q, lowerQueryObject, q, rule, } from "./query/index.js";
import { PolicyError } from "./SchemaErrors.js";
export { PolicyError };
export const PUBLIC_POLICY_OPS = ["read"];
const fail = (message, ident, cause) => {
    throw new PolicyError({ message: `ramose/policy: ${message}`, ident, cause });
};
const attrsProxy = () => new Proxy({}, {
    get: (_t, key) => typeof key === "string"
        ? { _tag: "claim", path: ["attrs", key] }
        : undefined,
});
const claimAccess = () => ({
    sub: { _tag: "claim", path: ["sub"] },
    iss: { _tag: "claim", path: ["iss"] },
    aud: { _tag: "claim", path: ["aud"] },
    exp: { _tag: "claim", path: ["exp"] },
    attrs: attrsProxy(),
});
/** `P.claim.sub`, `P.claim.attrs.org`. */
export const claim = claimAccess();
/** Same accessor with `attrs` keyed by a claims struct: `P.claimOf(S).attrs.org`. */
export const claimOf = (_struct) => claimAccess();
/** The principal's resolved entity id — a claim-style operand, not a rule. */
export const principal = { _tag: "principal" };
const identOf = (a) => {
    if (!isAttrRef(a))
        fail(`expected an attribute ref, got ${String(a)}`);
    return a.ident;
};
const isClassGate = (v) => (typeof v === "object" || typeof v === "function") &&
    v !== null &&
    v._tag === "ClassGate";
const isClassConfig = (v) => typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !isClassGate(v) &&
    "class" in v &&
    v._tag !== "AttrRule";
/**
 * JWT class gate. `P.class("member")` is a public arm for that class;
 * `P.class("member")(frag)` / `{ class: "member", rule: frag }` compose
 * the gate with a fragment. Checked before the rule runs; never an
 * expression.
 */
export const classFn = (...classes) => {
    if (classes.length === 0)
        fail("P.class needs at least one class name");
    for (const c of classes) {
        if (typeof c !== "string" || c.length === 0)
            fail("P.class names must be non-empty strings");
    }
    const apply = ((arm) => ({
        _tag: "ClassGate",
        classes,
        arm,
    }));
    return Object.assign(apply, { _tag: "ClassGate", classes, arm: true });
};
export { classFn as class };
/** Field rule; narrows (ANDs with) its entity rule. Only `read` arms. */
export const field = (a, rules) => ({
    _tag: "AttrRule",
    attr: identOf(a),
    rules,
});
// ── compile fragments → named rules ────────────────────────────────────────
const catalogIdents = (schema) => {
    const out = new Set();
    for (const ns of Object.values(schema.entities)) {
        for (const ident of entityFieldIdents(ns))
            out.add(ident);
    }
    return out;
};
/** Stamped idents on `entity.fields` — not `:${ns}/${key}`, so trait fields count. */
const entityFieldIdents = (entity) => {
    const out = new Set();
    for (const field of Object.values(entity.fields)) {
        if (typeof field?.ident === "string")
            out.add(field.ident);
    }
    return out;
};
const IDENT_RE = /^:[^/]+\/[^/]+$/;
const walkIdents = (x, visit) => {
    if (typeof x === "string") {
        if (IDENT_RE.test(x))
            visit(x);
        return;
    }
    if (Array.isArray(x)) {
        for (const y of x)
            walkIdents(y, visit);
    }
};
const isFragFn = (v) => typeof v === "function" && !isClassGate(v);
const asClassList = (c, where) => {
    const list = typeof c === "string" ? [c] : [...c];
    if (list.length === 0)
        fail(`${where}: class gate needs at least one class`);
    return list;
};
const unwrapGate = (v) => {
    if (v === true)
        return { body: true };
    if (isClassGate(v)) {
        const inner = v.arm === undefined ? true : v.arm;
        if (inner !== true && !isFragFn(inner)) {
            fail("P.class(...) wraps a fragment or true");
        }
        return { classes: v.classes, body: inner };
    }
    if (isClassConfig(v)) {
        const inner = v.rule === undefined ? true : v.rule;
        if (inner !== true && !isFragFn(inner)) {
            fail("a class gate's rule is a fragment or true");
        }
        return { classes: asClassList(v.class, "class"), body: inner };
    }
    if (isFragFn(v))
        return { body: v };
    return fail("an arm is a fragment, true, or a class gate");
};
const promote = (name, frag, where) => {
    const body = function* (me, e) {
        const produced = frag(me);
        if (typeof produced !== "function") {
            fail(`${where}: a fragment is (me) => (focus) => … — got ${typeof produced}`);
        }
        yield* produced(e);
    };
    const named = rule(name, body);
    try {
        const built = named.ensureBuilt();
        if (built.clauses.length === 0) {
            fail(`${where}: empty fragment — use true for a public arm`);
        }
    }
    catch (cause) {
        if (cause instanceof PolicyError)
            throw cause;
        fail(`${where}: ${cause instanceof Error ? cause.message : String(cause)}`, undefined, cause);
    }
    return named;
};
const lowerNamedRules = (named) => {
    if (named.length === 0)
        return [];
    const dummy = q(function* () {
        const me = Q.var();
        const e = Q.var();
        for (const r of named)
            yield* r(me, e);
        return e;
    });
    try {
        const { query } = lowerQueryObject(dummy);
        return Array.isArray(query.rules) ? query.rules : [];
    }
    catch (cause) {
        return fail(`rule lowering failed: ${cause instanceof Error ? cause.message : String(cause)}`, undefined, cause);
    }
};
const parseRuleDefs = (defs, idents, where) => {
    if (defs.length === 0)
        return [];
    let parsed;
    try {
        parsed = parseQuery({ find: ["?e"], where: [], rules: defs });
    }
    catch (cause) {
        return fail(`${where}: rule body failed query validation: ${cause instanceof Error ? cause.message : String(cause)}`, undefined, cause);
    }
    walkIdents(defs, (ident) => {
        if (ident.startsWith(":db/"))
            return;
        if (!idents.has(ident))
            fail(`${where}: ${ident} is not in the schema`, ident);
    });
    return parsed.rules ?? [];
};
const termVar = (t) => (t.kind === "var" ? t.name : undefined);
const attrIdent = (t) => t.kind === "const" && typeof t.value === "string" ? t.value : undefined;
/**
 * True when `focus` is bound as the arm entity: the e-slot of one of this
 * entity's fields (or a `:db/` / wildcard pattern), the value-slot of a
 * generating fact (a backlink / reverse ref), `ground`, or a named-rule
 * argument that is bound that way in the callee. An e-slot of a *foreign*
 * ident does not count — `[?comment :doc/owner ?me]` matches nothing.
 */
const bindsFocusAsEntity = (focus, clauses, fieldIdents, byName, visiting) => {
    for (const c of clauses) {
        switch (c.kind) {
            case "pattern": {
                if (termVar(c.v) === focus)
                    return true;
                if (termVar(c.e) === focus) {
                    const ident = attrIdent(c.a);
                    if (ident === undefined || ident.startsWith(":db/") || fieldIdents.has(ident)) {
                        return true;
                    }
                }
                break;
            }
            case "rule-call": {
                const defs = byName.get(c.name);
                if (defs === undefined)
                    break;
                for (let i = 0; i < c.args.length; i++) {
                    if (termVar(c.args[i]) !== focus)
                        continue;
                    for (const def of defs) {
                        const headVar = def.args[i];
                        if (headVar === undefined)
                            continue;
                        const key = `${def.name}\0${headVar}`;
                        if (visiting.has(key))
                            continue;
                        visiting.add(key);
                        const hit = bindsFocusAsEntity(headVar, def.clauses, fieldIdents, byName, visiting);
                        visiting.delete(key);
                        if (hit)
                            return true;
                    }
                }
                break;
            }
            case "or":
                if (c.branches.some((b) => bindsFocusAsEntity(focus, b, fieldIdents, byName, visiting))) {
                    return true;
                }
                break;
            case "fn":
                if (c.fn === "ground" && c.binding.kind === "scalar" && c.binding.var === focus) {
                    return true;
                }
                break;
            default:
                break;
        }
    }
    return false;
};
/**
 * A rule that never binds the arm's focus as that entity is a silent deny
 * (deny-by-default) or an unbound `?e` at evaluation. The check is "the
 * focus appears in a generating position that names this entity" — an
 * own-field e-slot, a reverse-ref value-slot, or a named `Query.rule`
 * that does one of those — not "this def's clauses mention an own ident".
 * A backlink arm and an arm that only invokes a named rule both bind the
 * focus without mentioning a field of the arm entity in that one def.
 */
const checkArmFocus = (parsed, ruleArmMeta) => {
    const byName = new Map();
    for (const d of parsed) {
        const list = byName.get(d.name);
        if (list)
            list.push(d);
        else
            byName.set(d.name, [d]);
    }
    for (const [name, meta] of ruleArmMeta) {
        const defs = byName.get(name);
        if (defs === undefined)
            continue;
        for (const def of defs) {
            // promote() is `rule(name, (me, e) => …)` — focus is the second head var.
            const focus = def.args[1];
            if (focus === undefined)
                continue;
            if (!bindsFocusAsEntity(focus, def.clauses, meta.fieldIdents, byName, new Set())) {
                fail(`${meta.where}: rule never binds the focus as this entity`);
            }
        }
    }
};
// ── authoring ──────────────────────────────────────────────────────────────
/**
 * Build a policy. `policy(head, arms)` is head/body shaped like `Query.q`:
 * `principal: User.sub` derives `me`, and every inline arm is checked as
 * `(me) => fragment` with `me` fully typed. Writes are the `operations:`
 * section — keys are the app registry's bindings, lowered to op names on
 * the wire. Unknown idents, undeclared classes and unknown namespace keys
 * fail here. `superuser` / `schemaClasses` are required to resolve to at
 * least one class that may install schema; `P.class(superuser)` in an arm
 * is unreachable and rejected.
 */
export function policy(head, arms) {
    if (head == null || typeof head !== "object" || head.schema == null) {
        fail("policy(head, arms) takes a head { schema, principal, classes }");
    }
    const schema = head.schema;
    if (schema._tag !== "Schema") {
        fail("head.schema must be a Ramose.Schema");
    }
    if (arms == null || typeof arms !== "object") {
        fail("policy(head, arms) takes the entity arms as its second argument");
    }
    const idents = catalogIdents(schema);
    const principalIdent = identOf(head.principal);
    if (!idents.has(principalIdent))
        fail(`principal ${principalIdent} is not in the schema`, principalIdent);
    checkPrincipalProvisioning(schema, principalIdent);
    const classes = head.classes;
    if (classes.length === 0)
        fail("classes must not be empty");
    if (new Set(classes).size !== classes.length)
        fail("duplicate class");
    const classSet = new Set(classes);
    const superuser = head.superuser;
    if (superuser !== undefined) {
        if (typeof superuser !== "string" || superuser.length === 0) {
            fail("superuser must be a declared class name");
        }
        if (!classSet.has(superuser)) {
            fail(`superuser ${JSON.stringify(superuser)} is not a declared class`);
        }
    }
    const schemaClasses = (() => {
        if (head.schemaClasses !== undefined) {
            const list = [...head.schemaClasses];
            if (list.length === 0)
                fail("schemaClasses must not be empty");
            if (new Set(list).size !== list.length)
                fail("duplicate schema class");
            for (const c of list) {
                if (!classSet.has(c))
                    fail(`schemaClasses: ${JSON.stringify(c)} is not a declared class`);
            }
            return list;
        }
        if (superuser !== undefined)
            return [superuser];
        return fail("no class can install schema — set schemaClasses or superuser");
    })();
    const checkClasses = (gate, where) => {
        if (gate === undefined)
            return;
        for (const c of gate) {
            if (!classSet.has(c))
                fail(`${where}: ${JSON.stringify(c)} is not a declared class`);
            if (superuser !== undefined && c === superuser) {
                fail(`${where}: P.class(${JSON.stringify(superuser)}) is unreachable — the superuser bypasses every rule`);
            }
        }
    };
    const pending = [];
    const seenFrags = new Map();
    const ruleArmMeta = new Map();
    let nextRule = 0;
    const compileArm = (raw, where, prefix, op, entityKey, fieldIdents) => {
        const { classes: gate, body } = unwrapGate(raw);
        checkClasses(gate, where);
        if (body === true) {
            return gate === undefined ? { rule: true } : { classes: gate, rule: true };
        }
        const byEntity = seenFrags.get(body);
        const existing = byEntity?.get(entityKey);
        const name = existing ?? `policy/${prefix}/${op}/${nextRule++}`;
        if (existing === undefined) {
            pending.push(promote(name, body, where));
            if (byEntity === undefined)
                seenFrags.set(body, new Map([[entityKey, name]]));
            else
                byEntity.set(entityKey, name);
            ruleArmMeta.set(name, { fieldIdents, where });
        }
        return gate === undefined ? { rule: name } : { classes: gate, rule: name };
    };
    const compileSpec = (spec, where, prefix, entityKey, fieldIdents) => {
        const out = {};
        for (const op of PUBLIC_POLICY_OPS) {
            const v = spec[op];
            if (v === undefined)
                continue;
            const list = Array.isArray(v) ? v : [v];
            if (list.length === 0)
                continue;
            out[op] = list.map((arm, i) => compileArm(arm, `${where}.${op}${list.length > 1 ? `[${i}]` : ""}`, prefix, op, entityKey, fieldIdents));
        }
        return out;
    };
    const REJECTED_WRITE_KEYS = new Set(["set", "remove", "delete", "create", "preset"]);
    const ns = {};
    const maskedReads = new Set();
    const body = arms;
    const operationSpec = body.operations;
    for (const [nsKey, rawSpec] of Object.entries(body)) {
        if (nsKey === "operations" || rawSpec === undefined)
            continue;
        const nsSpec = rawSpec;
        for (const key of Object.keys(nsSpec)) {
            if (REJECTED_WRITE_KEYS.has(key)) {
                fail(`ns.${nsKey}.${key}: write verbs are gone — authorize ${key} on the named operation in operations:`);
            }
        }
        const declared = schema.entities[nsKey];
        if (declared === undefined)
            fail(`ns key ${JSON.stringify(nsKey)} is not in the schema`);
        const entity = declared;
        const prefix = entity.ns;
        const where = `ns.${nsKey}`;
        const fieldIdents = entityFieldIdents(entity);
        const rules = compileSpec(nsSpec, where, prefix, prefix, fieldIdents);
        const attrs = {};
        for (const a of nsSpec.attrs ?? []) {
            if (a?._tag !== "AttrRule")
                fail(`${where}.attrs expects P.field(...)`);
            if (!idents.has(a.attr))
                fail(`${where}.attrs: ${a.attr} is not in the schema`, a.attr);
            if (!fieldIdents.has(a.attr)) {
                fail(`${where}.attrs: ${a.attr} is not a field of the ${nsKey} entity`, a.attr);
            }
            for (const key of Object.keys(a.rules)) {
                if (REJECTED_WRITE_KEYS.has(key)) {
                    fail(`${where}.attrs["${a.attr}"].${key}: attribute write arms are gone — use operations:`);
                }
            }
            const r = compileSpec(a.rules, `${where}.attrs["${a.attr}"]`, `${prefix}/${a.attr.slice(a.attr.lastIndexOf("/") + 1)}`, prefix, fieldIdents);
            attrs[a.attr] = r;
            if (r.read !== undefined)
                maskedReads.add(a.attr);
        }
        ns[nsKey] = { prefix, rules, attrs };
    }
    const compiledOps = {};
    const registry = head.operations;
    if (operationSpec !== undefined) {
        if (registry === undefined || registry._tag !== "Operations") {
            fail("operations: needs the registry on the policy head (head.operations)");
        }
        const bound = registry.operations;
        for (const [key, raw] of Object.entries(operationSpec)) {
            if (raw === undefined)
                continue;
            const operation = bound[key];
            if (operation === undefined || operation._tag !== "Operation") {
                fail(`operations.${key}: ${JSON.stringify(key)} is not a key of the registry`);
            }
            const wireName = operation.name;
            if (typeof wireName !== "string" || wireName.length === 0) {
                fail(`operations.${key}: operation has no name`);
            }
            const list = Array.isArray(raw) ? raw : [raw];
            if (list.length === 0)
                continue;
            const on = operation.on;
            const fieldIdents = on !== undefined ? entityFieldIdents(on) : new Set();
            const entityKey = on?.ns ?? `op/${wireName}`;
            compiledOps[wireName] = list.map((arm, i) => {
                const where = `operations.${key}${list.length > 1 ? `[${i}]` : ""}`;
                const { body } = unwrapGate(arm);
                if (body !== true && on === undefined) {
                    fail(`${where}: a bare (no-on) operation takes a class gate only`);
                }
                return compileArm(arm, where, `op/${wireName}`, "run", entityKey, fieldIdents);
            });
        }
    }
    const registeredNames = registry !== undefined ? [...registry.names()] : [];
    const armed = new Set(Object.keys(compiledOps));
    const unarmedOperations = registeredNames.filter((n) => !armed.has(n));
    const ruleDefs = lowerNamedRules(pending);
    const parsedRules = parseRuleDefs(ruleDefs, idents, "rules");
    checkArmFocus(parsedRules, ruleArmMeta);
    return {
        _tag: "Policy",
        schema,
        principal: principalIdent,
        classes,
        ...(superuser !== undefined ? { superuser } : {}),
        schemaClasses,
        claims: head.claims,
        ns,
        operations: compiledOps,
        unarmedOperations,
        ruleDefs,
        maskedReads,
    };
}
const claimsJson = (struct) => {
    if (struct === undefined)
        return undefined;
    try {
        return Schema.toJsonSchemaDocument(struct);
    }
    catch {
        return { keys: Object.keys(struct.fields) };
    }
};
const toWireArm = (a) => a.classes === undefined ? { _tag: "allow", rule: a.rule } : { _tag: "allow", class: a.classes, rule: a.rule };
const toWireRules = (rules) => {
    const out = {};
    for (const op of POLICY_OPS) {
        const arms = rules[op];
        if (arms)
            out[op] = arms.map(toWireArm);
    }
    return out;
};
/**
 * Lower to the compiled AST. Namespace rules are emitted once, under `ns`;
 * `attrs` carries only the attributes that narrow their namespace. Core ANDs
 * `attrs[ident][op]` with `ns[prefix][op]` and falls back to whichever side is
 * present (internal/core/policy/eval.ts#allowsOp), so an attribute inherits its
 * namespace without being named and an attribute rule is emitted alone — core
 * supplies the narrowing.
 *
 * Fragment arms compile to named query rules in `rules`; `true` is the empty
 * fragment (public) and does not emit a rule. `RAMOSE_POLICY` is a Cloudflare
 * plain-text binding capped at 5.1 kB, so only surviving read / operation
 * arms and the rules they need are serialised.
 */
const lower = (p) => {
    const attrs = {};
    const ns = {};
    for (const [nsKey, entry] of Object.entries(p.ns)) {
        const declared = p.schema.entities[nsKey];
        if (Object.keys(entry.rules).length > 0)
            ns[entry.prefix] = toWireRules(entry.rules);
        const declaredIdents = new Set(Object.keys(declared.fields).map((key) => `:${entry.prefix}/${key}`));
        for (const [ident, own] of Object.entries(entry.attrs)) {
            if (!declaredIdents.has(ident))
                fail(`ns.${nsKey}.attrs: ${ident} is not in the schema`, ident);
            const narrowed = toWireRules(own);
            if (Object.keys(narrowed).length > 0)
                attrs[ident] = narrowed;
        }
    }
    const operations = {};
    for (const [name, arms] of Object.entries(p.operations)) {
        operations[name] = arms.map(toWireArm);
    }
    return {
        version: POLICY_VERSION,
        principal: p.principal,
        classes: p.classes,
        ...(p.superuser !== undefined ? { superuser: p.superuser } : {}),
        schemaClasses: p.schemaClasses,
        claims: claimsJson(p.claims),
        attrs,
        ns,
        ...(Object.keys(operations).length > 0 ? { operations } : {}),
        ...(p.ruleDefs.length > 0 ? { rules: p.ruleDefs } : {}),
    };
};
/**
 * Deploy-time coverage: every armed name must be in the registry.
 * A named-rule or db-dependent v1 arm on a registry-bare (no-`on`) op
 * is rejected — those arms need a resolved target. Unarmed registered
 * ops are returned — they deny everyone but superuser.
 */
export const checkOperationsPolicyCoverage = (registry, armed) => {
    const names = new Set(registry.names());
    const isMap = typeof armed === "object" &&
        armed !== null &&
        !Array.isArray(armed) &&
        !(armed instanceof Set);
    const have = isMap
        ? new Set(Object.keys(armed))
        : armed instanceof Set
            ? armed
            : new Set(armed);
    for (const name of have) {
        if (!names.has(name)) {
            fail(`operations: ${JSON.stringify(name)} is not in the registry — typed keys lower to the operation's name`);
        }
    }
    if (isMap) {
        const ops = armed;
        for (const name of have) {
            const operation = registry.get(name);
            if (operation === undefined || operation.on !== undefined)
                continue;
            if (wireOperationNeedsTarget(ops[name])) {
                fail(`operations.${name}: a bare (no-on) operation takes a class gate only`);
            }
        }
    }
    return { unarmed: [...names].filter((n) => !have.has(n)).sort() };
};
const isStringField = (field) => inferDbValueType(field.schema, field.valueType) === "string";
/**
 * Fail closed at deploy: only the principal ident, a string-typed
 * `role` sibling, and optional / card-many fields are provisionable.
 * The peer writes `role` only when that attr is string-typed — a
 * required card-one non-string `role` is not provisionable. The peer
 * *may* stamp matching `ramose.attrs` at login, but those keys are
 * per-token and never guaranteed — they do not make a required field
 * provisionable. A required card-one field beyond principal + string
 * role makes first login `tx/required`. Mark those fields
 * `optional: true` (or use a schema AST that admits `undefined`).
 */
export const checkPrincipalProvisioning = (schema, principalIdent) => {
    const entity = Object.values(schema.entities).find((e) => entityFieldIdents(e).has(principalIdent));
    if (entity === undefined)
        return;
    const roleIdent = roleIdentOf(principalIdent);
    const missing = [];
    for (const field of Object.values(entity.fields)) {
        const ident = typeof field.ident === "string" ? field.ident : undefined;
        if (ident === undefined)
            continue;
        if (ident === principalIdent)
            continue;
        if (ident === roleIdent && isStringField(field))
            continue;
        if (isOptionalField(field))
            continue;
        missing.push(ident);
    }
    if (missing.length === 0)
        return;
    const listed = missing.join(", ");
    const one = missing.length === 1;
    fail(`principal entity ${entity.ns} has required field${one ? "" : "s"} the peer does not write: ${listed} — mark ${one ? "it" : "them"} optional: true or first login is tx/required`, missing[0]);
};
/**
 * `reshapePullResult` drops an entity that is missing a *required* key, so a
 * read-masked attribute pulled as required would delete the row instead of
 * redacting the field. Deploy-time error, not a printed list.
 *
 * `.orDefault(v)` is required for this purpose, deliberately: it is not a way
 * to keep the row. The masked datom comes back absent, so the default would
 * *stand in* for it — the caller reads `v` as if it were the hidden value,
 * which is worse than the `undefined` `.optional` gives them. Fail closed:
 * only `.optional` (or a card-many field, which is `[]`) passes.
 */
export const checkPulls = (p, pulls) => {
    if (p.maskedReads.size === 0)
        return;
    const walk = (pattern, where) => {
        if (pattern === null ||
            typeof pattern !== "object" ||
            Array.isArray(pattern) ||
            isAllShape(pattern) ||
            isAgain(pattern)) {
            return;
        }
        for (const [key, field] of Object.entries(pattern)) {
            const info = inspectPullField(field);
            const ident = isAttrRef(info.attr)
                ? info.attr.ident
                : typeof info.attr === "string"
                    ? info.attr
                    : undefined;
            if (ident !== undefined && p.maskedReads.has(ident) && !info.optional && !info.many) {
                fail(`${where}.${key}: ${ident} has a narrowed read rule and must be pulled as \`.optional\`` +
                    (info.hasDefault
                        ? " — `.orDefault` does not qualify: it would stand in for the redacted value"
                        : ""), ident);
            }
            if (info.nestedPattern !== undefined)
                walk(info.nestedPattern, `${where}.${key}`);
        }
    };
    pulls.forEach((pattern, i) => walk(pattern, `pulls[${i}]`));
};
/** Compile to the wire JSON. Round-tripped through core's `parsePolicy`. */
export const compile = (p, options) => {
    if (p?._tag !== "Policy")
        fail("compile() expects a policy(...) value");
    checkPrincipalProvisioning(p.schema, p.principal);
    if (options?.pulls)
        checkPulls(p, options.pulls);
    if (options?.operations !== undefined) {
        checkOperationsPolicyCoverage(options.operations, p.operations);
    }
    const compiled = lower(p);
    const json = JSON.stringify(compiled);
    try {
        parsePolicy(JSON.parse(json));
    }
    catch (cause) {
        fail(`compiled policy failed core validation: ${cause.message}`, undefined, cause);
    }
    return json;
};
//# sourceMappingURL=Policy.js.map