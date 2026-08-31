import { isSelfRefSchema, refTargetOf } from "../../../db/valueTypes.js";
import { contains, eq } from "./expr.js";
import { isPathCarrier, parseIdent, stepFromCarrier, AUTH_PATH_TAG, } from "./types.js";
class AuthPath {
    _tag = AUTH_PATH_TAG;
    steps;
    constructor(steps) {
        this.steps = steps;
    }
    eq(rhs) {
        return eq(this, rhs);
    }
    contains(rhs) {
        return contains(this, rhs);
    }
}
const fieldOf = (owner, name) => {
    if (Object.hasOwn(owner.fields, name))
        return owner.fields[name];
    if (name === "id" && isPathCarrier(owner.id))
        return owner.id;
    return undefined;
};
const nextOwner = (field, current) => {
    if (typeof field !== "object" || field === null)
        return undefined;
    const schema = field.schema;
    if (isSelfRefSchema(schema))
        return current;
    const resolve = refTargetOf(schema);
    if (resolve === undefined)
        return undefined;
    const target = resolve();
    return {
        ns: target.ns,
        fields: target.fields,
    };
};
const missingStep = (owner, name) => ({
    ident: owner.ns !== undefined ? `:${owner.ns}/${name}` : name,
    localName: name,
    reverse: false,
});
const navigate = (owner, steps) => {
    const path = new AuthPath(steps);
    const applyEq = (rhs) => path.eq(rhs);
    const target = Object.assign(applyEq, path, {
        eq: (rhs) => path.eq(rhs),
        contains: (rhs) => path.contains(rhs),
    });
    return new Proxy(target, {
        get(target, prop, receiver) {
            if (typeof prop === "string") {
                const field = fieldOf(owner, prop);
                if (field !== undefined) {
                    const step = isPathCarrier(field) ? stepFromCarrier(field) : missingStep(owner, prop);
                    const next = isPathCarrier(field) ? (nextOwner(field, owner) ?? { fields: {} }) : { fields: {} };
                    return navigate(next, [...steps, step]);
                }
            }
            if (prop === "eq" || prop === "contains" || prop === "_tag" || prop === "steps") {
                return Reflect.get(target, prop, receiver);
            }
            if (prop === "then" || prop === "toJSON")
                return undefined;
            if (typeof prop !== "string")
                return undefined;
            return navigate(owner.ns !== undefined ? { ns: owner.ns, fields: {} } : { fields: {} }, [...steps, missingStep(owner, prop)]);
        },
        apply(_t, _this, args) {
            if (steps.length === 0) {
                return { _tag: "eq" };
            }
            return path.eq(args[0]);
        },
    });
};
export const $ = (root) => navigate({
    ns: root.ns,
    fields: root.fields,
    id: root.id,
}, []);
const hopToSteps = (hop) => {
    if (hop instanceof AuthPath || hop._tag === AUTH_PATH_TAG) {
        return hop.steps;
    }
    if (isPathCarrier(hop))
        return [stepFromCarrier(hop)];
    return [
        {
            ident: "",
            localName: "",
            reverse: false,
        },
    ];
};
export const path = (...hops) => {
    const steps = [];
    for (const hop of hops) {
        steps.push(...hopToSteps(hop));
    }
    return new AuthPath(steps);
};
export const seededPath = (field) => {
    const parsed = parseIdent(field.ident);
    const ownerFromField = parsed === undefined ? { fields: {} } : { ns: parsed.ns, fields: {} };
    return navigate(nextOwner(field, ownerFromField) ?? { fields: {} }, [stepFromCarrier(field)]);
};
//# sourceMappingURL=path.js.map