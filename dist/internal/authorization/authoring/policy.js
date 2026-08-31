import { reachableTraits, } from "../../../db/compose.js";
import { isOwnedOperation, OwnedOperations, } from "../../../db/Operation.js";
import { compileReadAuthorizationResult } from "./compile.js";
import { all, allow, any, contains, eq, hasClass } from "./expr.js";
import { invoke } from "./invoke.js";
import { $ } from "./path.js";
import { read } from "./read.js";
const policyOperand = (operand) => Object.freeze({
    ...operand,
    eq: (rhs) => eq(operand, rhs),
    contains: (rhs) => contains(operand, rhs),
});
const readMethods = (target, rules, callbackOwner) => {
    const builder = read(target);
    const resolve = (expr) => callbackOwner !== undefined && typeof expr === "function"
        ? expr($(callbackOwner))
        : expr;
    const allowExprs = [];
    const denyExprs = [];
    let allowIndex;
    let denyIndex;
    const append = (kind, expr) => {
        const resolved = resolve(expr);
        const exprs = kind === "allow" ? allowExprs : denyExprs;
        exprs.push(resolved);
        const combined = exprs.length === 1 ? resolved : any(...exprs);
        const rule = kind === "allow"
            ? builder.when(combined)
            : builder.deny(combined);
        const index = kind === "allow" ? allowIndex : denyIndex;
        if (index === undefined) {
            const nextIndex = rules.push(rule) - 1;
            if (kind === "allow")
                allowIndex = nextIndex;
            else
                denyIndex = nextIndex;
        }
        else {
            rules[index] = rule;
        }
    };
    return Object.freeze({
        where(expr) {
            append("allow", expr);
        },
        denyWhere(expr) {
            append("deny", expr);
        },
        always() {
            append("allow", allow);
        },
        never() {
            append("deny", allow);
        },
    });
};
const operationMethods = (target, rules) => {
    const builder = invoke(target);
    const allowExprs = [];
    const denyExprs = [];
    let allowIndex;
    let denyIndex;
    const append = (kind, expr) => {
        const exprs = kind === "allow" ? allowExprs : denyExprs;
        exprs.push(expr);
        const combined = exprs.length === 1 ? expr : any(...exprs);
        const rule = kind === "allow"
            ? builder.when(combined)
            : builder.deny(combined);
        const index = kind === "allow" ? allowIndex : denyIndex;
        if (index === undefined) {
            const nextIndex = rules.push(rule) - 1;
            if (kind === "allow")
                allowIndex = nextIndex;
            else
                denyIndex = nextIndex;
        }
        else {
            rules[index] = rule;
        }
    };
    return Object.freeze({
        where(expr) {
            append("allow", expr);
        },
        denyWhere(expr) {
            append("deny", expr);
        },
        always() {
            append("allow", allow);
        },
        never() {
            append("deny", allow);
        },
    });
};
const ownerPolicy = (owner, rules) => {
    const fields = {};
    for (const [name, field] of Object.entries(owner.fields)) {
        fields[name] = Object.freeze({ read: readMethods(field, rules, owner) });
    }
    const operations = {};
    for (const [name, operation] of Object.entries(owner[OwnedOperations] ?? {})) {
        if (isOwnedOperation(operation)) {
            operations[name] = operationMethods(operation, rules);
        }
    }
    return Object.freeze({
        read: readMethods(owner, rules, owner),
        fields: Object.freeze(fields),
        operations: Object.freeze(operations),
    });
};
const policyFor = (schema, rules) => {
    const policy = {};
    for (const [name, entity] of Object.entries(schema.entities)) {
        policy[name] = ownerPolicy(entity, rules);
    }
    const traits = reachableTraits(Object.values(schema.entities));
    for (const [name, trait] of traits) {
        policy[name] = ownerPolicy(trait, rules);
    }
    return Object.freeze(policy);
};
const sessionFor = (roles, claims) => {
    const rolePredicates = {};
    for (const role of roles)
        rolePredicates[role] = hasClass(role);
    const declaredRoles = new Set(roles);
    const claimOperands = {};
    for (const descriptor of claims) {
        claimOperands[descriptor.key] = policyOperand({
            _tag: "claim",
            key: descriptor.key,
        });
    }
    // Bind the literal before freezing. `Object.freeze`'s first overload is
    // `<T extends Function>(f: T): T`, and a literal whose only own methods are
    // shorthand can select it under a stricter `lib`/`strictFunctionTypes`
    // combination than this package's own tsconfig uses — at which point the
    // cast below is a `Function` -> `PolicySession` conversion and TS rejects it.
    // A named const gives the freeze an unambiguous object type. The cast itself
    // stays: `claimOperands` and `rolePredicates` are filled dynamically, so
    // neither satisfies the precise `ClaimOperands`/`RolePredicates` mapping.
    const session = {
        subject: policyOperand({ _tag: "subject" }),
        claims: Object.freeze(claimOperands),
        roles: Object.freeze(rolePredicates),
        hasRole: (role) => {
            if (!declaredRoles.has(role)) {
                throw new Error(`ramose/policy: undeclared role ${JSON.stringify(role)}`);
            }
            return hasClass(role);
        },
    };
    return Object.freeze(session);
};
const snapshotClaim = (descriptor) => {
    const shape = descriptor.shape._tag === "scalar"
        ? Object.freeze({ ...descriptor.shape })
        : Object.freeze({
            ...descriptor.shape,
            items: Object.freeze({ ...descriptor.shape.items }),
        });
    return Object.freeze({ ...descriptor, shape });
};
const assertPrincipalField = (schema, principal) => {
    if (principal === undefined)
        return;
    const entity = Object.values(schema.entities).find((candidate) => Object.values(candidate.fields).some((field) => field === principal));
    if (entity === undefined) {
        throw new Error("ramose/policy: principal field is not in this schema");
    }
    if (!principal.ident.startsWith(`:${entity.ns}/`)) {
        throw new Error("ramose/policy: principal field must be entity-owned");
    }
    const field = principal;
    if (field.cardinality !== "one") {
        throw new Error("ramose/policy: principal field must have cardinality one");
    }
    if (field.unique !== "strict" && field.unique !== "upsert") {
        throw new Error("ramose/policy: principal field is not unique");
    }
    if (field.valueType !== "string" && field.valueType !== "uuid") {
        throw new Error("ramose/policy: principal field must be string-compatible");
    }
};
export function collectSchemaPolicy(schema, configOrDefine, maybeDefine) {
    const config = typeof configOrDefine === "function" ? {} : configOrDefine;
    const define = typeof configOrDefine === "function" ? configOrDefine : maybeDefine;
    if (define === undefined) {
        throw new Error("ramose/policy: applyPolicy requires a policy callback");
    }
    const roles = Object.freeze([...(config.roles ?? [])]);
    const claims = Object.freeze((config.claims ?? []).map(snapshotClaim));
    assertPrincipalField(schema, config.principal);
    const rules = [];
    const callbackResult = define({
        policy: policyFor(schema, rules),
        actor: policyOperand({ _tag: "me" }),
        session: sessionFor(roles, claims),
        allOf: (first, ...rest) => all(first, ...rest),
    });
    if ((typeof callbackResult === "object" || typeof callbackResult === "function") &&
        callbackResult !== null &&
        typeof callbackResult.then === "function") {
        Object.freeze(rules);
        void Promise.resolve(callbackResult).catch(() => undefined);
        throw new Error("ramose/policy: policy callback must be synchronous");
    }
    Object.freeze(rules);
    const input = Object.freeze({
        schema,
        rules,
        classes: roles,
        claims,
        ...(config.principal === undefined
            ? {}
            : { principal: Object.freeze({ entity: config.principal }) }),
    });
    const validation = compileReadAuthorizationResult(input);
    if (validation._tag === "Failure")
        throw validation.failure;
    return input;
}
//# sourceMappingURL=policy.js.map